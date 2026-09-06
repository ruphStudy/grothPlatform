import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { SOCIAL_PLATFORMS } from '../../social-integrations/types/social.types';
import type { SocialPlatform } from '../../social-integrations/types/social.types';

export type SocialScheduleStatus = 'scheduled' | 'processing' | 'published' | 'failed' | 'cancelled';
export const SOCIAL_SCHEDULE_STATUSES: SocialScheduleStatus[] = ['scheduled', 'processing', 'published', 'failed', 'cancelled'];

export type SocialScheduleDocument = HydratedDocument<SocialSchedule>;

// 19C: stores INTENT only — never a provider token/credential, never a
// duplicated content/publication snapshot. Execution (19D) always goes
// through SocialPublishingService, which owns the actual provider call and
// the SocialPublication record it produces.
@Schema({ timestamps: true })
export class SocialSchedule {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  campaignId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  contentArtifactId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  contentVersionId: Types.ObjectId;

  @Prop({ required: true })
  contentVersion: number;

  @Prop({ type: String, enum: SOCIAL_PLATFORMS, required: true })
  platform: SocialPlatform;

  @Prop({ type: Types.ObjectId, required: true })
  connectionId: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  creativeAssetId?: Types.ObjectId;

  // Always stored as UTC — timezone is the user's original intent,
  // preserved only as display/audit metadata (item 3/35).
  @Prop({ required: true })
  scheduledAt: Date;

  @Prop({ required: true })
  timezone: string;

  @Prop({ type: String, enum: SOCIAL_SCHEDULE_STATUSES, required: true, default: 'scheduled' })
  status: SocialScheduleStatus;

  // Uniqueness scope (item 10): organizationId+productId+idempotencyKey —
  // deliberately NOT platform-scoped like SocialPublication, matching spec
  // item 10 exactly.
  @Prop({ required: true })
  idempotencyKey: string;

  @Prop({ type: Types.ObjectId })
  publicationId?: Types.ObjectId;

  @Prop({ required: true, default: 0 })
  attemptCount: number;

  @Prop()
  lastAttemptAt?: Date;

  // Atomic-claim locking fields (item 21/23) — set only by the worker.
  @Prop()
  lockedAt?: Date;

  @Prop()
  lockedBy?: string;

  @Prop()
  errorCode?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}
export const SocialScheduleSchema = SchemaFactory.createForClass(SocialSchedule);
SocialScheduleSchema.index({ organizationId: 1, productId: 1, idempotencyKey: 1 }, { unique: true });
// The worker's due-schedule query (status + scheduledAt) and stale-lock
// recovery (status + lockedAt) both benefit from this compound index.
SocialScheduleSchema.index({ status: 1, scheduledAt: 1 });
SocialScheduleSchema.index({ status: 1, lockedAt: 1 });
SocialScheduleSchema.index({ organizationId: 1, productId: 1, campaignId: 1, createdAt: -1 });
