import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type LegalAcceptanceDocument = HydratedDocument<LegalAcceptance>;
export const LEGAL_DOCUMENT_TYPES = ['terms', 'privacy'] as const;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class LegalAcceptance {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: LEGAL_DOCUMENT_TYPES, required: true })
  documentType: (typeof LEGAL_DOCUMENT_TYPES)[number];

  @Prop({ required: true })
  version: string;

  @Prop({ required: true })
  acceptedAt: Date;

  @Prop()
  ipHash?: string;

  @Prop()
  userAgentSummary?: string;
}

export const LegalAcceptanceSchema = SchemaFactory.createForClass(LegalAcceptance);
LegalAcceptanceSchema.index({ userId: 1, documentType: 1, version: 1 }, { unique: true });
