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
  // 18E/18F: true only for providers whose OAuth flow yields multiple
  // possible marketing accounts (Facebook Pages, linked Instagram
  // professional accounts) that a user must discover/select among.
  accountDiscovery: boolean;
}

export interface BuildAuthorizationUrlInput {
  redirectUri: string;
  state: string;
  scopes?: string[];
}

// PKCE-capable providers (18D: X) return a server-generated code_verifier
// alongside the URL — the caller persists it in the OAuth state record
// (never in the browser-visible state/query) and replays it at exchange
// time. Providers that don't need PKCE simply omit codeVerifier.
export interface BuildAuthorizationUrlResult {
  url: string;
  codeVerifier?: string;
}

export interface ExchangeAuthorizationCodeInput {
  code: string;
  redirectUri: string;
  codeVerifier?: string;
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

export interface DiscoverAccountCandidatesInput {
  accessToken: string;
}

// A marketing-eligible account discovered under a user's OAuth grant
// (a Facebook Page, or an Instagram professional account linked to one).
// `internalAccessToken`/`internalRefreshToken` are deliberately prefixed
// so it's obvious at every call site that they must never be serialized
// into an HTTP response — only the safe display fields may reach the
// frontend (see PendingSelectionCandidateResponse).
export interface SocialAccountCandidate {
  externalAccountId: string;
  accountName?: string;
  username?: string;
  avatarUrl?: string;
  profileUrl?: string;
  accountType?: 'page' | 'professional' | 'business' | 'creator' | 'unknown';
  // Present for an Instagram candidate discovered via a linked Facebook Page.
  linkedFacebookPageId?: string;

  internalAccessToken: string;
  internalRefreshToken?: string;
  internalExpiresAt?: Date;
  internalScopes?: string[];
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
