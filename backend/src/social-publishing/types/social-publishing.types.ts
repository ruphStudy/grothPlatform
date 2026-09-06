import type { SocialPlatform, SocialRemotePostStatus } from '../../social-integrations/types/social.types';
import type { PublicationStatus } from '../schemas/social-publication.schema';

export interface PublishSocialContentInput {
  organizationId: string;
  productId: string;
  campaignId: string;
  artifactId: string;
  version: number;
  connectionId: string;
  creativeAssetId?: string;
  idempotencyKey: string;
  userId: string;
}

export interface SocialPublicationListFilter {
  platform?: SocialPlatform;
  status?: PublicationStatus;
  remoteStatus?: SocialRemotePostStatus;
  connectionId?: string;
  contentArtifactId?: string;
  from?: string;
  to?: string;
  limit?: number;
}

// Safe fields only — never a token, never a raw provider payload (item 33).
export interface SocialPublicationResponse {
  id: string;

  platform: SocialPlatform;
  connectionId: string;

  contentArtifactId: string;
  contentVersionId: string;
  contentVersion: number;

  creativeAssetId?: string;

  status: PublicationStatus;

  providerName?: string;
  providerPostId?: string;
  providerPostUrl?: string;
  providerPostIds?: string[];

  contentSnapshot: {
    kind: string;
    text: string;
    mediaType?: 'image';
  };

  publishedAt?: Date;
  attemptCount: number;
  lastAttemptAt?: Date;
  errorCode?: string;

  remoteStatus?: SocialRemotePostStatus;
  remoteStatusCheckedAt?: Date;
  remoteStatusErrorCode?: string;

  createdAt: Date;
  updatedAt: Date;
}
