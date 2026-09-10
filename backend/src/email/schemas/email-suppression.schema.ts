import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { EMAIL_SUPPRESSION_REASONS } from '../types/email.types';
import type { EmailSuppressionReason } from '../types/email.types';

export type EmailSuppressionDocument = HydratedDocument<EmailSuppression>;

@Schema({ timestamps: true })
export class EmailSuppression {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ required: true })
  normalizedEmail: string;

  @Prop({ type: String, enum: EMAIL_SUPPRESSION_REASONS, required: true })
  reason: EmailSuppressionReason;

  @Prop({ required: true, default: true })
  active: boolean;

  @Prop()
  source?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const EmailSuppressionSchema = SchemaFactory.createForClass(EmailSuppression);
EmailSuppressionSchema.index({ organizationId: 1, productId: 1, normalizedEmail: 1, active: 1 });
