import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { LeadSourceType } from '../types/lead.types';

export type LeadCaptureEndpointDocument = HydratedDocument<LeadCaptureEndpoint>;

@Schema({ timestamps: true })
export class LeadCaptureEndpoint {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  campaignId?: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  publicKey: string;

  @Prop({ type: String, enum: ['website_form', 'landing_page'], required: true })
  sourceType: Extract<LeadSourceType, 'website_form' | 'landing_page'>;

  @Prop()
  sourceName?: string;

  @Prop({ type: [String], default: [] })
  allowedOrigins: string[];

  @Prop({ required: true, default: true })
  active: boolean;

  @Prop({ required: true, default: false })
  requireConsent: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const LeadCaptureEndpointSchema = SchemaFactory.createForClass(LeadCaptureEndpoint);
LeadCaptureEndpointSchema.index({ publicKey: 1 }, { unique: true });
LeadCaptureEndpointSchema.index({ organizationId: 1, productId: 1, createdAt: -1 });
