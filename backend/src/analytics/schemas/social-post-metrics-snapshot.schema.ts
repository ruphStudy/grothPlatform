import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { SOCIAL_PLATFORMS } from '../../social-integrations/types/social.types';
import type { SocialPlatform, SocialPostMetricKey, SocialPostMetrics } from '../../social-integrations/types/social.types';

export type SocialPostMetricsSnapshotDocument = HydratedDocument<SocialPostMetricsSnapshot>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class SocialPostMetricsSnapshot {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  socialPublicationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  socialConnectionId: Types.ObjectId;

  @Prop({ type: String, enum: SOCIAL_PLATFORMS, required: true })
  platform: SocialPlatform;

  @Prop({ required: true })
  externalPostId: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metrics: SocialPostMetrics;

  @Prop({ required: true })
  fetchedAt: Date;

  @Prop({ type: [String], default: [] })
  providerMetricAvailability: SocialPostMetricKey[];

  createdAt?: Date;
}

export const SocialPostMetricsSnapshotSchema = SchemaFactory.createForClass(SocialPostMetricsSnapshot);
SocialPostMetricsSnapshotSchema.index({ organizationId: 1, productId: 1, fetchedAt: -1 });
SocialPostMetricsSnapshotSchema.index({ organizationId: 1, productId: 1, socialPublicationId: 1, fetchedAt: -1 });
SocialPostMetricsSnapshotSchema.index({ organizationId: 1, productId: 1, platform: 1, fetchedAt: -1 });
