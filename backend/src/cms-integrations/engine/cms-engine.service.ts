import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { CmsCapabilityUnsupportedError, CmsConfigurationError, CmsProviderError } from '../errors/cms.errors';
import { CMS_PROVIDER_REGISTRY_TOKEN } from '../providers/cms-provider.tokens';
import type { CmsProvider } from '../providers/cms-provider.interface';
import type { CmsConnectionValidationResult, CmsPlatform, CmsProviderCapabilities, CmsSiteInfo, GetCmsSiteInfoInput, ValidateCmsConnectionInput } from '../types/cms.types';

/**
 * Platform-agnostic CMS engine (20A). Resolves the configured provider
 * for a platform, validates the capability the caller needs, calls the
 * provider exactly once per logical operation, and normalizes any thrown
 * error. It never persists a connection, never builds SEO metadata,
 * never fetches a ContentVersion, and never publishes/schedules anything
 * — that is later Sprint 20 territory.
 */
@Injectable()
export class CmsEngineService {
  private readonly logger = new Logger(CmsEngineService.name);

  constructor(@Inject(CMS_PROVIDER_REGISTRY_TOKEN) private readonly providers: Map<CmsPlatform, CmsProvider>) {}

  resolveProvider(platform: CmsPlatform): CmsProvider {
    const provider = this.providers.get(platform);
    if (!provider || !provider.isConfigured()) {
      throw new CmsConfigurationError(`The ${platform} CMS provider is not configured.`);
    }
    return provider;
  }

  async validateConnection(platform: CmsPlatform, input: ValidateCmsConnectionInput): Promise<CmsConnectionValidationResult> {
    const provider = this.resolveProvider(platform);
    this.assertCapability(provider, 'validateConnection');
    if (!provider.validateConnection) {
      throw new CmsCapabilityUnsupportedError(`The ${platform} provider does not support connection validation.`);
    }
    return this.callOnce(platform, () => provider.validateConnection!(input));
  }

  async getSiteInfo(platform: CmsPlatform, input: GetCmsSiteInfoInput): Promise<CmsSiteInfo> {
    const provider = this.resolveProvider(platform);
    this.assertCapability(provider, 'fetchSiteInfo');
    if (!provider.getSiteInfo) {
      throw new CmsCapabilityUnsupportedError(`The ${platform} provider does not support site info fetch.`);
    }
    return this.callOnce(platform, () => provider.getSiteInfo!(input));
  }

  private assertCapability(provider: CmsProvider, capability: keyof CmsProviderCapabilities): void {
    if (!provider.getCapabilities()[capability]) {
      throw new CmsCapabilityUnsupportedError(`The ${provider.platform} provider does not support ${capability}.`);
    }
  }

  private async callOnce<T>(platform: CmsPlatform, fn: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await fn();
      this.logOutcome(platform, Date.now() - startedAt, true);
      return result;
    } catch (err) {
      this.logOutcome(platform, Date.now() - startedAt, false);
      // A BadRequestException here is a genuine input/SSRF-safety
      // rejection (e.g. WebsiteUrlSecurityService) — it must reach the
      // caller as-is, never be laundered into a generic provider error.
      if (err instanceof CmsProviderError || err instanceof CmsCapabilityUnsupportedError || err instanceof CmsConfigurationError || err instanceof BadRequestException) {
        throw err;
      }
      throw new CmsProviderError('cms_provider_request_failed', 'The CMS provider request failed.');
    }
  }

  // Logs platform/success/latency only — never a credential, site URL
  // detail, or raw provider payload.
  private logOutcome(platform: CmsPlatform, latencyMs: number, success: boolean): void {
    this.logger.log(`platform=${platform} success=${success} latencyMs=${latencyMs}`);
  }
}
