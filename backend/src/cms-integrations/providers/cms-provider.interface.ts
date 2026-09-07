import type {
  CmsConnectionValidationResult,
  CmsCredential,
  CmsPlatform,
  CmsPostRequest,
  CmsPostResult,
  CmsProviderCapabilities,
  CmsSiteInfo,
  GetCmsSiteInfoInput,
  ValidateCmsConnectionInput,
} from '../types/cms.types';

// Any future CMS platform adapter implements this and is registered in
// the CMS_PROVIDER_REGISTRY_TOKEN map — no CMS-feature code depends on a
// concrete platform SDK. Provider-specific SDK/HTTP response objects must
// never escape this boundary; every method takes/returns only the
// normalized shapes in cms.types.ts. Methods are optional because not
// every platform/adapter supports every capability — callers must check
// getCapabilities() (the engine does this for them) before calling an
// optional method.
export interface CmsProvider {
  readonly platform: CmsPlatform;
  readonly name: string;

  isConfigured(): boolean;

  getCapabilities(): CmsProviderCapabilities;

  validateConnection?(input: ValidateCmsConnectionInput): Promise<CmsConnectionValidationResult>;

  getSiteInfo?(input: GetCmsSiteInfoInput): Promise<CmsSiteInfo>;

  // Post/media methods are declared now so a later publishing sprint
  // extends this interface's implementations rather than re-designing it
  // — no adapter implements them yet (20A/20B advertise every one of
  // these capabilities as false).
  createPost?(input: { siteUrl: string; credential: CmsCredential } & CmsPostRequest): Promise<CmsPostResult>;

  updatePost?(input: { siteUrl: string; credential: CmsCredential; externalPostId: string } & Partial<CmsPostRequest>): Promise<CmsPostResult>;

  uploadMedia?(input: { siteUrl: string; credential: CmsCredential; fileUrl: string; filename?: string }): Promise<{ externalMediaId: string; url: string }>;
}
