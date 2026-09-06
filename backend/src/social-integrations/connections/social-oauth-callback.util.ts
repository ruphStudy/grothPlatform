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

// Never includes a token/code/state/raw provider error — only a coarse
// status plus an already-normalized error code the frontend can use to
// show a clean message (e.g. social_no_eligible_account).
export function buildFrontendRedirectUrl(configService: ConfigService, platform: SocialPlatform, status: 'success' | 'error', errorCode?: string): string {
  const base = configService.get<string>('FRONTEND_BASE_URL') ?? DEFAULT_FRONTEND_BASE_URL;
  const params = new URLSearchParams({ status, platform });
  if (errorCode) params.set('error', errorCode);
  return `${base.replace(/\/$/, '')}/social-connections/callback?${params.toString()}`;
}

// 18E/18F: Facebook/Instagram OAuth may require the user to pick among
// several discovered Pages/accounts. organizationId/productId are
// included so the frontend can deep-link to the tenant-scoped pending-
// selection endpoint — they are ordinary, already-public-in-every-URL
// identifiers, not secrets; the selectionId is a random, tenant-bound,
// one-time token, and no token/code/secret is ever carried (item 36).
export function buildFrontendSelectionRedirectUrl(
  configService: ConfigService,
  platform: SocialPlatform,
  selectionId: string,
  organizationId: string,
  productId: string,
): string {
  const base = configService.get<string>('FRONTEND_BASE_URL') ?? DEFAULT_FRONTEND_BASE_URL;
  const params = new URLSearchParams({ status: 'selection_required', platform, selectionId, organizationId, productId });
  return `${base.replace(/\/$/, '')}/social-connections/callback?${params.toString()}`;
}
