import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CrmConversionIdempotencyDocument = HydratedDocument<CrmConversionIdempotency>;

@Schema({ timestamps: true })
export class CrmConversionIdempotency {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  leadId: Types.ObjectId;

  @Prop({ required: true })
  idempotencyKey: string;

  @Prop({ required: true })
  payloadHash: string;

  @Prop({ type: Types.ObjectId, required: true })
  opportunityId: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CrmConversionIdempotencySchema = SchemaFactory.createForClass(CrmConversionIdempotency);
CrmConversionIdempotencySchema.index({ organizationId: 1, productId: 1, leadId: 1, idempotencyKey: 1 }, { unique: true });
