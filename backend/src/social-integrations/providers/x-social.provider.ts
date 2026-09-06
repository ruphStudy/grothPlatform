import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { SocialCapabilityUnsupportedError, SocialProviderError } from '../errors/social.errors';
import type {
  BuildAuthorizationUrlInput,
  BuildAuthorizationUrlResult,
  ExchangeAuthorizationCodeInput,
  GetPostStatusInput,
  GetProfileInput,
  RefreshAccessTokenInput,
  SocialAuthResult,
  SocialPlatform,
  SocialPostStatusResult,
  SocialProfile,
  SocialProviderCapabilities,
  SocialPublishRequest,
  SocialPublishResult,
} from '../types/social.types';
import { getJson, getJsonWithStatus, postForm, postJson } from './social-oauth-http.util';
import type { SocialProvider } from './social-provider.interface';

const AUTHORIZATION_URL = 'https://twitter.com/i/oauth2/authorize';
const TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';
const USERS_ME_URL = 'https://api.twitter.com/2/users/me?user.fields=profile_image_url,username';
const TWEETS_URL = 'https://api.twitter.com/2/tweets';
// 19B adds tweet.write — the minimum scope posting/thread publishing
// actually requires; still no media-upload scope (least privilege).
const DEFAULT_SCOPES = ['users.read', 'tweet.write', 'offline.access'];
const CODE_VERIFIER_BYTES = 32;

interface XTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

interface XUsersMeResponse {
  data?: {
    id?: string;
    name?: string;
    username?: string;
    profile_image_url?: string;
  };
}

interface XTweetResponse {
  data?: { id?: string };
}

// X's OAuth 2.0 authorization-code flow requires PKCE (S256). The
// code_verifier is generated here and handed back to the caller (via
// BuildAuthorizationUrlResult) so it can be persisted server-side in the
// OAuth state record — it is never placed in the browser-visible state or
// query string, and never leaves this adapter boundary otherwise.
@Injectable()
export class XSocialProvider implements SocialProvider {
  readonly platform: SocialPlatform = 'x';
  readonly name = 'x';

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return !!this.configService.get<string>('X_CLIENT_ID') && !!this.configService.get<string>('X_CLIENT_SECRET');
  }

  getCapabilities(): SocialProviderCapabilities {
    // 19B implements text-only single/thread posting; image/video
    // publishing (which needs a separate media-upload endpoint) is not
    // implemented and must not be advertised. 19F: GET /2/tweets/:id is
    // genuinely implemented below.
    return { connectAccount: true, refreshToken: true, publishText: true, publishImage: false, publishVideo: false, fetchProfile: true, fetchPostStatus: true, accountDiscovery: false };
  }

  buildAuthorizationUrl(input: BuildAuthorizationUrlInput): BuildAuthorizationUrlResult {
    const codeVerifier = randomBytes(CODE_VERIFIER_BYTES).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.configService.get<string>('X_CLIENT_ID') ?? '',
      redirect_uri: this.configService.get<string>('X_REDIRECT_URI') ?? input.redirectUri,
      state: input.state,
      scope: (input.scopes ?? this.getConfiguredScopes()).join(' '),
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    return { url: `${AUTHORIZATION_URL}?${params.toString()}`, codeVerifier };
  }

  async exchangeAuthorizationCode(input: ExchangeAuthorizationCodeInput): Promise<SocialAuthResult> {
    if (!input.codeVerifier) {
      throw new SocialProviderError('social_auth_failed', 'Missing PKCE code verifier for the X token exchange.');
    }
    const data = (await postForm(TOKEN_URL, {
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: this.configService.get<string>('X_REDIRECT_URI') ?? input.redirectUri,
      client_id: this.configService.get<string>('X_CLIENT_ID') ?? '',
      client_secret: this.configService.get<string>('X_CLIENT_SECRET') ?? '',
      code_verifier: input.codeVerifier,
    })) as XTokenResponse;
    return this.toAuthResult(data);
  }

  async refreshAccessToken(input: RefreshAccessTokenInput): Promise<SocialAuthResult> {
    const data = (await postForm(TOKEN_URL, {
      grant_type: 'refresh_token',
      refresh_token: input.refreshToken,
      client_id: this.configService.get<string>('X_CLIENT_ID') ?? '',
      client_secret: this.configService.get<string>('X_CLIENT_SECRET') ?? '',
    })) as XTokenResponse;
    return this.toAuthResult(data);
  }

  async getProfile(input: GetProfileInput): Promise<SocialProfile> {
    const data = (await getJson(USERS_ME_URL, input.accessToken)) as XUsersMeResponse;
    const user = data.data;
    if (!user || typeof user.id !== 'string' || user.id.length === 0) {
      throw new SocialProviderError('social_auth_failed', 'X did not return a stable account identity.');
    }
    const username = typeof user.username === 'string' ? user.username : undefined;
    return {
      externalAccountId: user.id,
      accountName: typeof user.name === 'string' ? user.name : undefined,
      username,
      avatarUrl: typeof user.profile_image_url === 'string' ? user.profile_image_url : undefined,
      // Only ever deterministically formed from a genuine returned
      // username — never fabricated when absent (item 24).
      profileUrl: username ? `https://x.com/${username}` : undefined,
    };
  }

  private async toAuthResult(data: XTokenResponse): Promise<SocialAuthResult> {
    if (typeof data.access_token !== 'string' || data.access_token.length === 0) {
      throw new SocialProviderError('social_token_exchange_failed', 'X did not return an access token.');
    }
    const accessToken = data.access_token;
    // Profile failure must abort — never persist a connection with no
    // genuine account identity (item 13/G, shared with LinkedIn).
    const profile = await this.getProfile({ accessToken });
    const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : undefined;
    return {
      platform: 'x',
      externalAccountId: profile.externalAccountId,
      accountName: profile.accountName,
      username: profile.username,
      accessToken,
      refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : undefined,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
      scopes: typeof data.scope === 'string' ? data.scope.split(' ') : undefined,
      profileUrl: profile.profileUrl,
    };
  }

  // 19B: publishes exactly one tweet per call. Thread sequencing (posting
  // several tweets, each replying to the previous) is orchestrated by the
  // caller via `input.inReplyToId` — this adapter has no thread concept of
  // its own, matching item 19's "orchestration makes multiple provider
  // calls, not the adapter."
  async publish(input: SocialPublishRequest): Promise<SocialPublishResult> {
    if (input.media) {
      throw new SocialCapabilityUnsupportedError('X image/video publishing is not supported yet — text only.');
    }
    const response = await postJson(
      TWEETS_URL,
      { text: input.text, ...(input.inReplyToId ? { reply: { in_reply_to_tweet_id: input.inReplyToId } } : {}) },
      { Authorization: `Bearer ${input.accessToken}` },
    );
    const postId = (response.body as XTweetResponse).data?.id;
    if (typeof postId !== 'string' || postId.length === 0) {
      throw new SocialProviderError('social_provider_request_failed', 'X did not return a post id.');
    }
    return { providerPostId: postId, publishedAt: new Date() };
  }

  // 19F: X's tweet-lookup API is explicit about non-existence — a 404 on
  // a previously-published tweet id is treated as a genuine confirmed
  // `deleted` (unlike Meta's Graph API, which is ambiguous on this point
  // and therefore never reports `deleted` from this codebase).
  async getPostStatus(input: GetPostStatusInput): Promise<SocialPostStatusResult> {
    const checkedAt = new Date();
    const { status, body } = await getJsonWithStatus(`${TWEETS_URL}/${input.externalPostId}`, input.accessToken);
    if (status === 200 && (body as XTweetResponse).data?.id) {
      return { providerPostId: input.externalPostId, status: 'published', providerPostUrl: `https://x.com/i/web/status/${input.externalPostId}`, checkedAt };
    }
    if (status === 404) {
      return { providerPostId: input.externalPostId, status: 'deleted', checkedAt };
    }
    if (status === 401 || status === 403) {
      return { providerPostId: input.externalPostId, status: 'unavailable', checkedAt };
    }
    return { providerPostId: input.externalPostId, status: 'unknown', checkedAt };
  }

  private getConfiguredScopes(): string[] {
    const configured = this.configService.get<string>('X_SCOPES');
    if (!configured) return DEFAULT_SCOPES;
    const scopes = configured
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return scopes.length > 0 ? scopes : DEFAULT_SCOPES;
  }
}
