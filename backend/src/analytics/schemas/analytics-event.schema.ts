import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { ANALYTICS_CHANNELS, ANALYTICS_ENTITY_TYPES, ANALYTICS_EVENT_TYPES, ANALYTICS_SOURCE_TYPES } from '../types/analytics.types';
import type { AnalyticsChannel, AnalyticsEntityType, AnalyticsEventType, AnalyticsSourceType } from '../types/analytics.types';

export type AnalyticsEventDocument = HydratedDocument<AnalyticsEvent>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class AnalyticsEvent {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  campaignId?: Types.ObjectId;

  @Prop({ type: String, enum: ANALYTICS_EVENT_TYPES, required: true })
  eventType: AnalyticsEventType;

  @Prop({ type: String, enum: ANALYTICS_CHANNELS, required: true })
  channel: AnalyticsChannel;

  @Prop()
  platform?: string;

  @Prop({ type: String, enum: ANALYTICS_SOURCE_TYPES, required: true })
  sourceType: AnalyticsSourceType;

  @Prop({ type: String, enum: ANALYTICS_ENTITY_TYPES, required: true })
  entityType: AnalyticsEntityType;

  @Prop({ type: Types.ObjectId, required: true })
  entityId: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  leadId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  opportunityId?: Types.ObjectId;

  @Prop({ required: true })
  occurredAt: Date;

  @Prop({ type: Number })
  numericValue?: number;

  @Prop()
  currency?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata?: Record<string, string | number | boolean>;

  @Prop({ required: true })
  deduplicationKey: string;

  createdAt?: Date;
}

export const AnalyticsEventSchema = SchemaFactory.createForClass(AnalyticsEvent);
AnalyticsEventSchema.index({ organizationId: 1, productId: 1, occurredAt: -1 });
AnalyticsEventSchema.index({ organizationId: 1, productId: 1, eventType: 1, occurredAt: -1 });
AnalyticsEventSchema.index({ organizationId: 1, productId: 1, channel: 1, occurredAt: -1 });
AnalyticsEventSchema.index({ organizationId: 1, productId: 1, campaignId: 1, occurredAt: -1 });
AnalyticsEventSchema.index({ organizationId: 1, productId: 1, leadId: 1, occurredAt: -1 });
AnalyticsEventSchema.index({ organizationId: 1, productId: 1, deduplicationKey: 1 }, { unique: true });
