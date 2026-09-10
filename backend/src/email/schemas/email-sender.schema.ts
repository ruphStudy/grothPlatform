import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { EMAIL_SENDER_STATUSES, EMAIL_SENDER_TYPES } from '../types/email.types';
import type { EmailDnsRecord, EmailSenderStatus, EmailSenderType } from '../types/email.types';

export type EmailSenderDocument = HydratedDocument<EmailSender>;

@Schema({ timestamps: true })
export class EmailSender {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  emailConnectionId: Types.ObjectId;

  @Prop({ required: true })
  email: string;

  @Prop()
  name?: string;

  @Prop({ required: true })
  domain: string;

  @Prop({ type: String, enum: EMAIL_SENDER_TYPES, required: true, default: 'email' })
  type: EmailSenderType;

  @Prop({ type: String, enum: EMAIL_SENDER_STATUSES, required: true, default: 'pending' })
  status: EmailSenderStatus;

  @Prop()
  providerSenderId?: string;

  @Prop()
  providerDomainId?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  verificationDetails?: { dnsRecords?: EmailDnsRecord[]; message?: string };

  @Prop()
  lastCheckedAt?: Date;

  @Prop({ default: false })
  isDefault?: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const EmailSenderSchema = SchemaFactory.createForClass(EmailSender);
EmailSenderSchema.index({ organizationId: 1, productId: 1, status: 1 });
EmailSenderSchema.index({ organizationId: 1, productId: 1, emailConnectionId: 1 });
EmailSenderSchema.index({ organizationId: 1, productId: 1, email: 1 });
EmailSenderSchema.index({ organizationId: 1, productId: 1, domain: 1 });
