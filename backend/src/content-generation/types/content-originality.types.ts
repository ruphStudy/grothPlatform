import type { ContentGenerationKind } from './content-generation.types';
import type { ContentVersionPayload } from './content-versioning.types';

export type OriginalityCheckType =
  | 'internal_repetition'
  | 'sentence_duplication'
  | 'paragraph_duplication'
  | 'phrase_repetition'
  | 'cross_version_similarity'
  | 'cross_artifact_similarity'
  | 'template_repetition'
  | 'other';

export type OriginalityCheckClassification = 'passed' | 'warning' | 'failed' | 'not_applicable';

export type ContentOriginalityStatus = 'original' | 'needs_review' | 'highly_repetitive';

export interface OriginalityCheck {
  id: string;
  type: OriginalityCheckType;
  classification: OriginalityCheckClassification;
  score?: number;
  reason: string;
  matchedVersionId?: string;
  matchedArtifactId?: string;
  evidence?: string[];
}

export interface ContentOriginalityResultResponse {
  contentVersionId: string;
  artifactId: string;
  organizationId: string;
  productId: string;
  campaignId: string;
  status: ContentOriginalityStatus;
  score: number;
  checks: OriginalityCheck[];
  passedCount: number;
  warningCount: number;
  failedCount: number;
  duplicateSentenceCount: number;
  duplicateParagraphCount: number;
  crossContentMatchCount: number;
  warnings: string[];
  reviewedAt: Date;
}

export interface ContentOriginalitySummary {
  status: ContentOriginalityStatus;
  score: number;
  duplicateSentenceCount: number;
  crossContentMatchCount: number;
}

export interface ReviewOriginalityInput {
  contentVersionId: string;
  artifactId: string;
  organizationId: string;
  productId: string;
  campaignId: string;
  kind: ContentGenerationKind;
  sourceType: string;
  sourceId: string;
  payload: ContentVersionPayload;
  text: string;
}
