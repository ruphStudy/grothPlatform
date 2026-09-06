import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { CREATIVE_KINDS } from '../types/creative.types';
import type { CreativeKind } from '../types/creative.types';
import { BRAND_ASSET_TYPES } from '../types/brand-asset.types';
import type { BrandAssetSource, BrandAssetType } from '../types/brand-asset.types';

export type BrandAssetDocument = HydratedDocument<BrandAsset>;

// Deliberately no `base64` field — the same policy as CreativeAssetFile
// (17C item 28): only a hosted URL or a future storage-key reference.
@Schema({ _id: false })
export class BrandAssetFile {
  @Prop()
  url?: string;

  @Prop()
  storageKey?: string;

  @Prop()
  mimeType?: string;

  @Prop()
  width?: number;

  @Prop()
  height?: number;
}
export const BrandAssetFileSchema = SchemaFactory.createForClass(BrandAssetFile);

@Schema({ _id: false })
export class BrandAssetUsage {
  @Prop()
  primary?: boolean;

  @Prop({ type: [String], enum: CREATIVE_KINDS })
  allowedCreativeKinds?: CreativeKind[];
}
export const BrandAssetUsageSchema = SchemaFactory.createForClass(BrandAssetUsage);

@Schema({ _id: false })
export class BrandAssetMetadata {
  @Prop({ type: String, enum: ['uploaded', 'generated', 'external'] })
  source?: BrandAssetSource;

  @Prop()
  altText?: string;
}
export const BrandAssetMetadataSchema = SchemaFactory.createForClass(BrandAssetMetadata);

// Reusable brand reference material (logos, product images, screenshots,
// etc.) an organization/product maintains for future creative generation
// to reference — this sprint only stores and organizes them; it never
// generates a new image on its own.
@Schema({ timestamps: true })
export class BrandAsset {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: String, enum: BRAND_ASSET_TYPES, required: true })
  type: BrandAssetType;

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ type: BrandAssetFileSchema, required: true })
  asset: BrandAssetFile;

  @Prop({ type: BrandAssetUsageSchema })
  usage?: BrandAssetUsage;

  @Prop({ type: BrandAssetMetadataSchema })
  metadata?: BrandAssetMetadata;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}
export const BrandAssetSchema = SchemaFactory.createForClass(BrandAsset);
BrandAssetSchema.index({ organizationId: 1, productId: 1, type: 1 });
