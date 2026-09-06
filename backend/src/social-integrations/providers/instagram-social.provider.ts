import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialCapabilityUnsupportedError, SocialProviderError } from '../errors/social.errors';
import type {
  BuildAuthorizationUrlInput,
  BuildAuthorizationUrlResult,
  DiscoverAccountCandidatesInput,
  ExchangeAuthorizationCodeInput,
  GetPostStatusInput,
  GetProfileInput,
  SocialAccountCandidate,
  SocialAuthResult,
  SocialPlatform,
  SocialPostStatusResult,
  SocialProfile,
  SocialProviderCapabilities,
  SocialPublishRequest,
  SocialPublishResult,
} from '../types/social.types';
import { buildMetaAuthorizationUrl, exchangeMetaAuthorizationCode, fetchMetaListBounded, metaGraphCheckStatus, metaGraphGet, metaGraphPost } from './meta-graph-client.util';
import type { SocialProvider } from './social-provider.interface';

// instagram_basic reads the linked professional account's profile fields;
// instagram_content_publish (19B) is required for the container/publish
// flow; Page scopes are needed because IG professional accounts are only
// discoverable through their linked Facebook Page (item 16/18).
const DEFAULT_SCOPES = ['public_profile', 'pages_show_list', 'pages_read_engagement', 'instagram_basic', 'instagram_content_publish'];

interface FacebookPageRecord {
  id?: string;
  access_token?: string;
}

interface InstagramPageLinkResponse {
  instagram_business_account?: { id?: string };
}

interface InstagramAccountResponse {
  id?: string;
  username?: string;
  name?: string;
  profile_picture_url?: string;
}

interface InstagramMediaContainerResponse {
  id?: string;
}

/**
 * 18F: Instagram connection reuses the same Meta OAuth/Graph plumbing as
 * Facebook (item 19/20) — no separate app credentials, no duplicated
 * auth-URL/token-exchange code. An Instagram professional/business
 * account is only reachable through its linked Facebook Page, so
 * discovery walks the user's Pages and checks each one's
 * `instagram_business_account` link (item 16/21). A consumer-only IG
 * account (no linked Page) is never a candidate.
 */
@Injectable()
export class InstagramSocialProvider implements SocialProvider {
  readonly platform: SocialPlatform = 'instagram';
  readonly name = 'instagram';

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return !!this.configService.get<string>('META_CLIENT_ID') && !!this.configService.get<string>('META_CLIENT_SECRET');
  }

  getCapabilities(): SocialProviderCapabilities {
    // 19B: Instagram professional publishing genuinely requires media —
    // text-only publishing is never advertised/implemented for this
    // platform (item 24/26). 19F: a media-object status check via a
    // single Graph GET is genuinely implemented below.
    return { connectAccount: true, refreshToken: false, publishText: false, publishImage: true, publishVideo: false, fetchProfile: true, fetchPostStatus: true, accountDiscovery: true };
  }

  buildAuthorizationUrl(input: BuildAuthorizationUrlInput): BuildAuthorizationUrlResult {
    return buildMetaAuthorizationUrl(this.configService, input, this.getConfiguredScopes());
  }

  async exchangeAuthorizationCode(input: ExchangeAuthorizationCodeInput): Promise<SocialAuthResult> {
    const { accessToken, expiresAt } = await exchangeMetaAuthorizationCode(this.configService, input);
    // The final Instagram identity is only known after Page discovery
    // (see discoverAccountCandidates) — this transient Meta user id is
    // never what gets persisted as the connection (item 11/24).
    const data = (await metaGraphGet(this.configService, '/me', accessToken, { fields: 'id' })) as { id?: string };
    if (typeof data.id !== 'string' || data.id.length === 0) {
      throw new SocialProviderError('social_auth_failed', 'Meta did not return a stable account identity.');
    }
    return { platform: 'instagram', externalAccountId: data.id, accessToken, expiresAt };
  }

  async getProfile(input: GetProfileInput): Promise<SocialProfile> {
    const data = (await metaGraphGet(this.configService, '/me', input.accessToken, { fields: 'id,username,name,profile_picture_url' })) as InstagramAccountResponse;
    if (typeof data.id !== 'string' || data.id.length === 0) {
      throw new SocialProviderError('social_auth_failed', 'Instagram did not return a stable account identity.');
    }
    return {
      externalAccountId: data.id,
      accountName: typeof data.name === 'string' ? data.name : undefined,
      username: typeof data.username === 'string' ? data.username : undefined,
      avatarUrl: typeof data.profile_picture_url === 'string' ? data.profile_picture_url : undefined,
    };
  }

  async discoverAccountCandidates(input: DiscoverAccountCandidatesInput): Promise<SocialAccountCandidate[]> {
    const pages = await fetchMetaListBounded(this.configService, '/me/accounts', input.accessToken, { fields: 'id,access_token', limit: '25' });
    const candidates: SocialAccountCandidate[] = [];
    for (const item of pages) {
      const page = item as FacebookPageRecord;
      if (typeof page.id !== 'string' || page.id.length === 0 || typeof page.access_token !== 'string' || page.access_token.length === 0) continue;

      const link = (await metaGraphGet(this.configService, `/${page.id}`, input.accessToken, { fields: 'instagram_business_account' })) as InstagramPageLinkResponse;
      const igAccountId = link.instagram_business_account?.id;
      if (typeof igAccountId !== 'string' || igAccountId.length === 0) continue; // no linked IG account for this Page

      const igProfile = (await metaGraphGet(this.configService, `/${igAccountId}`, page.access_token, { fields: 'id,username,name,profile_picture_url' })) as InstagramAccountResponse;
      if (typeof igProfile.id !== 'string' || igProfile.id.length === 0) continue;

      candidates.push({
        externalAccountId: igProfile.id,
        accountName: typeof igProfile.name === 'string' ? igProfile.name : undefined,
        username: typeof igProfile.username === 'string' ? igProfile.username : undefined,
        avatarUrl: typeof igProfile.profile_picture_url === 'string' ? igProfile.profile_picture_url : undefined,
        // Meta's Graph API does not reliably distinguish business vs.
        // creator sub-type on this field set — 'professional' is the
        // genuinely-known bucket; never guess further (item 27).
        accountType: 'professional',
        linkedFacebookPageId: page.id,
        // IG Graph API calls for this account are authenticated with its
        // linked Page's access token, not a separate IG-specific token.
        internalAccessToken: page.access_token,
      });
    }
    return candidates;
  }

  // 19B item 24: one logical publishing action implemented as Meta's
  // required two-call container/publish protocol — create the media
  // container, then publish it. No auto-retry between the two calls; a
  // failure at either step surfaces as a single normalized failure.
  async publish(input: SocialPublishRequest): Promise<SocialPublishResult> {
    if (!input.media?.url) {
      throw new SocialCapabilityUnsupportedError('Instagram publishing requires an image with a usable URL.');
    }
    const container = (await metaGraphPost(this.configService, `/${input.externalAccountId}/media`, input.accessToken, {
      image_url: input.media.url,
      caption: input.text,
    })) as InstagramMediaContainerResponse;
    if (typeof container.id !== 'string' || container.id.length === 0) {
      throw new SocialProviderError('social_provider_request_failed', 'Instagram did not return a media container id.');
    }
    const published = (await metaGraphPost(this.configService, `/${input.externalAccountId}/media_publish`, input.accessToken, {
      creation_id: container.id,
    })) as InstagramMediaContainerResponse;
    if (typeof published.id !== 'string' || published.id.length === 0) {
      throw new SocialProviderError('social_provider_request_failed', 'Instagram did not return a published post id.');
    }
    return { providerPostId: published.id, publishedAt: new Date() };
  }

  // 19F: one Graph GET on the IG media id, authenticated with the
  // connection's linked-Page access token (the same one used to
  // publish). Same ambiguity caveat as Facebook's status check — never
  // reports `deleted`, only `published`/`unavailable`.
  async getPostStatus(input: GetPostStatusInput): Promise<SocialPostStatusResult> {
    const checkedAt = new Date();
    const check = await metaGraphCheckStatus(this.configService, input.externalPostId, input.accessToken, 'id,permalink');
    if (check.ok) {
      const url = typeof check.raw?.permalink === 'string' ? check.raw.permalink : undefined;
      return { providerPostId: input.externalPostId, status: 'published', providerPostUrl: url, checkedAt };
    }
    return { providerPostId: input.externalPostId, status: 'unavailable', checkedAt };
  }

  private getConfiguredScopes(): string[] {
    const configured = this.configService.get<string>('INSTAGRAM_SCOPES');
    if (!configured) return DEFAULT_SCOPES;
    const scopes = configured
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return scopes.length > 0 ? scopes : DEFAULT_SCOPES;
  }
}
