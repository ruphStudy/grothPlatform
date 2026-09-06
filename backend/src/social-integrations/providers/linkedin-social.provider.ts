import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialCapabilityUnsupportedError, SocialProviderError } from '../errors/social.errors';
import type {
  BuildAuthorizationUrlInput,
  BuildAuthorizationUrlResult,
  ExchangeAuthorizationCodeInput,
  GetProfileInput,
  SocialAuthResult,
  SocialPlatform,
  SocialProfile,
  SocialProviderCapabilities,
  SocialPublishRequest,
  SocialPublishResult,
} from '../types/social.types';
import { getJson, postForm, postJson } from './social-oauth-http.util';
import type { SocialProvider } from './social-provider.interface';

const AUTHORIZATION_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';
const UGC_POSTS_URL = 'https://api.linkedin.com/v2/ugcPosts';
// 19B adds w_member_social — the minimum scope text post publishing
// actually requires; still no video/ads scopes (least privilege).
const DEFAULT_SCOPES = ['openid', 'profile', 'w_member_social'];

interface LinkedInTokenResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
}

interface LinkedInUserInfoResponse {
  sub?: string;
  name?: string;
  picture?: string;
}

interface LinkedInUgcPostResponse {
  id?: string;
}

@Injectable()
export class LinkedInSocialProvider implements SocialProvider {
  readonly platform: SocialPlatform = 'linkedin';
  readonly name = 'linkedin';

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return !!this.configService.get<string>('LINKEDIN_CLIENT_ID') && !!this.configService.get<string>('LINKEDIN_CLIENT_SECRET');
  }

  getCapabilities(): SocialProviderCapabilities {
    // refreshToken stays false: standard LinkedIn OIDC sign-in does not
    // return a refresh token, so this must not claim a capability that
    // isn't actually implemented (item 9/10/26/X). 19B implements text-only
    // UGC post publishing; image/video publishing is not implemented.
    // 19F: fetchPostStatus stays false too — reading back a UGC post
    // reliably requires API access this app's current OIDC+w_member_social
    // scope was never verified against; never claim a status-check
    // capability that isn't genuinely implemented.
    return { connectAccount: true, refreshToken: false, publishText: true, publishImage: false, publishVideo: false, fetchProfile: true, fetchPostStatus: false, accountDiscovery: false };
  }

  buildAuthorizationUrl(input: BuildAuthorizationUrlInput): BuildAuthorizationUrlResult {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.configService.get<string>('LINKEDIN_CLIENT_ID') ?? '',
      redirect_uri: this.configService.get<string>('LINKEDIN_REDIRECT_URI') ?? input.redirectUri,
      state: input.state,
      scope: (input.scopes ?? this.getConfiguredScopes()).join(' '),
    });
    return { url: `${AUTHORIZATION_URL}?${params.toString()}` };
  }

  async exchangeAuthorizationCode(input: ExchangeAuthorizationCodeInput): Promise<SocialAuthResult> {
    const data = (await postForm(TOKEN_URL, {
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: this.configService.get<string>('LINKEDIN_REDIRECT_URI') ?? input.redirectUri,
      client_id: this.configService.get<string>('LINKEDIN_CLIENT_ID') ?? '',
      client_secret: this.configService.get<string>('LINKEDIN_CLIENT_SECRET') ?? '',
    })) as LinkedInTokenResponse;
    if (typeof data.access_token !== 'string' || data.access_token.length === 0) {
      throw new SocialProviderError('social_token_exchange_failed', 'LinkedIn did not return an access token.');
    }
    const accessToken = data.access_token;
    // Profile failure must abort the whole exchange — never persist a
    // connection with no genuine account identity (item 13/G).
    const profile = await this.getProfile({ accessToken });
    const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : undefined;
    return {
      platform: 'linkedin',
      externalAccountId: profile.externalAccountId,
      accountName: profile.accountName,
      accessToken,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
      scopes: typeof data.scope === 'string' ? data.scope.split(' ') : undefined,
      profileUrl: profile.profileUrl,
    };
  }

  async getProfile(input: GetProfileInput): Promise<SocialProfile> {
    const data = (await getJson(USERINFO_URL, input.accessToken)) as LinkedInUserInfoResponse;
    // `sub` is LinkedIn's stable OIDC subject identifier — never derive
    // externalAccountId from email, and never fall back to an empty
    // string (item 8/13).
    if (typeof data.sub !== 'string' || data.sub.length === 0) {
      throw new SocialProviderError('social_auth_failed', 'LinkedIn did not return a stable account identity.');
    }
    return {
      externalAccountId: data.sub,
      accountName: typeof data.name === 'string' ? data.name : undefined,
      avatarUrl: typeof data.picture === 'string' ? data.picture : undefined,
    };
  }

  // 19B: text-only UGC post. `input.externalAccountId` is the LinkedIn
  // member's stable `sub` — used to build the required author URN.
  // LinkedIn's UGC Post API returns the created post id in the
  // `x-restli-id` response header rather than the JSON body; fall back to
  // a body `id` field defensively in case that ever changes.
  async publish(input: SocialPublishRequest): Promise<SocialPublishResult> {
    if (input.media) {
      throw new SocialCapabilityUnsupportedError('LinkedIn image/video publishing is not supported yet — text only.');
    }
    const response = await postJson(
      UGC_POSTS_URL,
      {
        author: `urn:li:person:${input.externalAccountId}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: input.text },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      },
      { Authorization: `Bearer ${input.accessToken}`, 'X-Restli-Protocol-Version': '2.0.0' },
    );
    const body = response.body as LinkedInUgcPostResponse;
    const postId = response.header('x-restli-id') ?? body.id;
    if (typeof postId !== 'string' || postId.length === 0) {
      throw new SocialProviderError('social_provider_request_failed', 'LinkedIn did not return a post id.');
    }
    return { providerPostId: postId, publishedAt: new Date() };
  }

  private getConfiguredScopes(): string[] {
    const configured = this.configService.get<string>('LINKEDIN_SCOPES');
    if (!configured) return DEFAULT_SCOPES;
    const scopes = configured
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return scopes.length > 0 ? scopes : DEFAULT_SCOPES;
  }
}
