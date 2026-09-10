import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type EmailUnsubscribeTokenDocument = HydratedDocument<EmailUnsubscribeToken>;

@Schema({ timestamps: true })
export class EmailUnsubscribeToken {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  leadId: Types.ObjectId;

  @Prop({ required: true })
  normalizedEmail: string;

  @Prop({ required: true })
  tokenHash: string;

  @Prop()
  usedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const EmailUnsubscribeTokenSchema = SchemaFactory.createForClass(EmailUnsubscribeToken);
EmailUnsubscribeTokenSchema.index({ tokenHash: 1 }, { unique: true });
EmailUnsubscribeTokenSchema.index({ organizationId: 1, productId: 1, leadId: 1 });
