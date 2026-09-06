import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { HumanReviewDecision, HumanReviewReasonCategory, HumanReviewReasonSeverity } from '../types/content-human-review.types';

export const HUMAN_REVIEW_DECISIONS: HumanReviewDecision[] = ['auto_clear', 'review_recommended', 'review_required'];
export const HUMAN_REVIEW_REASON_CATEGORIES: HumanReviewReasonCategory[] = [
  'grounding',
  'fact_validation',
  'seo',
  'readability',
  'brand_voice',
  'originality',
  'quality',
  'generation',
  'other',
];
export const HUMAN_REVIEW_REASON_SEVERITIES: HumanReviewReasonSeverity[] = ['low', 'medium', 'high', 'critical'];

export type ContentHumanReviewResultDocument = HydratedDocument<ContentHumanReviewResult>;

@Schema({ _id: false })
export class HumanReviewReasonRecord {
  @Prop({ required: true })
  id: string;

  @Prop({ type: String, enum: HUMAN_REVIEW_REASON_CATEGORIES, required: true })
  category: HumanReviewReasonCategory;

  @Prop({ type: String, enum: HUMAN_REVIEW_REASON_SEVERITIES, required: true })
  severity: HumanReviewReasonSeverity;

  @Prop({ required: true })
  reason: string;
}
export const HumanReviewReasonRecordSchema = SchemaFactory.createForClass(HumanReviewReasonRecord);

// One current Human Review decision per ContentVersion. Re-evaluation
// upserts/replaces this document — no separate history yet. This answers
// only "does this content require human review?" — it is not an approval
// workflow (that is Sprint 28) and never publishes/rejects anything.
@Schema({ timestamps: { createdAt: false, updatedAt: false } })
export class ContentHumanReviewResult {
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

  @Prop({ type: String, enum: HUMAN_REVIEW_DECISIONS, required: true })
  decision: HumanReviewDecision;

  @Prop({ required: true, min: 0, max: 100 })
  riskScore: number;

  @Prop({ type: [HumanReviewReasonRecordSchema], default: [] })
  reasons: HumanReviewReasonRecord[];

  @Prop({ type: [String], default: [] })
  triggeredRuleIds: string[];

  @Prop({ type: Number })
  evaluatedQualityScore?: number;

  @Prop({ required: true })
  evaluatedAt: Date;
}

export const ContentHumanReviewResultSchema = SchemaFactory.createForClass(ContentHumanReviewResult);
