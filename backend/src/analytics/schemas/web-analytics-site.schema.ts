import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WebAnalyticsSiteDocument = HydratedDocument<WebAnalyticsSite>;

@Schema({ timestamps: true })
export class WebAnalyticsSite {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ required: true, maxlength: 120 })
  name: string;

  @Prop({ required: true, maxlength: 500 })
  websiteUrl: string;

  @Prop({ required: true, lowercase: true, maxlength: 500 })
  normalizedOrigin: string;

  @Prop({ required: true, unique: true })
  trackingKey: string;

  @Prop({ enum: ['active', 'disabled'], default: 'active' })
  status: 'active' | 'disabled';

  @Prop({ type: [String], default: [] })
  allowedOrigins: string[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const WebAnalyticsSiteSchema = SchemaFactory.createForClass(WebAnalyticsSite);
WebAnalyticsSiteSchema.index({ organizationId: 1, productId: 1, status: 1 });
WebAnalyticsSiteSchema.index({ trackingKey: 1 }, { unique: true });
