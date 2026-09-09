import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { LEAD_CONSENT_STATUSES, LEAD_SOURCE_TYPES, LEAD_STATUSES } from '../types/lead.types';
import type { LeadConsentStatus, LeadCustomFields, LeadSourceType, LeadStatus } from '../types/lead.types';

export type LeadDocument = HydratedDocument<Lead>;

@Schema({ timestamps: true })
export class Lead {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  campaignId?: Types.ObjectId;

  @Prop()
  firstName?: string;

  @Prop()
  lastName?: string;

  @Prop()
  fullName?: string;

  @Prop()
  email?: string;

  @Prop()
  normalizedEmail?: string;

  @Prop()
  phone?: string;

  @Prop()
  normalizedPhone?: string;

  @Prop()
  companyName?: string;

  @Prop()
  jobTitle?: string;

  @Prop()
  country?: string;

  @Prop()
  region?: string;

  @Prop()
  city?: string;

  @Prop({ type: String, enum: LEAD_STATUSES, default: 'new', required: true })
  status: LeadStatus;

  @Prop({ type: String, enum: LEAD_SOURCE_TYPES, required: true })
  sourceType: LeadSourceType;

  @Prop()
  sourceName?: string;

  @Prop({ type: Types.ObjectId })
  firstSourceEventId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  latestSourceEventId?: Types.ObjectId;

  @Prop({ required: true })
  firstCapturedAt: Date;

  @Prop({ required: true })
  latestCapturedAt: Date;

  @Prop({ type: String, enum: LEAD_CONSENT_STATUSES, required: true, default: 'unknown' })
  consentStatus: LeadConsentStatus;

  @Prop()
  consentCapturedAt?: Date;

  @Prop()
  consentSource?: string;

  @Prop({ type: Map, of: MongooseSchema.Types.Mixed, default: {} })
  customFields: LeadCustomFields;

  @Prop()
  notes?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const LeadSchema = SchemaFactory.createForClass(Lead);
LeadSchema.index(
  { organizationId: 1, productId: 1, normalizedEmail: 1 },
  { unique: true, partialFilterExpression: { normalizedEmail: { $type: 'string' } } },
);
LeadSchema.index(
  { organizationId: 1, productId: 1, normalizedPhone: 1 },
  { unique: true, partialFilterExpression: { normalizedPhone: { $type: 'string' } } },
);
LeadSchema.index({ organizationId: 1, productId: 1, status: 1 });
LeadSchema.index({ organizationId: 1, productId: 1, latestCapturedAt: -1 });
LeadSchema.index({ organizationId: 1, productId: 1, campaignId: 1 });
