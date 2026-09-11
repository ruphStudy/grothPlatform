import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { EMAIL_SEQUENCE_STATUSES } from '../types/email.types';
import type { EmailSequenceStatus } from '../types/email.types';

export type EmailSequenceDocument = HydratedDocument<EmailSequence>;

@Schema({ timestamps: true })
export class EmailSequence {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ type: Types.ObjectId })
  campaignId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  senderId: Types.ObjectId;

  @Prop({ type: String, enum: EMAIL_SEQUENCE_STATUSES, required: true, default: 'draft' })
  status: EmailSequenceStatus;

  @Prop({ default: false })
  stopOnReply?: boolean;

  @Prop({ default: true })
  stopOnOpportunityWon?: boolean;

  @Prop({ type: Types.ObjectId })
  createdByUserId?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export const EmailSequenceSchema = SchemaFactory.createForClass(EmailSequence);
EmailSequenceSchema.index({ organizationId: 1, productId: 1, status: 1, createdAt: -1 });
