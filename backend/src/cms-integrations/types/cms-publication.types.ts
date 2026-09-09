import type { CmsPlatform, CmsRemotePostStatus, CmsSeoMetadata } from './cms.types';
import type { CmsPublicationStatus, CmsPublishMode } from '../schemas/cms-publication.schema';

export interface PublishCmsBlogInput {
  connectionId: string;
  mode: CmsPublishMode;
  idempotencyKey: string;
  featuredCreativeAssetId?: string;
  categoryIds?: number[];
  tagIds?: number[];
}

export interface CmsPublicationListFilter {
  status?: CmsPublicationStatus;
  localStatus?: CmsPublicationStatus;
  remoteStatus?: CmsRemotePostStatus;
  connectionId?: string;
  mode?: CmsPublishMode;
  contentArtifactId?: string;
  start?: string;
  end?: string;
}

export interface CmsPublicationResponse {
  id: string;
  platform: CmsPlatform;
  cmsConnectionId: string;
  contentArtifactId: string;
  contentVersionId: string;
  contentVersion: number;
  status: CmsPublicationStatus;
  publishMode: CmsPublishMode;
  externalPostId?: string;
  externalPostUrl?: string;
  remoteStatus?: CmsRemotePostStatus;
  remoteStatusCheckedAt?: Date;
  remoteStatusErrorCode?: string;
  titleSnapshot: string;
  excerptSnapshot?: string;
  slugSnapshot?: string;
  seo?: CmsSeoMetadata;
  featuredCreativeAssetId?: string;
  externalMediaId?: string;
  categoryIds: number[];
  tagIds: number[];
  providerName?: string;
  attemptCount: number;
  lastAttemptAt?: Date;
  errorCode?: string;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
