import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { EMAIL_CONNECTION_STATUSES, EMAIL_PLATFORMS } from '../types/email.types';
import type { EmailConnectionStatus, EmailPlatform, EmailProviderCapabilities } from '../types/email.types';

export type EmailConnectionDocument = HydratedDocument<EmailConnection>;

@Schema({ timestamps: true })
export class EmailConnection {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: String, enum: EMAIL_PLATFORMS, required: true })
  platform: EmailPlatform;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  encryptedCredential: string;

  @Prop({ type: String, enum: EMAIL_CONNECTION_STATUSES, required: true, default: 'invalid' })
  status: EmailConnectionStatus;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  capabilities: EmailProviderCapabilities;

  @Prop()
  lastValidatedAt?: Date;

  @Prop()
  errorCode?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const EmailConnectionSchema = SchemaFactory.createForClass(EmailConnection);
EmailConnectionSchema.index({ organizationId: 1, productId: 1, status: 1 });
EmailConnectionSchema.index({ organizationId: 1, productId: 1, platform: 1, name: 1 });
