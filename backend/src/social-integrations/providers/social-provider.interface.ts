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

// Any future platform adapter implements this and is registered in the
// SOCIAL_PROVIDER_REGISTRY_TOKEN map — no social-feature code depends on a
// concrete SDK. Provider-specific SDK/HTTP response objects must never
// escape this boundary; every method takes/returns only the normalized
// shapes above. Methods are optional because not every platform/adapter
// supports every capability — callers must check getCapabilities() (the
// engine does this for them) before calling an optional method.
export interface SocialProvider {
  readonly platform: SocialPlatform;
  readonly name: string;

  isConfigured(): boolean;

  getCapabilities(): SocialProviderCapabilities;

  buildAuthorizationUrl?(input: BuildAuthorizationUrlInput): BuildAuthorizationUrlResult;

  exchangeAuthorizationCode?(input: ExchangeAuthorizationCodeInput): Promise<SocialAuthResult>;

  refreshAccessToken?(input: RefreshAccessTokenInput): Promise<SocialAuthResult>;

  getProfile?(input: GetProfileInput): Promise<SocialProfile>;

  publish?(input: SocialPublishRequest): Promise<SocialPublishResult>;

  getPostStatus?(input: GetPostStatusInput): Promise<SocialPostStatusResult>;
}
