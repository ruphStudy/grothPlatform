import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { CREATIVE_KINDS } from '../types/creative.types';
import type { CreativeKind } from '../types/creative.types';

export type CreativeAssetStatus = 'generated' | 'failed';
export type CreativeAssetDocument = HydratedDocument<CreativeAsset>;

// Denormalized reference to the ContentVersion this creative was generated
// from. Never mutates that version — CreativeAsset only ever reads it.
@Schema({ _id: false })
export class CreativeAssetSource {
  @Prop({ type: Types.ObjectId, required: true })
  contentArtifactId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  contentVersionId: Types.ObjectId;

  @Prop({ required: true })
  contentVersion: number;

  @Prop({ required: true })
  contentKind: string;

  @Prop({ required: true })
  platform: string;
}
export const CreativeAssetSourceSchema = SchemaFactory.createForClass(CreativeAssetSource);

// Deliberately no `base64` field — a provider's base64 payload must never
// be dumped into Mongo (17C item 28). Only a hosted URL or a future
// storage-key reference is persisted.
@Schema({ _id: false })
export class CreativeAssetFile {
  @Prop({ type: String, required: true, default: 'image' })
  type: 'image';

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
export const CreativeAssetFileSchema = SchemaFactory.createForClass(CreativeAssetFile);

// Deliberately excludes the raw/full prompt — only a version marker plus
// the caller-facing options that produced it.
@Schema({ _id: false })
export class CreativeAssetPromptSnapshot {
  @Prop({ required: true })
  promptVersion: string;

  @Prop()
  aspectRatio?: string;

  @Prop()
  styleDirection?: string;

  @Prop({ required: true, default: false })
  textOverlayEnabled: boolean;
}
export const CreativeAssetPromptSnapshotSchema = SchemaFactory.createForClass(CreativeAssetPromptSnapshot);

@Schema({ _id: false })
export class CreativeAssetUsage {
  @Prop()
  imageCount?: number;
}
export const CreativeAssetUsageSchema = SchemaFactory.createForClass(CreativeAssetUsage);

@Schema({ _id: false })
export class CreativeAssetCost {
  @Prop({ required: true, default: 'USD' })
  currency: 'USD';

  @Prop({ required: true })
  estimated: number;
}
export const CreativeAssetCostSchema = SchemaFactory.createForClass(CreativeAssetCost);

// 17C: the first persisted creative workflow. Each explicit "Generate
// Image" click creates a new CreativeAsset — never overwrites a previous
// one for the same source version.
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class CreativeAsset {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  campaignId: Types.ObjectId;

  @Prop({ type: String, enum: CREATIVE_KINDS, required: true })
  kind: CreativeKind;

  @Prop({ type: CreativeAssetSourceSchema, required: true })
  source: CreativeAssetSource;

  @Prop({ required: true })
  provider: string;

  @Prop()
  model?: string;

  @Prop({ type: CreativeAssetFileSchema, required: true })
  asset: CreativeAssetFile;

  @Prop({ type: CreativeAssetPromptSnapshotSchema, required: true })
  promptSnapshot: CreativeAssetPromptSnapshot;

  @Prop({ type: CreativeAssetUsageSchema })
  usage?: CreativeAssetUsage;

  @Prop({ type: CreativeAssetCostSchema })
  cost?: CreativeAssetCost;

  @Prop({ type: String, enum: ['generated', 'failed'], required: true })
  status: CreativeAssetStatus;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  createdAt?: Date;
}
export const CreativeAssetSchema = SchemaFactory.createForClass(CreativeAsset);
CreativeAssetSchema.index({ organizationId: 1, productId: 1, campaignId: 1, 'source.contentArtifactId': 1, 'source.contentVersionId': 1, createdAt: -1 });
