import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ProductDocument = HydratedDocument<Product>;

export const PRODUCT_TYPES = [
  'saas',
  'service',
  'ecommerce',
  'mobile_app',
  'website',
  'local_business',
  'creator',
  'other',
] as const;

export const PRIMARY_GOALS = ['leads', 'signups', 'sales', 'traffic', 'awareness', 'engagement', 'other'] as const;

@Schema({ timestamps: true })
export class Product {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  slug: string;

  @Prop()
  websiteUrl?: string;

  @Prop()
  shortDescription?: string;

  @Prop({ type: String, enum: PRODUCT_TYPES, required: false })
  productType?: (typeof PRODUCT_TYPES)[number];

  @Prop({ type: String, enum: PRIMARY_GOALS, required: false })
  primaryGoal?: (typeof PRIMARY_GOALS)[number];

  @Prop({ type: [String], default: [] })
  targetMarkets: string[];

  @Prop({ type: String, required: true, enum: ['active', 'inactive'], default: 'active' })
  status: 'active' | 'inactive';
}

export const ProductSchema = SchemaFactory.createForClass(Product);
ProductSchema.index({ organizationId: 1, slug: 1 }, { unique: true });
