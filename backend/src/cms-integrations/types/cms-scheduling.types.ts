import type { CmsScheduleStatus } from '../schemas/cms-schedule.schema';
import type { CmsPublishMode } from '../schemas/cms-publication.schema';
import type { CmsPlatform } from './cms.types';

export interface CreateCmsScheduleInput {
  organizationId: string;
  productId: string;
  campaignId: string;
  artifactId: string;
  version: number;
  connectionId: string;
  mode: CmsPublishMode;
  scheduledAt: string;
  timezone: string;
  idempotencyKey: string;
  featuredCreativeAssetId?: string;
  categoryIds?: number[];
  tagIds?: number[];
  userId: string;
}

export interface UpdateCmsScheduleInput {
  scheduledAt?: string;
  timezone?: string;
  connectionId?: string;
  mode?: CmsPublishMode;
  featuredCreativeAssetId?: string;
  categoryIds?: number[];
  tagIds?: number[];
  userId: string;
}

export interface CmsScheduleListFilter {
  status?: CmsScheduleStatus;
  connectionId?: string;
  mode?: CmsPublishMode;
  start?: string;
  end?: string;
}

export interface CmsScheduleResponse {
  id: string;
  platform: CmsPlatform;
  cmsConnectionId: string;
  contentArtifactId: string;
  contentVersionId: string;
  contentVersion: number;
  publishMode: CmsPublishMode;
  featuredCreativeAssetId?: string;
  categoryIds: number[];
  tagIds: number[];
  scheduledAt: Date;
  timezone: string;
  status: CmsScheduleStatus;
  publicationId?: string;
  attemptCount: number;
  lastAttemptAt?: Date;
  errorCode?: string;
  createdAt: Date;
  updatedAt: Date;
}
