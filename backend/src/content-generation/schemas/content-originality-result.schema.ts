import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { ContentOriginalityStatus, OriginalityCheckClassification, OriginalityCheckType } from '../types/content-originality.types';

export const ORIGINALITY_CHECK_TYPES: OriginalityCheckType[] = [
  'internal_repetition',
  'sentence_duplication',
  'paragraph_duplication',
  'phrase_repetition',
  'cross_version_similarity',
  'cross_artifact_similarity',
  'template_repetition',
  'other',
];
export const ORIGINALITY_CHECK_CLASSIFICATIONS: OriginalityCheckClassification[] = ['passed', 'warning', 'failed', 'not_applicable'];
export const CONTENT_ORIGINALITY_STATUSES: ContentOriginalityStatus[] = ['original', 'needs_review', 'highly_repetitive'];

export type ContentOriginalityResultDocument = HydratedDocument<ContentOriginalityResult>;

@Schema({ _id: false })
export class OriginalityCheckRecord {
  @Prop({ required: true })
  id: string;

  @Prop({ type: String, enum: ORIGINALITY_CHECK_TYPES, required: true })
  type: OriginalityCheckType;

  @Prop({ type: String, enum: ORIGINALITY_CHECK_CLASSIFICATIONS, required: true })
  classification: OriginalityCheckClassification;

  @Prop({ type: Number })
  score?: number;

  @Prop({ required: true })
  reason: string;

  @Prop({ type: Types.ObjectId, ref: 'ContentVersion' })
  matchedVersionId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ContentArtifact' })
  matchedArtifactId?: Types.ObjectId;

  @Prop({ type: [String], default: [] })
  evidence?: string[];
}
export const OriginalityCheckRecordSchema = SchemaFactory.createForClass(OriginalityCheckRecord);

// One current Originality review per ContentVersion. Recheck recomputes/
// replaces this document — no separate review history yet.
@Schema({ timestamps: { createdAt: false, updatedAt: false } })
export class ContentOriginalityResult {
  @Prop({ type: Types.ObjectId, ref: 'ContentVersion', required: true, unique: true })
  contentVersionId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ContentArtifact', required: true })
  artifactId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Campaign', required: true })
  campaignId: Types.ObjectId;

  @Prop({ type: String, enum: CONTENT_ORIGINALITY_STATUSES, required: true })
  status: ContentOriginalityStatus;

  @Prop({ required: true, min: 0, max: 100 })
  score: number;

  @Prop({ type: [OriginalityCheckRecordSchema], default: [] })
  checks: OriginalityCheckRecord[];

  @Prop({ required: true, default: 0 })
  passedCount: number;

  @Prop({ required: true, default: 0 })
  warningCount: number;

  @Prop({ required: true, default: 0 })
  failedCount: number;

  @Prop({ required: true, default: 0 })
  duplicateSentenceCount: number;

  @Prop({ required: true, default: 0 })
  duplicateParagraphCount: number;

  @Prop({ required: true, default: 0 })
  crossContentMatchCount: number;

  @Prop({ type: [String], default: [] })
  warnings: string[];

  @Prop({ required: true })
  reviewedAt: Date;
}

export const ContentOriginalityResultSchema = SchemaFactory.createForClass(ContentOriginalityResult);
