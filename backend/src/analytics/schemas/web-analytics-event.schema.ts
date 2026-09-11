import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { WEB_ANALYTICS_EVENT_TYPES } from '../types/analytics.types';
import type { WebAnalyticsEventType } from '../types/analytics.types';

export type WebAnalyticsEventDocument = HydratedDocument<WebAnalyticsEvent>;

@Schema({ timestamps: { createdAt: 'receivedAt', updatedAt: false } })
export class WebAnalyticsEvent {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  siteId: Types.ObjectId;

  @Prop({ type: String, enum: WEB_ANALYTICS_EVENT_TYPES, required: true })
  eventType: WebAnalyticsEventType;

  @Prop({ maxlength: 120 })
  anonymousVisitorId?: string;

  @Prop({ maxlength: 120 })
  sessionId?: string;

  @Prop({ maxlength: 1000 })
  pageUrl?: string;

  @Prop({ maxlength: 500 })
  pagePath?: string;

  @Prop({ maxlength: 300 })
  pageTitle?: string;

  @Prop({ maxlength: 1000 })
  referrer?: string;

  @Prop({ maxlength: 120 })
  source?: string;

  @Prop({ maxlength: 120 })
  medium?: string;

  @Prop({ maxlength: 160 })
  campaignName?: string;

  @Prop({ maxlength: 160 })
  term?: string;

  @Prop({ maxlength: 160 })
  content?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  properties?: Record<string, string | number | boolean>;

  @Prop({ required: true })
  occurredAt: Date;

  @Prop()
  receivedAt?: Date;

  @Prop({ maxlength: 200 })
  deduplicationKey?: string;
}

export const WebAnalyticsEventSchema = SchemaFactory.createForClass(WebAnalyticsEvent);
WebAnalyticsEventSchema.index({ organizationId: 1, productId: 1, occurredAt: -1 });
WebAnalyticsEventSchema.index({ organizationId: 1, productId: 1, siteId: 1, occurredAt: -1 });
WebAnalyticsEventSchema.index({ organizationId: 1, productId: 1, deduplicationKey: 1 }, { sparse: true });
