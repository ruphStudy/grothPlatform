import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const BUSINESS_MODELS = ['b2b', 'b2c', 'b2b2c', 'marketplace', 'unknown'] as const;

export type ProductIntelligenceProfileDocument = HydratedDocument<ProductIntelligenceProfile>;

@Schema({ _id: false })
export class TargetAudience {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  description: string;

  @Prop({ type: [String], default: [] })
  painPoints: string[];

  @Prop({ type: [String], default: [] })
  goals: string[];
}
const TargetAudienceSchema = SchemaFactory.createForClass(TargetAudience);

@Schema({ timestamps: true })
export class ProductIntelligenceProfile {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', required: true, unique: true })
  productId: Types.ObjectId;

  @Prop({ required: true })
  summary: string;

  @Prop({ required: true })
  category: string;

  @Prop({ type: String, enum: BUSINESS_MODELS, required: true, default: 'unknown' })
  businessModel: (typeof BUSINESS_MODELS)[number];

  @Prop({ required: true })
  valueProposition: string;

  @Prop({ type: [String], default: [] })
  coreFeatures: string[];

  @Prop({ type: [String], default: [] })
  problemsSolved: string[];

  @Prop({ type: [TargetAudienceSchema], default: [] })
  targetAudiences: TargetAudience[];

  @Prop({ type: [String], default: [] })
  likelyUseCases: string[];

  @Prop({ type: [String], default: [] })
  differentiators: string[];

  @Prop({ required: true })
  suggestedPositioning: string;

  @Prop({ type: [String], default: [] })
  marketingAngles: string[];

  @Prop({ type: [String], default: [] })
  missingInformation: string[];

  @Prop({ required: true, min: 0, max: 100 })
  confidenceScore: number;

  @Prop({ required: true })
  aiProvider: string;

  @Prop({ required: true })
  aiModel: string;

  @Prop({ required: true, default: 1 })
  version: number;
}

export const ProductIntelligenceProfileSchema = SchemaFactory.createForClass(ProductIntelligenceProfile);
