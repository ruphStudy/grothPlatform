import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialProviderError } from '../errors/social.errors';
import type {
  BuildAuthorizationUrlInput,
  BuildAuthorizationUrlResult,
  ExchangeAuthorizationCodeInput,
  GetProfileInput,
  SocialAuthResult,
  SocialPlatform,
  SocialProfile,
  SocialProviderCapabilities,
} from '../types/social.types';
import { getJson, postForm } from './social-oauth-http.util';
import type { SocialProvider } from './social-provider.interface';

const AUTHORIZATION_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';
// Identity-only (least privilege) — 18C is connection-only; a write scope
// like w_member_social is not requested until publishing actually exists.
const DEFAULT_SCOPES = ['openid', 'profile'];

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
    // isn't actually implemented (item 9/10/26/X).
    return { connectAccount: true, refreshToken: false, publishText: false, publishImage: false, publishVideo: false, fetchProfile: true, fetchPostStatus: false, accountDiscovery: false };
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
