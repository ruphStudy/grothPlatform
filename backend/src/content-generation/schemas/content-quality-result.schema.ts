import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { ContentQualityBlockerSeverity, ContentQualityDimensionType, ContentQualityStatus } from '../types/content-quality.types';

export const CONTENT_QUALITY_DIMENSION_TYPES: ContentQualityDimensionType[] = ['grounding', 'fact_validation', 'seo', 'readability', 'brand_voice', 'originality'];
export const CONTENT_QUALITY_STATUSES: ContentQualityStatus[] = ['excellent', 'good', 'needs_improvement', 'poor'];
export const CONTENT_QUALITY_BLOCKER_SEVERITIES: ContentQualityBlockerSeverity[] = ['medium', 'high'];

export type ContentQualityResultDocument = HydratedDocument<ContentQualityResult>;

@Schema({ _id: false })
export class ContentQualityDimensionRecord {
  @Prop({ type: String, enum: CONTENT_QUALITY_DIMENSION_TYPES, required: true })
  type: ContentQualityDimensionType;

  @Prop({ required: true })
  score: number;

  @Prop({ required: true })
  weight: number;

  @Prop({ required: true })
  weightedScore: number;

  @Prop({ required: true })
  status: string;

  @Prop({ required: true })
  applicable: boolean;
}
export const ContentQualityDimensionRecordSchema = SchemaFactory.createForClass(ContentQualityDimensionRecord);

@Schema({ _id: false })
export class ContentQualityBlockerRecord {
  @Prop({ required: true })
  type: string;

  @Prop({ type: String, enum: CONTENT_QUALITY_BLOCKER_SEVERITIES, required: true })
  severity: ContentQualityBlockerSeverity;

  @Prop({ required: true })
  reason: string;
}
export const ContentQualityBlockerRecordSchema = SchemaFactory.createForClass(ContentQualityBlockerRecord);

// One current Quality Score per ContentVersion. Recalculation upserts/
// replaces this document — no separate quality history yet. This is a pure
// aggregator over the persisted 16A-16F results for the SAME ContentVersion
// — it never recomputes or alters those underlying results.
@Schema({ timestamps: { createdAt: false, updatedAt: false } })
export class ContentQualityResult {
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

  @Prop({ type: String, enum: CONTENT_QUALITY_STATUSES, required: true })
  status: ContentQualityStatus;

  @Prop({ required: true, min: 0, max: 100 })
  score: number;

  @Prop({ type: [ContentQualityDimensionRecordSchema], default: [] })
  dimensions: ContentQualityDimensionRecord[];

  @Prop({ type: [ContentQualityBlockerRecordSchema], default: [] })
  blockers: ContentQualityBlockerRecord[];

  @Prop({ type: [String], default: [] })
  strengths: string[];

  @Prop({ type: [String], default: [] })
  weaknesses: string[];

  @Prop({ type: [String], default: [] })
  warnings: string[];

  @Prop({ required: true })
  calculatedAt: Date;
}

export const ContentQualityResultSchema = SchemaFactory.createForClass(ContentQualityResult);
