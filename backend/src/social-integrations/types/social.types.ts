// Provider-neutral. 18B (connections) and later Sprint 18 items (publishing/
// scheduling) build on this but never depend on a concrete platform SDK.
export type SocialPlatform = 'linkedin' | 'x' | 'facebook' | 'instagram';

export const SOCIAL_PLATFORMS: SocialPlatform[] = ['linkedin', 'x', 'facebook', 'instagram'];

export interface SocialProviderCapabilities {
  connectAccount: boolean;
  refreshToken: boolean;
  publishText: boolean;
  publishImage: boolean;
  publishVideo: boolean;
  fetchProfile: boolean;
  fetchPostStatus: boolean;
}

export interface BuildAuthorizationUrlInput {
  redirectUri: string;
  state: string;
  scopes?: string[];
}

export interface ExchangeAuthorizationCodeInput {
  code: string;
  redirectUri: string;
}

export interface RefreshAccessTokenInput {
  refreshToken: string;
}

export interface GetProfileInput {
  accessToken: string;
}

export interface GetPostStatusInput {
  accessToken: string;
  externalPostId: string;
}

// Internal only — never returned to the frontend once persisted (see
// connections/types/social-connection.types.ts, which stores only
// *encrypted* tokens and never re-exposes them).
export interface SocialAuthResult {
  platform: SocialPlatform;

  externalAccountId: string;

  accountName?: string;
  username?: string;

  accessToken: string;
  refreshToken?: string;

  expiresAt?: Date;
  scopes?: string[];

  profileUrl?: string;

  metadata?: Record<string, string | number | boolean>;
}

export interface SocialProfile {
  externalAccountId: string;
  accountName?: string;
  username?: string;
  avatarUrl?: string;
  profileUrl?: string;
}

// Minimal provider-neutral publish shapes — kept ready for a later Sprint
// 18 item. No endpoint exposes these yet (18A/18B item 7/37).
export interface SocialPublishRequest {
  accessToken: string;
  text?: string;
  imageUrl?: string;
}

export interface SocialPublishResult {
  externalPostId: string;
  url?: string;
  publishedAt: Date;
}

export interface SocialPostStatusResult {
  externalPostId: string;
  status: string;
  url?: string;
}
