import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { EMAIL_CAMPAIGN_STATUSES } from '../types/email.types';
import type { EmailAudienceDefinition, EmailCampaignStatus } from '../types/email.types';

export type EmailCampaignDocument = HydratedDocument<EmailCampaign>;

@Schema({ timestamps: true })
export class EmailCampaign {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  campaignId?: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ type: Types.ObjectId, required: true })
  emailTemplateId: Types.ObjectId;

  @Prop({ required: true })
  emailTemplateVersion: number;

  @Prop({ type: Types.ObjectId, required: true })
  senderId: Types.ObjectId;

  @Prop()
  subjectOverride?: string;

  @Prop({ type: String, enum: EMAIL_CAMPAIGN_STATUSES, required: true, default: 'draft' })
  status: EmailCampaignStatus;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  audienceDefinition: EmailAudienceDefinition;

  @Prop()
  recipientCount?: number;

  @Prop()
  acceptedCount?: number;

  @Prop()
  failedCount?: number;

  @Prop()
  skippedCount?: number;

  @Prop()
  startedAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop({ type: Types.ObjectId })
  createdByUserId?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export const EmailCampaignSchema = SchemaFactory.createForClass(EmailCampaign);
EmailCampaignSchema.index({ organizationId: 1, productId: 1, status: 1, createdAt: -1 });
