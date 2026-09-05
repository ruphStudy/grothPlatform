import type { ContentGenerationKind } from './content-generation.types';
import type { ContentFactValidationSummary } from './content-fact-validation.types';
import type { ContentGroundingSummary, ContentVersionGroundingEvidenceSnapshot } from './content-grounding.types';
import type { ContentSeoReviewSummary } from './content-seo-review.types';

export type { ContentVersionGroundingEvidenceSnapshot };

export interface ContentVersionUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface ContentVersionCost {
  currency: 'USD';
  estimated: number;
}

export interface ContentVersionSourceContext {
  strategyGeneratedAt?: string;
  campaignPlanningVersion?: number;
  sourceIds?: string[];
}

export interface ContentVersionScene {
  order: number;
  heading?: string;
  narration: string;
  visualDirection?: string;
}

export interface ContentVersionPayload {
  title?: string;
  content?: string;
  format?: string;
  subjectLine?: string;
  preheader?: string;
  posts?: string[];
  postCharacterCounts?: number[];
  hook?: string;
  scenes?: ContentVersionScene[];
  mode?: string;
  wordCount?: number;
  characterCount?: number;
  estimatedWordCount?: number;
  estimatedDurationSeconds?: number;
  hashtagCount?: number;
  emojiCount?: number;
}

export interface ContentVersionGenerationMetadata {
  provider: string;
  model: string;
  promptVersion: string;
  usage?: ContentVersionUsage;
  cost?: ContentVersionCost;
  sourceContext?: ContentVersionSourceContext;
  warnings: string[];
  generatedAt: Date;
}

export interface ContentVersionGenerationOptions {
  language?: string;
  tone?: string;
  length?: string;
  duration?: string;
  mode?: string;
  outputFormat?: string;
  includeCTA?: boolean;
  includeHashtags?: boolean;
  includeEmojis?: boolean;
  includeSubjectLine?: boolean;
  includePreheader?: boolean;
  includeHook?: boolean;
  includeSceneDirections?: boolean;
  maxHashtags?: number;
  maxEmojis?: number;
  threadMaxPosts?: number;
}

export interface ContentVersionSourceSnapshot {
  title?: string;
  type?: string;
  pillarId?: string;
  topicId?: string;
}

export interface SaveGeneratedVersionInput {
  organizationId: string;
  productId: string;
  campaignId: string;
  kind: ContentGenerationKind;
  sourceType: string;
  sourceId: string;
  payload: ContentVersionPayload;
  generationMetadata: ContentVersionGenerationMetadata;
  generationOptions?: ContentVersionGenerationOptions;
  sourceSnapshot?: ContentVersionSourceSnapshot;
  groundingEvidenceSnapshot?: ContentVersionGroundingEvidenceSnapshot;
  userId?: string;
}

export interface SavedVersionResult {
  artifactId: string;
  versionId: string;
  version: number;
  grounding?: ContentGroundingSummary;
  factValidation?: ContentFactValidationSummary;
  seoReview?: ContentSeoReviewSummary;
}

export interface ContentArtifactResponse {
  id: string;
  kind: ContentGenerationKind;
  sourceType: string;
  sourceId: string;
  latestVersion: number;
  latestVersionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContentVersionSummary {
  id: string;
  version: number;
  kind: ContentGenerationKind;
  generatedAt: Date;
  provider: string;
  model: string;
  wordCount?: number;
  characterCount?: number;
  cost?: ContentVersionCost;
  warningsCount: number;
  grounding?: ContentGroundingSummary;
  factValidation?: ContentFactValidationSummary;
  seoReview?: ContentSeoReviewSummary;
}

export interface ContentVersionDetail extends ContentVersionSummary {
  artifactId: string;
  sourceType: string;
  sourceId: string;
  payload: ContentVersionPayload;
  generationMetadata: ContentVersionGenerationMetadata;
  generationOptions?: ContentVersionGenerationOptions;
  sourceSnapshot?: ContentVersionSourceSnapshot;
  groundingEvidenceSnapshot?: ContentVersionGroundingEvidenceSnapshot;
}

export interface ArtifactWithLatestVersion {
  artifact: ContentArtifactResponse;
  latestVersion?: ContentVersionDetail;
}
