import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialProviderError } from '../errors/social.errors';
import type {
  BuildAuthorizationUrlInput,
  ExchangeAuthorizationCodeInput,
  GetProfileInput,
  RefreshAccessTokenInput,
  SocialAuthResult,
  SocialPlatform,
  SocialProfile,
  SocialProviderCapabilities,
} from '../types/social.types';
import { getJson, postForm } from './social-oauth-http.util';
import type { SocialProvider } from './social-provider.interface';

const AUTHORIZATION_URL = 'https://twitter.com/i/oauth2/authorize';
const TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';
const USERS_ME_URL = 'https://api.twitter.com/2/users/me?user.fields=profile_image_url,username';
const DEFAULT_SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'];

// X's OAuth 2.0 authorization-code flow normally requires PKCE. This
// adapter keeps that concern local to buildAuthorizationUrl/
// exchangeAuthorizationCode — nothing above the SocialProvider interface
// needs to know about it, matching the same "no SDK details escape the
// interface" boundary as every other platform adapter.
@Injectable()
export class XSocialProvider implements SocialProvider {
  readonly platform: SocialPlatform = 'x';
  readonly name = 'x';

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return !!this.configService.get<string>('X_CLIENT_ID') && !!this.configService.get<string>('X_CLIENT_SECRET');
  }

  getCapabilities(): SocialProviderCapabilities {
    return { connectAccount: true, refreshToken: true, publishText: false, publishImage: false, publishVideo: false, fetchProfile: true, fetchPostStatus: false };
  }

  buildAuthorizationUrl(input: BuildAuthorizationUrlInput): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.configService.get<string>('X_CLIENT_ID') ?? '',
      redirect_uri: input.redirectUri,
      state: input.state,
      scope: (input.scopes ?? DEFAULT_SCOPES).join(' '),
      code_challenge: 'challenge',
      code_challenge_method: 'plain',
    });
    return `${AUTHORIZATION_URL}?${params.toString()}`;
  }

  async exchangeAuthorizationCode(input: ExchangeAuthorizationCodeInput): Promise<SocialAuthResult> {
    const data = await postForm(TOKEN_URL, {
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: this.configService.get<string>('X_CLIENT_ID') ?? '',
      client_secret: this.configService.get<string>('X_CLIENT_SECRET') ?? '',
      code_verifier: 'challenge',
    });
    return this.toAuthResult(data);
  }

  async refreshAccessToken(input: RefreshAccessTokenInput): Promise<SocialAuthResult> {
    const data = await postForm(TOKEN_URL, {
      grant_type: 'refresh_token',
      refresh_token: input.refreshToken,
      client_id: this.configService.get<string>('X_CLIENT_ID') ?? '',
      client_secret: this.configService.get<string>('X_CLIENT_SECRET') ?? '',
    });
    return this.toAuthResult(data);
  }

  async getProfile(input: GetProfileInput): Promise<SocialProfile> {
    const data = await getJson(USERS_ME_URL, input.accessToken);
    const user = (data.data ?? {}) as Record<string, unknown>;
    return {
      externalAccountId: String(user.id ?? ''),
      accountName: typeof user.name === 'string' ? user.name : undefined,
      username: typeof user.username === 'string' ? user.username : undefined,
      avatarUrl: typeof user.profile_image_url === 'string' ? user.profile_image_url : undefined,
    };
  }

  private async toAuthResult(data: Record<string, unknown>): Promise<SocialAuthResult> {
    const accessToken = data.access_token as string | undefined;
    if (!accessToken) {
      throw new SocialProviderError('social_token_exchange_failed', 'X did not return an access token.');
    }
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
    };
  }
}
