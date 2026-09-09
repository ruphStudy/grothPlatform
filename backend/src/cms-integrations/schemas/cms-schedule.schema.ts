import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { CMS_PLATFORMS } from '../types/cms.types';
import type { CmsPlatform } from '../types/cms.types';
import { CMS_PUBLISH_MODES, type CmsPublishMode } from './cms-publication.schema';

export type CmsScheduleStatus = 'scheduled' | 'processing' | 'completed' | 'failed' | 'cancelled';
export const CMS_SCHEDULE_STATUSES: CmsScheduleStatus[] = ['scheduled', 'processing', 'completed', 'failed', 'cancelled'];

export type CmsScheduleDocument = HydratedDocument<CmsSchedule>;

@Schema({ timestamps: true })
export class CmsSchedule {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  campaignId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  cmsConnectionId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  contentArtifactId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  contentVersionId: Types.ObjectId;

  @Prop({ required: true })
  contentVersion: number;

  @Prop({ type: String, enum: CMS_PLATFORMS, required: true })
  platform: CmsPlatform;

  @Prop({ type: String, enum: CMS_PUBLISH_MODES, required: true })
  publishMode: CmsPublishMode;

  @Prop({ type: Types.ObjectId })
  featuredCreativeAssetId?: Types.ObjectId;

  @Prop({ type: [Number], default: [] })
  categoryIds: number[];

  @Prop({ type: [Number], default: [] })
  tagIds: number[];

  @Prop({ required: true })
  scheduledAt: Date;

  @Prop({ required: true })
  timezone: string;

  @Prop({ type: String, enum: CMS_SCHEDULE_STATUSES, required: true, default: 'scheduled' })
  status: CmsScheduleStatus;

  @Prop({ required: true })
  idempotencyKey: string;

  @Prop({ type: Types.ObjectId })
  publicationId?: Types.ObjectId;

  @Prop({ required: true, default: 0 })
  attemptCount: number;

  @Prop()
  lastAttemptAt?: Date;

  @Prop()
  lockedAt?: Date;

  @Prop()
  lockedBy?: string;

  @Prop()
  lockExpiresAt?: Date;

  @Prop()
  errorCode?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CmsScheduleSchema = SchemaFactory.createForClass(CmsSchedule);
CmsScheduleSchema.index({ organizationId: 1, productId: 1, idempotencyKey: 1 }, { unique: true });
CmsScheduleSchema.index({ status: 1, scheduledAt: 1 });
CmsScheduleSchema.index({ status: 1, lockExpiresAt: 1 });
CmsScheduleSchema.index({ organizationId: 1, productId: 1, campaignId: 1, scheduledAt: 1 });
