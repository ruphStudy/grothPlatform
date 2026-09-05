import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { BrandVoiceCheckClassification, BrandVoiceCheckType, ContentBrandVoiceStatus } from '../types/content-brand-voice.types';

export const BRAND_VOICE_CHECK_TYPES: BrandVoiceCheckType[] = [
  'requested_tone',
  'style_alignment',
  'avoid_rules',
  'hype',
  'professionalism',
  'conversationality',
  'clarity',
  'consistency',
  'unsupported_voice_claims',
  'platform_fit',
  'other',
];
export const BRAND_VOICE_CHECK_CLASSIFICATIONS: BrandVoiceCheckClassification[] = ['passed', 'warning', 'failed', 'not_applicable'];
export const CONTENT_BRAND_VOICE_STATUSES: ContentBrandVoiceStatus[] = ['aligned', 'needs_adjustment', 'misaligned'];

export type ContentBrandVoiceResultDocument = HydratedDocument<ContentBrandVoiceResult>;

@Schema({ _id: false })
export class BrandVoiceCheckRecord {
  @Prop({ required: true })
  id: string;

  @Prop({ type: String, enum: BRAND_VOICE_CHECK_TYPES, required: true })
  type: BrandVoiceCheckType;

  @Prop({ type: String, enum: BRAND_VOICE_CHECK_CLASSIFICATIONS, required: true })
  classification: BrandVoiceCheckClassification;

  @Prop({ type: Number })
  score?: number;

  @Prop({ required: true })
  reason: string;

  @Prop({ type: [String], default: [] })
  evidence?: string[];
}
export const BrandVoiceCheckRecordSchema = SchemaFactory.createForClass(BrandVoiceCheckRecord);

// One current Brand Voice review per ContentVersion. Recheck recomputes/
// replaces this document — no separate review history yet.
@Schema({ timestamps: { createdAt: false, updatedAt: false } })
export class ContentBrandVoiceResult {
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

  @Prop({ type: String, enum: CONTENT_BRAND_VOICE_STATUSES, required: true })
  status: ContentBrandVoiceStatus;

  @Prop({ required: true, min: 0, max: 100 })
  score: number;

  @Prop({ type: [BrandVoiceCheckRecordSchema], default: [] })
  checks: BrandVoiceCheckRecord[];

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

export const ContentBrandVoiceResultSchema = SchemaFactory.createForClass(ContentBrandVoiceResult);
