import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialProviderError } from '../errors/social.errors';
import type { BuildAuthorizationUrlInput, ExchangeAuthorizationCodeInput, GetProfileInput, SocialAuthResult, SocialPlatform, SocialProfile, SocialProviderCapabilities } from '../types/social.types';
import { getJson, postForm } from './social-oauth-http.util';
import type { SocialProvider } from './social-provider.interface';

const AUTHORIZATION_URL = 'https://api.instagram.com/oauth/authorize';
const TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const DEFAULT_SCOPES = ['user_profile'];

// Instagram Basic Display login. Meta's Business/Pages-linked Instagram
// flow (item 30) is intentionally not built here — only the actual
// account identity this flow returns is persisted; page/account selection
// can be layered on later without changing this interface.
@Injectable()
export class InstagramSocialProvider implements SocialProvider {
  readonly platform: SocialPlatform = 'instagram';
  readonly name = 'instagram';

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return !!this.configService.get<string>('META_CLIENT_ID') && !!this.configService.get<string>('META_CLIENT_SECRET');
  }

  getCapabilities(): SocialProviderCapabilities {
    return { connectAccount: true, refreshToken: false, publishText: false, publishImage: false, publishVideo: false, fetchProfile: true, fetchPostStatus: false };
  }

  buildAuthorizationUrl(input: BuildAuthorizationUrlInput): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.configService.get<string>('META_CLIENT_ID') ?? '',
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
      client_id: this.configService.get<string>('META_CLIENT_ID') ?? '',
      client_secret: this.configService.get<string>('META_CLIENT_SECRET') ?? '',
    });
    const accessToken = data.access_token as string | undefined;
    const externalAccountId = data.user_id !== undefined ? String(data.user_id) : undefined;
    if (!accessToken || !externalAccountId) {
      throw new SocialProviderError('social_token_exchange_failed', 'Instagram did not return an access token.');
    }
    const profile = await this.getProfile({ accessToken });
    return {
      platform: 'instagram',
      externalAccountId,
      username: profile.username,
      accessToken,
    };
  }

  async getProfile(input: GetProfileInput): Promise<SocialProfile> {
    const data = await getJson(`https://graph.instagram.com/me?fields=id,username&access_token=${encodeURIComponent(input.accessToken)}`);
    return {
      externalAccountId: String(data.id ?? ''),
      username: typeof data.username === 'string' ? data.username : undefined,
    };
  }
}
