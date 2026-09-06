// Nest injection token for the platform -> provider registry (a
// Map<SocialPlatform, SocialProvider>). The engine depends only on this
// token, never on a concrete provider class, so adding a fifth platform
// later only means registering one more provider + one more map entry.
export const SOCIAL_PROVIDER_REGISTRY_TOKEN = 'SOCIAL_PROVIDER_REGISTRY_TOKEN';
