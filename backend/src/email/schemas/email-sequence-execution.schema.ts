import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { EMAIL_SEQUENCE_EXECUTION_STATUSES } from '../types/email.types';
import type { EmailSequenceExecutionStatus } from '../types/email.types';

export type EmailSequenceExecutionDocument = HydratedDocument<EmailSequenceExecution>;

@Schema({ timestamps: true })
export class EmailSequenceExecution {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  sequenceId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  enrollmentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  stepId: Types.ObjectId;

  @Prop({ required: true })
  stepOrder: number;

  @Prop({ type: Types.ObjectId, required: true })
  leadId: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  emailMessageId?: Types.ObjectId;

  @Prop({ type: String, enum: EMAIL_SEQUENCE_EXECUTION_STATUSES, required: true, default: 'pending' })
  status: EmailSequenceExecutionStatus;

  @Prop()
  skipReason?: string;

  @Prop()
  errorCode?: string;

  @Prop({ required: true })
  scheduledAt: Date;

  @Prop()
  processedAt?: Date;

  @Prop({ required: true })
  idempotencyKey: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const EmailSequenceExecutionSchema = SchemaFactory.createForClass(EmailSequenceExecution);
EmailSequenceExecutionSchema.index({ organizationId: 1, productId: 1, enrollmentId: 1, stepOrder: 1 });
EmailSequenceExecutionSchema.index({ organizationId: 1, productId: 1, idempotencyKey: 1 }, { unique: true });
