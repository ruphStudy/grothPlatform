import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { EMAIL_EVENT_TYPES, EMAIL_PLATFORMS } from '../types/email.types';
import type { EmailEventType, EmailPlatform } from '../types/email.types';

export type EmailEventDocument = HydratedDocument<EmailEvent>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class EmailEvent {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  emailMessageId: Types.ObjectId;

  @Prop({ type: String, enum: EMAIL_PLATFORMS, required: true })
  provider: EmailPlatform;

  @Prop({ required: true })
  providerMessageId: string;

  @Prop({ type: String, enum: EMAIL_EVENT_TYPES, required: true })
  eventType: EmailEventType;

  @Prop()
  providerEventId?: string;

  @Prop({ required: true })
  occurredAt: Date;

  @Prop()
  linkUrl?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata?: Record<string, unknown>;

  createdAt?: Date;
}

export const EmailEventSchema = SchemaFactory.createForClass(EmailEvent);
EmailEventSchema.index({ organizationId: 1, productId: 1, emailMessageId: 1, occurredAt: -1 });
EmailEventSchema.index({ organizationId: 1, productId: 1, providerMessageId: 1 });
EmailEventSchema.index({ provider: 1, providerEventId: 1 }, { unique: true, sparse: true });
