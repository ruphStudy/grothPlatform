import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { CONTENT_GENERATION_KINDS } from '../types/content-generation.types';
import type { ContentGenerationKind } from '../types/content-generation.types';

export type ContentVersionDocument = HydratedDocument<ContentVersion>;

@Schema({ _id: false })
export class ContentVersionScene {
  @Prop({ required: true })
  order: number;

  @Prop({ type: String })
  heading?: string;

  @Prop({ required: true })
  narration: string;

  @Prop({ type: String })
  visualDirection?: string;
}
export const ContentVersionSceneSchema = SchemaFactory.createForClass(ContentVersionScene);

// Union of the fields any 15C-15I adapter result can carry — all optional,
// each explicitly typed rather than a broad `Mixed` blob.
@Schema({ _id: false })
export class ContentVersionPayload {
  @Prop({ type: String })
  title?: string;

  @Prop({ type: String })
  content?: string;

  @Prop({ type: String })
  format?: string;

  @Prop({ type: String })
  subjectLine?: string;

  @Prop({ type: String })
  preheader?: string;

  @Prop({ type: [String], default: undefined })
  posts?: string[];

  @Prop({ type: [Number], default: undefined })
  postCharacterCounts?: number[];

  @Prop({ type: String })
  hook?: string;

  @Prop({ type: [ContentVersionSceneSchema], default: undefined })
  scenes?: ContentVersionScene[];

  @Prop({ type: String })
  mode?: string;

  @Prop({ type: Number })
  wordCount?: number;

  @Prop({ type: Number })
  characterCount?: number;

  @Prop({ type: Number })
  estimatedWordCount?: number;

  @Prop({ type: Number })
  estimatedDurationSeconds?: number;

  @Prop({ type: Number })
  hashtagCount?: number;

  @Prop({ type: Number })
  emojiCount?: number;
}
export const ContentVersionPayloadSchema = SchemaFactory.createForClass(ContentVersionPayload);

@Schema({ _id: false })
export class ContentVersionUsage {
  @Prop({ type: Number })
  inputTokens?: number;

  @Prop({ type: Number })
  outputTokens?: number;

  @Prop({ type: Number })
  totalTokens?: number;
}
export const ContentVersionUsageSchema = SchemaFactory.createForClass(ContentVersionUsage);

@Schema({ _id: false })
export class ContentVersionCost {
  @Prop({ type: String, enum: ['USD'], required: true, default: 'USD' })
  currency: 'USD';

  @Prop({ type: Number, required: true })
  estimated: number;
}
export const ContentVersionCostSchema = SchemaFactory.createForClass(ContentVersionCost);

@Schema({ _id: false })
export class ContentVersionSourceContext {
  @Prop({ type: String })
  strategyGeneratedAt?: string;

  @Prop({ type: Number })
  campaignPlanningVersion?: number;

  @Prop({ type: [String], default: undefined })
  sourceIds?: string[];
}
export const ContentVersionSourceContextSchema = SchemaFactory.createForClass(ContentVersionSourceContext);

// Never carries systemPrompt, the full generation prompt, or the raw
// provider response — only safe, already-normalized generation accounting.
@Schema({ _id: false })
export class ContentVersionGenerationMetadata {
  @Prop({ required: true })
  provider: string;

  @Prop({ required: true })
  model: string;

  @Prop({ required: true })
  promptVersion: string;

  @Prop({ type: ContentVersionUsageSchema })
  usage?: ContentVersionUsage;

  @Prop({ type: ContentVersionCostSchema })
  cost?: ContentVersionCost;

  @Prop({ type: ContentVersionSourceContextSchema })
  sourceContext?: ContentVersionSourceContext;

  @Prop({ type: [String], default: [] })
  warnings: string[];

  @Prop({ required: true })
  generatedAt: Date;
}
export const ContentVersionGenerationMetadataSchema = SchemaFactory.createForClass(ContentVersionGenerationMetadata);

@Schema({ _id: false })
export class ContentVersionGenerationOptions {
  @Prop({ type: String })
  language?: string;

  @Prop({ type: String })
  tone?: string;

  @Prop({ type: String })
  length?: string;

  @Prop({ type: String })
  duration?: string;

  @Prop({ type: String })
  mode?: string;

  @Prop({ type: String })
  outputFormat?: string;

  @Prop({ type: Boolean })
  includeCTA?: boolean;

  @Prop({ type: Boolean })
  includeHashtags?: boolean;

  @Prop({ type: Boolean })
  includeEmojis?: boolean;

  @Prop({ type: Boolean })
  includeSubjectLine?: boolean;

  @Prop({ type: Boolean })
  includePreheader?: boolean;

  @Prop({ type: Boolean })
  includeHook?: boolean;

  @Prop({ type: Boolean })
  includeSceneDirections?: boolean;

  @Prop({ type: Number })
  maxHashtags?: number;

  @Prop({ type: Number })
  maxEmojis?: number;

  @Prop({ type: Number })
  threadMaxPosts?: number;
}
export const ContentVersionGenerationOptionsSchema = SchemaFactory.createForClass(ContentVersionGenerationOptions);

// Small denormalized snapshot of the planning source at generation time —
// keeps history understandable even if planning later changes. Never the
// full Growth Strategy payload.
@Schema({ _id: false })
export class ContentVersionSourceSnapshot {
  @Prop({ type: String })
  title?: string;

  @Prop({ type: String })
  type?: string;

  @Prop({ type: String })
  pillarId?: string;

  @Prop({ type: String })
  topicId?: string;
}
export const ContentVersionSourceSnapshotSchema = SchemaFactory.createForClass(ContentVersionSourceSnapshot);

// Denormalized evidence boundary captured at generation time — used by
// Sprint 16A grounding so a version can be (re)grounded against the exact
// evidence that produced it, without rebuilding Growth Strategy on read.
// Optional: versions saved before Sprint 16A will not have this.
@Schema({ _id: false })
export class ContentVersionGroundingEvidenceSnapshot {
  @Prop({ type: String })
  productName?: string;

  @Prop({ type: String })
  productCategory?: string;

  @Prop({ type: String })
  productDescription?: string;

  @Prop({ type: String })
  valueProposition?: string;

  @Prop({ type: [String], default: [] })
  capabilities: string[];

  @Prop({ type: [String], default: [] })
  useCases: string[];

  @Prop({ type: [String], default: [] })
  differentiators: string[];

  @Prop({ type: [String], default: [] })
  pains: string[];

  @Prop({ type: [String], default: [] })
  goals: string[];

  @Prop({ type: [String], default: [] })
  objections: string[];

  @Prop({ type: [String], default: [] })
  proofPoints: string[];

  @Prop({ type: [String], default: [] })
  facts: string[];

  @Prop({ type: String })
  campaignGoal?: string;

  @Prop({ type: String })
  funnelStage?: string;

  @Prop({ type: String })
  suggestedCTA?: string;

  @Prop({ type: [String], default: [] })
  keywords: string[];

  @Prop({ type: String })
  topic?: string;

  @Prop({ type: String })
  pillar?: string;
}
export const ContentVersionGroundingEvidenceSnapshotSchema = SchemaFactory.createForClass(ContentVersionGroundingEvidenceSnapshot);

// Immutable generation snapshot — once saved, payload/generationMetadata/
// generationOptions/version are never updated. Only ContentArtifact's
// latest pointers change on regeneration.
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class ContentVersion {
  @Prop({ type: Types.ObjectId, ref: 'ContentArtifact', required: true })
  artifactId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Campaign', required: true })
  campaignId: Types.ObjectId;

  @Prop({ required: true })
  version: number;

  @Prop({ type: String, enum: CONTENT_GENERATION_KINDS, required: true })
  kind: ContentGenerationKind;

  @Prop({ required: true })
  sourceType: string;

  @Prop({ required: true })
  sourceId: string;

  @Prop({ type: ContentVersionPayloadSchema, required: true })
  payload: ContentVersionPayload;

  @Prop({ type: ContentVersionGenerationMetadataSchema, required: true })
  generationMetadata: ContentVersionGenerationMetadata;

  @Prop({ type: ContentVersionGenerationOptionsSchema })
  generationOptions?: ContentVersionGenerationOptions;

  @Prop({ type: ContentVersionSourceSnapshotSchema })
  sourceSnapshot?: ContentVersionSourceSnapshot;

  @Prop({ type: ContentVersionGroundingEvidenceSnapshotSchema })
  groundingEvidenceSnapshot?: ContentVersionGroundingEvidenceSnapshot;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  createdAt?: Date;
}

export const ContentVersionSchema = SchemaFactory.createForClass(ContentVersion);
ContentVersionSchema.index({ artifactId: 1, version: 1 }, { unique: true });
ContentVersionSchema.index({ organizationId: 1, productId: 1, campaignId: 1, artifactId: 1, version: -1 });
