import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { ContentReadabilityStatus, ReadabilityCheckClassification, ReadabilityCheckType } from '../types/content-readability.types';

export const READABILITY_CHECK_TYPES: ReadabilityCheckType[] = [
  'sentence_length',
  'paragraph_length',
  'sentence_variety',
  'paragraph_structure',
  'heading_support',
  'list_usage',
  'repetition',
  'complexity',
  'passive_voice',
  'scannability',
  'opening_clarity',
  'closing_clarity',
  'other',
];
export const READABILITY_CHECK_CLASSIFICATIONS: ReadabilityCheckClassification[] = ['passed', 'warning', 'failed', 'not_applicable'];
export const CONTENT_READABILITY_STATUSES: ContentReadabilityStatus[] = ['readable', 'needs_improvement', 'difficult'];

export type ContentReadabilityResultDocument = HydratedDocument<ContentReadabilityResult>;

@Schema({ _id: false })
export class ReadabilityCheckRecord {
  @Prop({ required: true })
  id: string;

  @Prop({ type: String, enum: READABILITY_CHECK_TYPES, required: true })
  type: ReadabilityCheckType;

  @Prop({ type: String, enum: READABILITY_CHECK_CLASSIFICATIONS, required: true })
  classification: ReadabilityCheckClassification;

  @Prop({ type: Number })
  score?: number;

  @Prop({ required: true })
  reason: string;

  @Prop({ type: [String], default: [] })
  evidence?: string[];
}
export const ReadabilityCheckRecordSchema = SchemaFactory.createForClass(ReadabilityCheckRecord);

@Schema({ _id: false })
export class ContentReadabilityMetricsRecord {
  @Prop({ required: true, default: 0 })
  wordCount: number;

  @Prop({ required: true, default: 0 })
  sentenceCount: number;

  @Prop({ required: true, default: 0 })
  paragraphCount: number;

  @Prop({ required: true, default: 0 })
  averageSentenceWords: number;

  @Prop({ required: true, default: 0 })
  averageParagraphWords: number;

  @Prop({ required: true, default: 0 })
  longSentenceCount: number;

  @Prop({ required: true, default: 0 })
  veryLongSentenceCount: number;

  @Prop({ required: true, default: 0 })
  longParagraphCount: number;

  @Prop({ type: Number })
  passiveVoiceApproxCount?: number;
}
export const ContentReadabilityMetricsRecordSchema = SchemaFactory.createForClass(ContentReadabilityMetricsRecord);

// One current readability review per ContentVersion. Recheck recomputes/replaces
// this document — no separate review history yet.
@Schema({ timestamps: { createdAt: false, updatedAt: false } })
export class ContentReadabilityResult {
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

  @Prop({ type: String, enum: CONTENT_READABILITY_STATUSES, required: true })
  status: ContentReadabilityStatus;

  @Prop({ required: true, min: 0, max: 100 })
  score: number;

  @Prop({ type: [ReadabilityCheckRecordSchema], default: [] })
  checks: ReadabilityCheckRecord[];

  @Prop({ required: true, default: 0 })
  passedCount: number;

  @Prop({ required: true, default: 0 })
  warningCount: number;

  @Prop({ required: true, default: 0 })
  failedCount: number;

  @Prop({ type: ContentReadabilityMetricsRecordSchema, required: true })
  metrics: ContentReadabilityMetricsRecord;

  @Prop({ type: [String], default: [] })
  warnings: string[];

  @Prop({ required: true })
  reviewedAt: Date;
}

export const ContentReadabilityResultSchema = SchemaFactory.createForClass(ContentReadabilityResult);
