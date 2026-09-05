import type { ContentVersionGroundingEvidenceSnapshot } from './content-grounding.types';
import type { ContentVersionGenerationOptions, ContentVersionPayload } from './content-versioning.types';
import type { ContentGenerationKind } from './content-generation.types';

export type SeoReviewCheckType =
  | 'title'
  | 'keyword_usage'
  | 'keyword_stuffing'
  | 'heading_structure'
  | 'introduction'
  | 'content_depth'
  | 'topic_alignment'
  | 'funnel_alignment'
  | 'cta_alignment'
  | 'duplicate_heading'
  | 'excessive_repetition'
  | 'metadata_readiness'
  | 'other';

export type SeoReviewCheckClassification = 'passed' | 'warning' | 'failed' | 'not_applicable';

export type ContentSeoReviewStatus = 'optimized' | 'needs_improvement' | 'poor';

export interface SeoReviewCheck {
  id: string;
  type: SeoReviewCheckType;
  classification: SeoReviewCheckClassification;
  score?: number;
  reason: string;
  evidence?: string[];
}

export interface ContentSeoReviewResultResponse {
  contentVersionId: string;
  artifactId: string;
  organizationId: string;
  productId: string;
  campaignId: string;
  status: ContentSeoReviewStatus;
  score: number;
  checks: SeoReviewCheck[];
  passedCount: number;
  warningCount: number;
  failedCount: number;
  warnings: string[];
  reviewedAt: Date;
}

export interface ContentSeoReviewSummary {
  status: ContentSeoReviewStatus;
  score: number;
  warningCount: number;
  failedCount: number;
}

export interface ReviewContentVersionInput {
  contentVersionId: string;
  artifactId: string;
  organizationId: string;
  productId: string;
  campaignId: string;
  kind: ContentGenerationKind;
  payload: ContentVersionPayload;
  text: string;
  evidence?: ContentVersionGroundingEvidenceSnapshot;
  generationOptions?: ContentVersionGenerationOptions;
}
