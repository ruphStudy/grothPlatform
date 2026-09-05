import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { CONTENT_GENERATION_KINDS } from '../types/content-generation.types';
import type { ContentGenerationKind } from '../types/content-generation.types';

export type ContentArtifactDocument = HydratedDocument<ContentArtifact>;

// Stable logical identity for one generated content lineage — e.g. "Campaign
// A / Blog Calendar Item X / kind=blog". Regeneration never creates a new
// artifact; it only adds a new ContentVersion and advances these pointers.
@Schema({ timestamps: true })
export class ContentArtifact {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Campaign', required: true })
  campaignId: Types.ObjectId;

  @Prop({ type: String, enum: CONTENT_GENERATION_KINDS, required: true })
  kind: ContentGenerationKind;

  @Prop({ required: true })
  sourceType: string;

  @Prop({ required: true })
  sourceId: string;

  @Prop({ required: true, default: 0 })
  latestVersion: number;

  @Prop({ type: Types.ObjectId, ref: 'ContentVersion' })
  latestVersionId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ContentArtifactSchema = SchemaFactory.createForClass(ContentArtifact);
ContentArtifactSchema.index({ organizationId: 1, productId: 1, campaignId: 1, kind: 1, sourceType: 1, sourceId: 1 }, { unique: true });
ContentArtifactSchema.index({ organizationId: 1, productId: 1, campaignId: 1, updatedAt: -1 });
