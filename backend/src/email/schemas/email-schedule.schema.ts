import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { EMAIL_SCHEDULE_STATUSES } from '../types/email.types';
import type { EmailScheduleStatus } from '../types/email.types';

export type EmailScheduleDocument = HydratedDocument<EmailSchedule>;

@Schema({ timestamps: true })
export class EmailSchedule {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  leadId: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  opportunityId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  campaignId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  senderId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  templateId: Types.ObjectId;

  @Prop({ required: true })
  templateVersion: number;

  @Prop({ required: true })
  scheduledAt: Date;

  @Prop()
  timezone?: string;

  @Prop({ type: String, enum: EMAIL_SCHEDULE_STATUSES, required: true, default: 'scheduled' })
  status: EmailScheduleStatus;

  @Prop({ required: true })
  idempotencyKey: string;

  @Prop({ type: Types.ObjectId })
  emailMessageId?: Types.ObjectId;

  @Prop()
  lockedAt?: Date;

  @Prop()
  lockedBy?: string;

  @Prop({ type: Types.ObjectId })
  createdByUserId?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export const EmailScheduleSchema = SchemaFactory.createForClass(EmailSchedule);
EmailScheduleSchema.index({ organizationId: 1, productId: 1, status: 1, scheduledAt: 1 });
EmailScheduleSchema.index({ organizationId: 1, productId: 1, idempotencyKey: 1 }, { unique: true });
