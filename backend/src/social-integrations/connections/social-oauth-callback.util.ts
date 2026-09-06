import type { ConfigService } from '@nestjs/config';
import type { SocialPlatform } from '../types/social.types';

const DEFAULT_BACKEND_BASE_URL = 'http://localhost:3000';
const DEFAULT_FRONTEND_BASE_URL = 'http://localhost:5173';

// The redirect_uri sent to the OAuth provider must be byte-identical
// between the authorize step and the token-exchange step — always
// reconstructed here rather than passed around, so the two can never
// drift apart.
export function buildCallbackUrl(configService: ConfigService, platform: SocialPlatform): string {
  const base = configService.get<string>('SOCIAL_OAUTH_REDIRECT_BASE_URL') ?? DEFAULT_BACKEND_BASE_URL;
  return `${base.replace(/\/$/, '')}/social-connections/oauth/${platform}/callback`;
}

// Never includes a token/code/state — only a coarse status the frontend
// uses to decide whether to show success or a generic failure message.
export function buildFrontendRedirectUrl(configService: ConfigService, platform: SocialPlatform, status: 'success' | 'error'): string {
  const base = configService.get<string>('FRONTEND_BASE_URL') ?? DEFAULT_FRONTEND_BASE_URL;
  return `${base.replace(/\/$/, '')}/social-connections/callback?status=${status}&platform=${platform}`;
}
