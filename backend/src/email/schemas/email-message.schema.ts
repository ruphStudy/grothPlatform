import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { EMAIL_BODY_TYPES, EMAIL_MESSAGE_STATUSES, EMAIL_PLATFORMS, EMAIL_SEND_REASONS } from '../types/email.types';
import type { EmailBodyType, EmailMessageStatus, EmailPlatform, EmailSendReason } from '../types/email.types';

export type EmailMessageDocument = HydratedDocument<EmailMessage>;

@Schema({ timestamps: true })
export class EmailMessage {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  leadId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  opportunityId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  campaignId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  emailConnectionId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  emailSenderId: Types.ObjectId;

  @Prop({ type: String, enum: EMAIL_PLATFORMS, required: true })
  provider: EmailPlatform;

  @Prop()
  providerMessageId?: string;

  @Prop({ required: true })
  fromEmail: string;

  @Prop()
  fromName?: string;

  @Prop({ required: true })
  toEmail: string;

  @Prop()
  toName?: string;

  @Prop()
  replyTo?: string;

  @Prop({ required: true })
  subject: string;

  @Prop({ type: String, enum: EMAIL_BODY_TYPES, required: true })
  bodyType: EmailBodyType;

  @Prop()
  htmlSnapshot?: string;

  @Prop()
  textSnapshot?: string;

  @Prop({ type: String, enum: EMAIL_MESSAGE_STATUSES, required: true, default: 'pending' })
  status: EmailMessageStatus;

  @Prop({ type: String, enum: EMAIL_SEND_REASONS, required: true })
  sendReason: EmailSendReason;

  @Prop({ required: true })
  idempotencyKey: string;

  @Prop()
  payloadHash?: string;

  @Prop()
  errorCode?: string;

  @Prop()
  acceptedAt?: Date;

  @Prop()
  failedAt?: Date;

  @Prop({ type: Types.ObjectId })
  createdByUserId?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export const EmailMessageSchema = SchemaFactory.createForClass(EmailMessage);
EmailMessageSchema.index({ organizationId: 1, productId: 1, createdAt: -1 });
EmailMessageSchema.index({ organizationId: 1, productId: 1, leadId: 1 });
EmailMessageSchema.index({ organizationId: 1, productId: 1, opportunityId: 1 });
EmailMessageSchema.index({ organizationId: 1, productId: 1, providerMessageId: 1 });
EmailMessageSchema.index({ organizationId: 1, productId: 1, idempotencyKey: 1 }, { unique: true });
