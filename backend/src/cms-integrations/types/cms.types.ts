// Provider-neutral. Mirrors social-integrations/types/social.types.ts's
// shape (18A) — a CMS feature depends only on these types, never on a
// concrete platform SDK.
export type CmsPlatform = 'wordpress';
export const CMS_PLATFORMS: CmsPlatform[] = ['wordpress'];

export interface CmsProviderCapabilities {
  connectSite: boolean;
  validateConnection: boolean;
  fetchSiteInfo: boolean;
  createDraft: boolean;
  publishPost: boolean;
  updatePost: boolean;
  uploadMedia: boolean;
  manageCategories: boolean;
  manageTags: boolean;
}

export type CmsCredentialAuthType = 'application_password' | 'bearer_token';
export const CMS_CREDENTIAL_AUTH_TYPES: CmsCredentialAuthType[] = ['application_password', 'bearer_token'];

// The normalized, already-decrypted credential a provider method actually
// receives — never the raw CmsConnection DB document (item 29).
export interface CmsCredential {
  authType: CmsCredentialAuthType;
  username?: string;
  secret: string;
}

export interface CmsSiteInfo {
  externalSiteId?: string;
  siteName?: string;
  siteUrl: string;
  adminUrl?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface ValidateCmsConnectionInput {
  siteUrl: string;
  credential: CmsCredential;
}

// Bundles genuine site info with normalized, provider-neutral capability
// labels (e.g. 'publish_posts') derived from whatever the provider's API
// actually reports for this credential — never invented (item 19/20).
export interface CmsConnectionValidationResult {
  siteInfo: CmsSiteInfo;
  capabilities: string[];
}

export interface GetCmsSiteInfoInput {
  siteUrl: string;
  credential: CmsCredential;
}

// Future (post-20B) shapes only — deliberately unused by any route yet
// (item 6). Kept provider-neutral so a later publishing sprint can build
// on this without another abstraction pass.
export type CmsPostStatus = 'draft' | 'publish' | 'pending' | 'future';

export interface CmsPostRequest {
  title: string;
  content: string;
  excerpt?: string;
  slug?: string;
  status: CmsPostStatus;
  categories?: string[];
  tags?: string[];
  featuredImage?: string;
}

export interface CmsPostResult {
  externalPostId: string;
  url?: string;
  status: CmsPostStatus;
}
