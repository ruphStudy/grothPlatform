import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { EMAIL_CAMPAIGN_RECIPIENT_STATUSES, EMAIL_SKIP_REASONS } from '../types/email.types';
import type { EmailCampaignRecipientStatus, EmailSkipReason } from '../types/email.types';

export type EmailCampaignRecipientDocument = HydratedDocument<EmailCampaignRecipient>;

@Schema({ timestamps: true })
export class EmailCampaignRecipient {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  emailCampaignId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  leadId: Types.ObjectId;

  @Prop({ required: true })
  normalizedEmail: string;

  @Prop({ type: String, enum: EMAIL_CAMPAIGN_RECIPIENT_STATUSES, required: true, default: 'pending' })
  status: EmailCampaignRecipientStatus;

  @Prop({ type: String, enum: EMAIL_SKIP_REASONS })
  skipReason?: EmailSkipReason;

  @Prop({ type: Types.ObjectId })
  emailMessageId?: Types.ObjectId;

  @Prop()
  providerMessageId?: string;

  @Prop({ required: true })
  idempotencyKey: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const EmailCampaignRecipientSchema = SchemaFactory.createForClass(EmailCampaignRecipient);
EmailCampaignRecipientSchema.index({ organizationId: 1, productId: 1, emailCampaignId: 1, status: 1 });
EmailCampaignRecipientSchema.index({ organizationId: 1, productId: 1, leadId: 1 });
EmailCampaignRecipientSchema.index({ organizationId: 1, productId: 1, idempotencyKey: 1 }, { unique: true });
