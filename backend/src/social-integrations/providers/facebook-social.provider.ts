import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialCapabilityUnsupportedError, SocialProviderError } from '../errors/social.errors';
import type {
  BuildAuthorizationUrlInput,
  BuildAuthorizationUrlResult,
  DiscoverAccountCandidatesInput,
  ExchangeAuthorizationCodeInput,
  GetProfileInput,
  SocialAccountCandidate,
  SocialAuthResult,
  SocialPlatform,
  SocialProfile,
  SocialProviderCapabilities,
  SocialPublishRequest,
  SocialPublishResult,
} from '../types/social.types';
import { buildMetaAuthorizationUrl, exchangeMetaAuthorizationCode, fetchMetaListBounded, metaGraphGet, metaGraphPost } from './meta-graph-client.util';
import type { SocialProvider } from './social-provider.interface';

// 19B adds pages_manage_posts — the minimum scope Page text publishing
// actually requires; still no video/ads/insights scopes (least privilege).
const DEFAULT_SCOPES = ['public_profile', 'pages_show_list', 'pages_read_engagement', 'pages_manage_posts'];

interface FacebookFeedPostResponse {
  id?: string;
}

interface FacebookMeResponse {
  id?: string;
  name?: string;
  picture?: { data?: { url?: string } };
}

interface FacebookPageRecord {
  id?: string;
  name?: string;
  access_token?: string;
}

/**
 * 18E: Facebook connection via the shared Meta Graph client. Publishing
 * targets a Facebook Page, not the personal user identity, so
 * exchangeAuthorizationCode only produces a transient user-level token —
 * the actual persisted SocialConnection is always a discovered Page
 * (see discoverAccountCandidates and MetaAccountSelectionService, which
 * decides single-candidate auto-complete vs. a pending selection).
 */
@Injectable()
export class FacebookSocialProvider implements SocialProvider {
  readonly platform: SocialPlatform = 'facebook';
  readonly name = 'facebook';

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return !!this.configService.get<string>('META_CLIENT_ID') && !!this.configService.get<string>('META_CLIENT_SECRET');
  }

  getCapabilities(): SocialProviderCapabilities {
    // 19B: text-only Page publishing is implemented; image/video publishing
    // is not (item 23/26) — never advertise a capability this adapter
    // doesn't actually implement.
    return { connectAccount: true, refreshToken: false, publishText: true, publishImage: false, publishVideo: false, fetchProfile: true, fetchPostStatus: false, accountDiscovery: true };
  }

  buildAuthorizationUrl(input: BuildAuthorizationUrlInput): BuildAuthorizationUrlResult {
    return buildMetaAuthorizationUrl(this.configService, input, this.getConfiguredScopes());
  }

  async exchangeAuthorizationCode(input: ExchangeAuthorizationCodeInput): Promise<SocialAuthResult> {
    const { accessToken, expiresAt } = await exchangeMetaAuthorizationCode(this.configService, input);
    // Profile failure aborts the whole exchange — never persist a
    // connection with no genuine account identity (item 6/13).
    const profile = await this.getProfile({ accessToken });
    return {
      platform: 'facebook',
      externalAccountId: profile.externalAccountId,
      accountName: profile.accountName,
      accessToken,
      expiresAt,
      profileUrl: profile.profileUrl,
    };
  }

  async getProfile(input: GetProfileInput): Promise<SocialProfile> {
    // Calling /me with a Page access token returns that Page's own
    // identity — this makes getProfile work unchanged whether the stored
    // token is the personal user token (pre-selection) or a Page token
    // (a persisted, selected connection's Validate action).
    const data = (await metaGraphGet(this.configService, '/me', input.accessToken, { fields: 'id,name,picture' })) as FacebookMeResponse;
    if (typeof data.id !== 'string' || data.id.length === 0) {
      throw new SocialProviderError('social_auth_failed', 'Facebook did not return a stable account identity.');
    }
    return {
      externalAccountId: data.id,
      accountName: typeof data.name === 'string' ? data.name : undefined,
      avatarUrl: data.picture?.data?.url,
      profileUrl: `https://facebook.com/${data.id}`,
    };
  }

  async discoverAccountCandidates(input: DiscoverAccountCandidatesInput): Promise<SocialAccountCandidate[]> {
    const raw = await fetchMetaListBounded(this.configService, '/me/accounts', input.accessToken, { fields: 'id,name,access_token', limit: '25' });
    const candidates: SocialAccountCandidate[] = [];
    for (const item of raw) {
      const page = item as FacebookPageRecord;
      if (typeof page.id !== 'string' || page.id.length === 0 || typeof page.access_token !== 'string' || page.access_token.length === 0) continue;
      candidates.push({
        externalAccountId: page.id,
        accountName: typeof page.name === 'string' ? page.name : undefined,
        accountType: 'page',
        profileUrl: `https://facebook.com/${page.id}`,
        internalAccessToken: page.access_token,
      });
    }
    return candidates;
  }

  // 19B: text-only Page post. `input.externalAccountId` is the Page id
  // and `input.accessToken` is that Page's own access token (never the
  // personal user token) — both resolved server-side by the publishing
  // orchestration, never accepted from the frontend.
  async publish(input: SocialPublishRequest): Promise<SocialPublishResult> {
    if (input.media) {
      throw new SocialCapabilityUnsupportedError('Facebook image/video publishing is not supported yet — text only.');
    }
    const data = (await metaGraphPost(this.configService, `/${input.externalAccountId}/feed`, input.accessToken, { message: input.text })) as FacebookFeedPostResponse;
    if (typeof data.id !== 'string' || data.id.length === 0) {
      throw new SocialProviderError('social_provider_request_failed', 'Facebook did not return a post id.');
    }
    return { providerPostId: data.id, providerPostUrl: `https://facebook.com/${data.id}`, publishedAt: new Date() };
  }

  private getConfiguredScopes(): string[] {
    const configured = this.configService.get<string>('FACEBOOK_SCOPES');
    if (!configured) return DEFAULT_SCOPES;
    const scopes = configured
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return scopes.length > 0 ? scopes : DEFAULT_SCOPES;
  }
}
