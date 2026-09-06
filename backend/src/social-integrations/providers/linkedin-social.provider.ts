import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialProviderError } from '../errors/social.errors';
import type {
  BuildAuthorizationUrlInput,
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
const DEFAULT_SCOPES = ['openid', 'profile', 'w_member_social'];

@Injectable()
export class LinkedInSocialProvider implements SocialProvider {
  readonly platform: SocialPlatform = 'linkedin';
  readonly name = 'linkedin';

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return !!this.configService.get<string>('LINKEDIN_CLIENT_ID') && !!this.configService.get<string>('LINKEDIN_CLIENT_SECRET');
  }

  getCapabilities(): SocialProviderCapabilities {
    return { connectAccount: true, refreshToken: false, publishText: false, publishImage: false, publishVideo: false, fetchProfile: true, fetchPostStatus: false };
  }

  buildAuthorizationUrl(input: BuildAuthorizationUrlInput): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.configService.get<string>('LINKEDIN_CLIENT_ID') ?? '',
      redirect_uri: input.redirectUri,
      state: input.state,
      scope: (input.scopes ?? DEFAULT_SCOPES).join(' '),
    });
    return `${AUTHORIZATION_URL}?${params.toString()}`;
  }

  async exchangeAuthorizationCode(input: ExchangeAuthorizationCodeInput): Promise<SocialAuthResult> {
    const data = await postForm(TOKEN_URL, {
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: this.configService.get<string>('LINKEDIN_CLIENT_ID') ?? '',
      client_secret: this.configService.get<string>('LINKEDIN_CLIENT_SECRET') ?? '',
    });
    const accessToken = data.access_token as string | undefined;
    if (!accessToken) {
      throw new SocialProviderError('social_token_exchange_failed', 'LinkedIn did not return an access token.');
    }
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
    const data = await getJson(USERINFO_URL, input.accessToken);
    return {
      externalAccountId: String(data.sub ?? ''),
      accountName: typeof data.name === 'string' ? data.name : undefined,
      avatarUrl: typeof data.picture === 'string' ? data.picture : undefined,
    };
  }
}
