import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { LEAD_CAPTURE_METHODS, LEAD_SOURCE_TYPES } from '../types/lead.types';
import type { LeadCaptureMethod, LeadCustomFields, LeadSourceType } from '../types/lead.types';

export type LeadSourceEventDocument = HydratedDocument<LeadSourceEvent>;

@Schema({ timestamps: true })
export class LeadSourceEvent {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  leadId: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  campaignId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  formId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  captureEndpointId?: Types.ObjectId;

  @Prop({ type: String, enum: LEAD_SOURCE_TYPES, required: true })
  sourceType: LeadSourceType;

  @Prop()
  sourceName?: string;

  @Prop()
  channel?: string;

  @Prop()
  platform?: string;

  @Prop()
  sourceUrl?: string;

  @Prop()
  landingPageUrl?: string;

  @Prop()
  referrerUrl?: string;

  @Prop()
  utmSource?: string;

  @Prop()
  utmMedium?: string;

  @Prop()
  utmCampaign?: string;

  @Prop()
  utmTerm?: string;

  @Prop()
  utmContent?: string;

  @Prop()
  externalSourceId?: string;

  @Prop({ type: String, enum: LEAD_CAPTURE_METHODS, required: true })
  captureMethod: LeadCaptureMethod;

  @Prop({ type: Map, of: MongooseSchema.Types.Mixed, default: {} })
  submittedDataSnapshot: LeadCustomFields;

  @Prop({ required: true })
  occurredAt: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const LeadSourceEventSchema = SchemaFactory.createForClass(LeadSourceEvent);
LeadSourceEventSchema.index({ leadId: 1, occurredAt: -1 });
LeadSourceEventSchema.index({ organizationId: 1, productId: 1, campaignId: 1, occurredAt: -1 });
LeadSourceEventSchema.index({ organizationId: 1, productId: 1, formId: 1, occurredAt: -1 });
