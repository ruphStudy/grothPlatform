import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { EMAIL_TEMPLATE_STATUSES, EMAIL_TEMPLATE_TYPES } from '../types/email.types';
import type { EmailTemplateStatus, EmailTemplateType } from '../types/email.types';

export type EmailTemplateDocument = HydratedDocument<EmailTemplate>;

@Schema({ timestamps: true })
export class EmailTemplate {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  slug: string;

  @Prop({ type: String, enum: EMAIL_TEMPLATE_TYPES, required: true })
  type: EmailTemplateType;

  @Prop({ type: String, enum: EMAIL_TEMPLATE_STATUSES, required: true, default: 'draft' })
  status: EmailTemplateStatus;

  @Prop({ required: true, default: 1 })
  latestVersion: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const EmailTemplateSchema = SchemaFactory.createForClass(EmailTemplate);
EmailTemplateSchema.index({ organizationId: 1, productId: 1, status: 1 });
EmailTemplateSchema.index({ organizationId: 1, productId: 1, slug: 1 }, { unique: true });
