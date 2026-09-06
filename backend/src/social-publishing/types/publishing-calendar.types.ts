import type { SocialPlatform } from '../../social-integrations/types/social.types';

// 19E: a management/view layer only — never a second scheduling engine.
// `type` records how the item entered the pipeline (via a SocialSchedule
// vs. an immediate "Publish Now" SocialPublication); a schedule that has
// since published carries both `scheduleId` and `publicationId` on the
// SAME item rather than appearing twice.
export type PublishingCalendarItemType = 'scheduled' | 'publication';
export type PublishingCalendarStatus = 'scheduled' | 'processing' | 'published' | 'failed' | 'cancelled';

export interface PublishingCalendarQuery {
  start: string;
  end: string;
  platform?: SocialPlatform;
  status?: PublishingCalendarStatus;
  connectionId?: string;
}

// Safe fields only — never a token, credential, raw provider payload, or
// internal prompt (item 2).
export interface PublishingCalendarItem {
  id: string;
  type: PublishingCalendarItemType;

  platform: SocialPlatform;
  status: PublishingCalendarStatus;

  scheduledAt?: string;
  publishedAt?: string;

  connection: {
    id: string;
    accountName?: string;
    username?: string;
  };

  source: {
    contentArtifactId: string;
    contentVersionId: string;
    contentVersion: number;
    contentKind: string;
  };

  creativeAssetId?: string;

  publicationId?: string;
  scheduleId?: string;

  providerPostUrl?: string;
  errorCode?: string;
}
