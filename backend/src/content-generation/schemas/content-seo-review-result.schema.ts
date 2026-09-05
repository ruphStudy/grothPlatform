import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { ContentSeoReviewStatus, SeoReviewCheckClassification, SeoReviewCheckType } from '../types/content-seo-review.types';

export const SEO_REVIEW_CHECK_TYPES: SeoReviewCheckType[] = [
  'title',
  'keyword_usage',
  'keyword_stuffing',
  'heading_structure',
  'introduction',
  'content_depth',
  'topic_alignment',
  'funnel_alignment',
  'cta_alignment',
  'duplicate_heading',
  'excessive_repetition',
  'metadata_readiness',
  'other',
];
export const SEO_REVIEW_CHECK_CLASSIFICATIONS: SeoReviewCheckClassification[] = ['passed', 'warning', 'failed', 'not_applicable'];
export const CONTENT_SEO_REVIEW_STATUSES: ContentSeoReviewStatus[] = ['optimized', 'needs_improvement', 'poor'];

export type ContentSeoReviewResultDocument = HydratedDocument<ContentSeoReviewResult>;

@Schema({ _id: false })
export class SeoReviewCheckRecord {
  @Prop({ required: true })
  id: string;

  @Prop({ type: String, enum: SEO_REVIEW_CHECK_TYPES, required: true })
  type: SeoReviewCheckType;

  @Prop({ type: String, enum: SEO_REVIEW_CHECK_CLASSIFICATIONS, required: true })
  classification: SeoReviewCheckClassification;

  @Prop({ type: Number })
  score?: number;

  @Prop({ required: true })
  reason: string;

  @Prop({ type: [String], default: [] })
  evidence?: string[];
}
export const SeoReviewCheckRecordSchema = SchemaFactory.createForClass(SeoReviewCheckRecord);

// One current SEO review per ContentVersion. Recheck recomputes/replaces
// this document — no separate review history yet.
@Schema({ timestamps: { createdAt: false, updatedAt: false } })
export class ContentSeoReviewResult {
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

  @Prop({ type: String, enum: CONTENT_SEO_REVIEW_STATUSES, required: true })
  status: ContentSeoReviewStatus;

  @Prop({ required: true, min: 0, max: 100 })
  score: number;

  @Prop({ type: [SeoReviewCheckRecordSchema], default: [] })
  checks: SeoReviewCheckRecord[];

  @Prop({ required: true, default: 0 })
  passedCount: number;

  @Prop({ required: true, default: 0 })
  warningCount: number;

  @Prop({ required: true, default: 0 })
  failedCount: number;

  @Prop({ type: [String], default: [] })
  warnings: string[];

  @Prop({ required: true })
  reviewedAt: Date;
}

export const ContentSeoReviewResultSchema = SchemaFactory.createForClass(ContentSeoReviewResult);
