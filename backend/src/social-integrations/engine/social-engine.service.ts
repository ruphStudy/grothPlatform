import { Inject, Injectable, Logger } from '@nestjs/common';
import { SocialCapabilityUnsupportedError, SocialConfigurationError, SocialPostStatusUnsupportedError, SocialProviderError } from '../errors/social.errors';
import { SOCIAL_PROVIDER_REGISTRY_TOKEN } from '../providers/social-provider.tokens';
import type { SocialProvider } from '../providers/social-provider.interface';
import type {
  BuildAuthorizationUrlInput,
  BuildAuthorizationUrlResult,
  DiscoverAccountCandidatesInput,
  ExchangeAuthorizationCodeInput,
  GetPostStatusInput,
  GetPostMetricsInput,
  GetProfileInput,
  RefreshAccessTokenInput,
  SocialAccountCandidate,
  SocialAuthResult,
  SocialPlatform,
  SocialPostStatusResult,
  SocialPostMetricsResult,
  SocialProfile,
  SocialProviderCapabilities,
  SocialPublishRequest,
  SocialPublishResult,
} from '../types/social.types';

/**
 * Platform-agnostic social engine (18A). Resolves the configured provider
 * for a platform, validates the capability the caller needs, calls the
 * provider exactly once, and normalizes any thrown error. It never
 * persists a connection, never fetches Campaign/Product, and never
 * publishes/schedules anything itself — that is 18B+ territory.
 */
@Injectable()
export class SocialEngineService {
  private readonly logger = new Logger(SocialEngineService.name);

  constructor(@Inject(SOCIAL_PROVIDER_REGISTRY_TOKEN) private readonly providers: Map<SocialPlatform, SocialProvider>) {}

  resolveProvider(platform: SocialPlatform): SocialProvider {
    const provider = this.providers.get(platform);
    if (!provider || !provider.isConfigured()) {
      throw new SocialConfigurationError(`The ${platform} social provider is not configured.`);
    }
    return provider;
  }

  buildAuthorizationUrl(platform: SocialPlatform, input: BuildAuthorizationUrlInput): BuildAuthorizationUrlResult {
    const provider = this.resolveProvider(platform);
    this.assertCapability(provider, 'connectAccount');
    if (!provider.buildAuthorizationUrl) {
      throw new SocialCapabilityUnsupportedError(`The ${platform} provider does not support account connection.`);
    }
    return provider.buildAuthorizationUrl(input);
  }

  async exchangeAuthorizationCode(platform: SocialPlatform, input: ExchangeAuthorizationCodeInput): Promise<SocialAuthResult> {
    const provider = this.resolveProvider(platform);
    this.assertCapability(provider, 'connectAccount');
    if (!provider.exchangeAuthorizationCode) {
      throw new SocialCapabilityUnsupportedError(`The ${platform} provider does not support account connection.`);
    }
    return this.callOnce(platform, () => provider.exchangeAuthorizationCode!(input), 'social_token_exchange_failed');
  }

  async refreshAccessToken(platform: SocialPlatform, input: RefreshAccessTokenInput): Promise<SocialAuthResult> {
    const provider = this.resolveProvider(platform);
    this.assertCapability(provider, 'refreshToken');
    if (!provider.refreshAccessToken) {
      throw new SocialCapabilityUnsupportedError(`The ${platform} provider does not support token refresh.`);
    }
    return this.callOnce(platform, () => provider.refreshAccessToken!(input), 'social_token_refresh_failed');
  }

  async getProfile(platform: SocialPlatform, input: GetProfileInput): Promise<SocialProfile> {
    const provider = this.resolveProvider(platform);
    this.assertCapability(provider, 'fetchProfile');
    if (!provider.getProfile) {
      throw new SocialCapabilityUnsupportedError(`The ${platform} provider does not support profile fetch.`);
    }
    return this.callOnce(platform, () => provider.getProfile!(input), 'social_provider_request_failed');
  }

  async discoverAccountCandidates(platform: SocialPlatform, input: DiscoverAccountCandidatesInput): Promise<SocialAccountCandidate[]> {
    const provider = this.resolveProvider(platform);
    this.assertCapability(provider, 'accountDiscovery');
    if (!provider.discoverAccountCandidates) {
      throw new SocialCapabilityUnsupportedError(`The ${platform} provider does not support account discovery.`);
    }
    return this.callOnce(platform, () => provider.discoverAccountCandidates!(input), 'social_provider_request_failed');
  }

  // 19A/19B: no single capability key gates this generically — a caller
  // needs `publishText` for LinkedIn/X/Facebook but `publishImage` for
  // Instagram, and only the publishing orchestration (which knows which
  // platform/content it's dealing with) can pick the right one. It must
  // assert that capability itself before calling this method.
  async publish(platform: SocialPlatform, input: SocialPublishRequest): Promise<SocialPublishResult> {
    const provider = this.resolveProvider(platform);
    if (!provider.publish) {
      throw new SocialCapabilityUnsupportedError(`The ${platform} provider does not support publishing.`);
    }
    return this.callOnce(platform, () => provider.publish!(input), 'social_provider_request_failed');
  }

  // 19F: a dedicated unsupported-capability error (rather than the
  // generic SocialCapabilityUnsupportedError every other method throws)
  // so callers can reliably surface the spec's normalized
  // `social_post_status_unsupported` code — checked, and thrown, strictly
  // before any provider call (item 18/23).
  async getPostStatus(platform: SocialPlatform, input: GetPostStatusInput): Promise<SocialPostStatusResult> {
    const provider = this.resolveProvider(platform);
    if (!provider.getCapabilities().fetchPostStatus || !provider.getPostStatus) {
      throw new SocialPostStatusUnsupportedError(`The ${platform} provider does not support remote status checks.`);
    }
    return this.callOnce(platform, () => provider.getPostStatus!(input), 'social_provider_request_failed');
  }

  async getPostMetrics(platform: SocialPlatform, input: GetPostMetricsInput): Promise<SocialPostMetricsResult> {
    const provider = this.resolveProvider(platform);
    if (!provider.getCapabilities().fetchPostMetrics || !provider.getPostMetrics) {
      throw new SocialCapabilityUnsupportedError(`The ${platform} provider does not support post metrics.`);
    }
    return this.callOnce(platform, () => provider.getPostMetrics!(input), 'social_provider_request_failed');
  }

  private assertCapability(provider: SocialProvider, capability: keyof SocialProviderCapabilities): void {
    if (!provider.getCapabilities()[capability]) {
      throw new SocialCapabilityUnsupportedError(`The ${provider.platform} provider does not support ${capability}.`);
    }
  }

  private async callOnce<T>(platform: SocialPlatform, fn: () => Promise<T>, fallbackCode: 'social_token_exchange_failed' | 'social_token_refresh_failed' | 'social_provider_request_failed'): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await fn();
      this.logOutcome(platform, Date.now() - startedAt, true);
      return result;
    } catch (err) {
      this.logOutcome(platform, Date.now() - startedAt, false);
      throw err instanceof SocialProviderError ? err : new SocialProviderError(fallbackCode, 'The social provider request failed.');
    }
  }

  // Logs platform/success/latency only — never a code, token, refresh
  // token, or client secret.
  private logOutcome(platform: SocialPlatform, latencyMs: number, success: boolean): void {
    this.logger.log(`platform=${platform} success=${success} latencyMs=${latencyMs}`);
  }
}
