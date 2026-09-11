import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { EMAIL_SEQUENCE_ENROLLMENT_STATUSES, EMAIL_SEQUENCE_STOP_REASONS } from '../types/email.types';
import type { EmailSequenceEnrollmentStatus, EmailSequenceStopReason } from '../types/email.types';

export type EmailSequenceEnrollmentDocument = HydratedDocument<EmailSequenceEnrollment>;

@Schema({ timestamps: true })
export class EmailSequenceEnrollment {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  sequenceId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  leadId: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  opportunityId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  campaignId?: Types.ObjectId;

  @Prop({ type: String, enum: EMAIL_SEQUENCE_ENROLLMENT_STATUSES, required: true, default: 'active' })
  status: EmailSequenceEnrollmentStatus;

  @Prop()
  currentStepOrder?: number;

  @Prop()
  nextStepAt?: Date;

  @Prop({ required: true })
  startedAt: Date;

  @Prop()
  completedAt?: Date;

  @Prop()
  stoppedAt?: Date;

  @Prop({ type: String, enum: EMAIL_SEQUENCE_STOP_REASONS })
  stopReason?: EmailSequenceStopReason;

  @Prop()
  lockedAt?: Date;

  @Prop()
  lockedBy?: string;

  @Prop({ default: 0 })
  attemptCount?: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const EmailSequenceEnrollmentSchema = SchemaFactory.createForClass(EmailSequenceEnrollment);
EmailSequenceEnrollmentSchema.index({ organizationId: 1, productId: 1, sequenceId: 1, status: 1, nextStepAt: 1 });
EmailSequenceEnrollmentSchema.index({ organizationId: 1, productId: 1, sequenceId: 1, leadId: 1, status: 1 });
EmailSequenceEnrollmentSchema.index(
  { organizationId: 1, productId: 1, sequenceId: 1, leadId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['active', 'paused'] } } },
);
