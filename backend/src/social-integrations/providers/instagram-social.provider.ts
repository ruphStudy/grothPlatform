import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialProviderError } from '../errors/social.errors';
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
} from '../types/social.types';
import { buildMetaAuthorizationUrl, exchangeMetaAuthorizationCode, fetchMetaListBounded, metaGraphGet } from './meta-graph-client.util';
import type { SocialProvider } from './social-provider.interface';

// instagram_basic is required to read the linked professional account's
// profile fields; Page scopes are needed because IG professional accounts
// are only discoverable through their linked Facebook Page (item 16/18).
const DEFAULT_SCOPES = ['public_profile', 'pages_show_list', 'pages_read_engagement', 'instagram_basic'];

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
    return { connectAccount: true, refreshToken: false, publishText: false, publishImage: false, publishVideo: false, fetchProfile: true, fetchPostStatus: false, accountDiscovery: true };
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
