import type { SocialPlatform } from '../../social-integrations/types/social.types';
import type { SocialScheduleStatus } from '../schemas/social-schedule.schema';

export interface CreateSocialScheduleInput {
  organizationId: string;
  productId: string;
  campaignId: string;
  artifactId: string;
  version: number;
  connectionId: string;
  creativeAssetId?: string;
  scheduledAt: string;
  timezone: string;
  idempotencyKey: string;
  userId: string;
}

export interface UpdateSocialScheduleInput {
  scheduledAt?: string;
  timezone?: string;
  connectionId?: string;
  creativeAssetId?: string;
  userId: string;
}

export interface SocialScheduleListFilter {
  status?: SocialScheduleStatus;
  platform?: SocialPlatform;
  connectionId?: string;
  contentArtifactId?: string;
  from?: string;
  to?: string;
  limit?: number;
}

// Safe fields only — never a token, never a raw provider payload.
export interface SocialScheduleResponse {
  id: string;

  platform: SocialPlatform;
  connectionId: string;

  contentArtifactId: string;
  contentVersionId: string;
  contentVersion: number;

  creativeAssetId?: string;

  scheduledAt: Date;
  timezone: string;

  status: SocialScheduleStatus;

  publicationId?: string;

  attemptCount: number;
  lastAttemptAt?: Date;
  errorCode?: string;

  createdAt: Date;
  updatedAt: Date;
}
