import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type LeadCaptureFormDocument = HydratedDocument<LeadCaptureForm>;

export const LEAD_CAPTURE_FORM_STATUSES = ['draft', 'active', 'inactive'] as const;
export type LeadCaptureFormStatus = (typeof LEAD_CAPTURE_FORM_STATUSES)[number];

export const LEAD_CAPTURE_FORM_FIELD_TYPES = ['first_name', 'last_name', 'full_name', 'email', 'phone', 'company_name', 'job_title', 'country', 'region', 'city', 'text', 'textarea', 'select', 'checkbox'] as const;
export type LeadCaptureFormFieldType = (typeof LEAD_CAPTURE_FORM_FIELD_TYPES)[number];

@Schema({ _id: false })
export class LeadCaptureFormField {
  @Prop({ required: true })
  key: string;

  @Prop({ type: String, enum: LEAD_CAPTURE_FORM_FIELD_TYPES, required: true })
  type: LeadCaptureFormFieldType;

  @Prop({ required: true })
  label: string;

  @Prop()
  placeholder?: string;

  @Prop({ required: true, default: false })
  required: boolean;

  @Prop({ type: [String], default: [] })
  options: string[];

  @Prop()
  customFieldKey?: string;

  @Prop({ required: true })
  order: number;
}
export const LeadCaptureFormFieldSchema = SchemaFactory.createForClass(LeadCaptureFormField);

@Schema({ _id: false })
export class LeadCaptureFormConsent {
  @Prop({ required: true, default: true })
  enabled: boolean;

  @Prop({ required: true, default: false })
  required: boolean;

  @Prop()
  label?: string;
}
export const LeadCaptureFormConsentSchema = SchemaFactory.createForClass(LeadCaptureFormConsent);

@Schema({ _id: false })
export class LeadCaptureFormAppearance {
  @Prop()
  layout?: string;

  @Prop()
  theme?: string;
}
export const LeadCaptureFormAppearanceSchema = SchemaFactory.createForClass(LeadCaptureFormAppearance);

@Schema({ timestamps: true })
export class LeadCaptureForm {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  campaignId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  captureEndpointId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  slug: string;

  @Prop()
  title?: string;

  @Prop()
  description?: string;

  @Prop({ type: String, enum: LEAD_CAPTURE_FORM_STATUSES, required: true, default: 'draft' })
  status: LeadCaptureFormStatus;

  @Prop({ required: true, default: 'Submit' })
  submitButtonText: string;

  @Prop()
  successTitle?: string;

  @Prop()
  successMessage?: string;

  @Prop({ type: [LeadCaptureFormFieldSchema], default: [] })
  fields: LeadCaptureFormField[];

  @Prop({ type: LeadCaptureFormConsentSchema, default: { enabled: true, required: false } })
  consent: LeadCaptureFormConsent;

  @Prop({ type: LeadCaptureFormAppearanceSchema })
  appearance?: LeadCaptureFormAppearance;

  @Prop({ type: Map, of: MongooseSchema.Types.Mixed, default: {} })
  metadata: Record<string, string | number | boolean>;

  createdAt?: Date;
  updatedAt?: Date;
}

export const LeadCaptureFormSchema = SchemaFactory.createForClass(LeadCaptureForm);
LeadCaptureFormSchema.index({ organizationId: 1, productId: 1, slug: 1 }, { unique: true });
LeadCaptureFormSchema.index({ organizationId: 1, productId: 1, status: 1, createdAt: -1 });
LeadCaptureFormSchema.index({ captureEndpointId: 1 }, { unique: true });
