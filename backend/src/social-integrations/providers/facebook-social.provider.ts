import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialProviderError } from '../errors/social.errors';
import type { BuildAuthorizationUrlInput, ExchangeAuthorizationCodeInput, GetProfileInput, SocialAuthResult, SocialPlatform, SocialProfile, SocialProviderCapabilities } from '../types/social.types';
import { getJson } from './social-oauth-http.util';
import type { SocialProvider } from './social-provider.interface';

const GRAPH_VERSION = 'v18.0';
const AUTHORIZATION_URL = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;
const TOKEN_URL = `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`;
const DEFAULT_SCOPES = ['pages_show_list', 'pages_read_engagement'];

@Injectable()
export class FacebookSocialProvider implements SocialProvider {
  readonly platform: SocialPlatform = 'facebook';
  readonly name = 'facebook';

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
      scope: (input.scopes ?? DEFAULT_SCOPES).join(','),
    });
    return `${AUTHORIZATION_URL}?${params.toString()}`;
  }

  async exchangeAuthorizationCode(input: ExchangeAuthorizationCodeInput): Promise<SocialAuthResult> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: this.configService.get<string>('META_CLIENT_ID') ?? '',
      client_secret: this.configService.get<string>('META_CLIENT_SECRET') ?? '',
    });
    const data = await getJson(`${TOKEN_URL}?${params.toString()}`);
    const accessToken = data.access_token as string | undefined;
    if (!accessToken) {
      throw new SocialProviderError('social_token_exchange_failed', 'Facebook did not return an access token.');
    }
    const profile = await this.getProfile({ accessToken });
    const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : undefined;
    return {
      platform: 'facebook',
      externalAccountId: profile.externalAccountId,
      accountName: profile.accountName,
      accessToken,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
      profileUrl: profile.profileUrl,
    };
  }

  async getProfile(input: GetProfileInput): Promise<SocialProfile> {
    const data = await getJson(`https://graph.facebook.com/${GRAPH_VERSION}/me?fields=id,name,picture&access_token=${encodeURIComponent(input.accessToken)}`);
    const picture = data.picture as { data?: { url?: string } } | undefined;
    return {
      externalAccountId: String(data.id ?? ''),
      accountName: typeof data.name === 'string' ? data.name : undefined,
      avatarUrl: picture?.data?.url,
      profileUrl: data.id ? `https://facebook.com/${String(data.id)}` : undefined,
    };
  }
}
