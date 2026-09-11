import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { EMAIL_SEQUENCE_DELAY_UNITS } from '../types/email.types';
import type { EmailSequenceDelayUnit } from '../types/email.types';

export type EmailSequenceStepDocument = HydratedDocument<EmailSequenceStep>;

@Schema({ timestamps: true })
export class EmailSequenceStep {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  sequenceId: Types.ObjectId;

  @Prop({ required: true })
  order: number;

  @Prop({ required: true, min: 0 })
  delayValue: number;

  @Prop({ type: String, enum: EMAIL_SEQUENCE_DELAY_UNITS, required: true })
  delayUnit: EmailSequenceDelayUnit;

  @Prop({ type: Types.ObjectId, required: true })
  templateId: Types.ObjectId;

  @Prop({ required: true })
  templateVersion: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const EmailSequenceStepSchema = SchemaFactory.createForClass(EmailSequenceStep);
EmailSequenceStepSchema.index({ organizationId: 1, productId: 1, sequenceId: 1, order: 1 }, { unique: true });
