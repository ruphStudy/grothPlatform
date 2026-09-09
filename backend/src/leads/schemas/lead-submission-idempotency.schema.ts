import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type LeadSubmissionIdempotencyDocument = HydratedDocument<LeadSubmissionIdempotency>;

@Schema({ timestamps: true })
export class LeadSubmissionIdempotency {
  @Prop({ type: Types.ObjectId, required: true })
  endpointId: Types.ObjectId;

  @Prop({ required: true })
  key: string;

  @Prop({ required: true })
  payloadHash: string;

  @Prop({ type: Types.ObjectId })
  leadId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  sourceEventId?: Types.ObjectId;

  @Prop({ required: true })
  outcome: 'created' | 'matched' | 'conflict';

  createdAt?: Date;
  updatedAt?: Date;
}

export const LeadSubmissionIdempotencySchema = SchemaFactory.createForClass(LeadSubmissionIdempotency);
LeadSubmissionIdempotencySchema.index({ endpointId: 1, key: 1 }, { unique: true });
