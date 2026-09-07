// Nest injection token for the platform -> provider registry (a
// Map<CmsPlatform, CmsProvider>). The engine depends only on this token,
// never on a concrete provider class, so adding a second CMS platform
// later only means registering one more provider + one more map entry.
export const CMS_PROVIDER_REGISTRY_TOKEN = 'CMS_PROVIDER_REGISTRY_TOKEN';
