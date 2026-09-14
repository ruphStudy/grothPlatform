import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export const ATTRIBUTION_MODELS = ['first_touch', 'last_touch'] as const;
export type AttributionModel = (typeof ATTRIBUTION_MODELS)[number];

export const ATTRIBUTION_TOUCHPOINT_TYPES = ['website_visit', 'cta_click', 'form_view', 'form_submit', 'lead_capture', 'email_delivered', 'email_opened', 'email_clicked', 'content_visit', 'blog_visit', 'social_interaction', 'manual', 'direct', 'referral', 'other'] as const;
export type AttributionTouchpointType = (typeof ATTRIBUTION_TOUCHPOINT_TYPES)[number];

export type AttributionTouchpointDocument = HydratedDocument<AttributionTouchpoint>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class AttributionTouchpoint {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  leadId: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  opportunityId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  campaignId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  contentArtifactId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  contentVersionId?: Types.ObjectId;

  @Prop({ required: true, maxlength: 60 })
  channel: string;

  @Prop({ maxlength: 60 })
  platform?: string;

  @Prop({ required: true, maxlength: 80 })
  sourceType: string;

  @Prop({ required: true, maxlength: 80 })
  sourceEntityType: string;

  @Prop({ type: Types.ObjectId, required: true })
  sourceEntityId: Types.ObjectId;

  @Prop({ type: String, enum: ATTRIBUTION_TOUCHPOINT_TYPES, required: true })
  touchpointType: AttributionTouchpointType;

  @Prop({ required: true })
  occurredAt: Date;

  @Prop({ maxlength: 120 })
  sessionId?: string;

  @Prop({ maxlength: 120 })
  anonymousVisitorId?: string;

  @Prop({ maxlength: 120 })
  utmSource?: string;

  @Prop({ maxlength: 120 })
  utmMedium?: string;

  @Prop({ maxlength: 160 })
  utmCampaign?: string;

  @Prop({ maxlength: 160 })
  utmTerm?: string;

  @Prop({ maxlength: 160 })
  utmContent?: string;

  @Prop({ maxlength: 200 })
  referrerDomain?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata?: Record<string, string | number | boolean>;

  @Prop({ required: true, maxlength: 220 })
  deduplicationKey: string;

  createdAt?: Date;
}

export const AttributionTouchpointSchema = SchemaFactory.createForClass(AttributionTouchpoint);
AttributionTouchpointSchema.index({ organizationId: 1, productId: 1, leadId: 1, occurredAt: 1 });
AttributionTouchpointSchema.index({ organizationId: 1, productId: 1, opportunityId: 1, occurredAt: 1 });
AttributionTouchpointSchema.index({ organizationId: 1, productId: 1, campaignId: 1, occurredAt: 1 });
AttributionTouchpointSchema.index({ organizationId: 1, productId: 1, channel: 1, occurredAt: 1 });
AttributionTouchpointSchema.index({ organizationId: 1, productId: 1, contentArtifactId: 1, occurredAt: 1 });
AttributionTouchpointSchema.index({ organizationId: 1, productId: 1, deduplicationKey: 1 }, { unique: true });
