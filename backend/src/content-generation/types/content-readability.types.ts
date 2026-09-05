import type { ContentGenerationKind } from './content-generation.types';
import type { ContentVersionPayload } from './content-versioning.types';

export type ReadabilityCheckType =
  | 'sentence_length'
  | 'paragraph_length'
  | 'sentence_variety'
  | 'paragraph_structure'
  | 'heading_support'
  | 'list_usage'
  | 'repetition'
  | 'complexity'
  | 'passive_voice'
  | 'scannability'
  | 'opening_clarity'
  | 'closing_clarity'
  | 'other';

export type ReadabilityCheckClassification = 'passed' | 'warning' | 'failed' | 'not_applicable';

export type ContentReadabilityStatus = 'readable' | 'needs_improvement' | 'difficult';

export interface ReadabilityCheck {
  id: string;
  type: ReadabilityCheckType;
  classification: ReadabilityCheckClassification;
  score?: number;
  reason: string;
  evidence?: string[];
}

export interface ContentReadabilityMetrics {
  wordCount: number;
  sentenceCount: number;
  paragraphCount: number;
  averageSentenceWords: number;
  averageParagraphWords: number;
  longSentenceCount: number;
  veryLongSentenceCount: number;
  longParagraphCount: number;
  passiveVoiceApproxCount?: number;
}

export interface ContentReadabilityResultResponse {
  contentVersionId: string;
  artifactId: string;
  organizationId: string;
  productId: string;
  campaignId: string;
  status: ContentReadabilityStatus;
  score: number;
  checks: ReadabilityCheck[];
  passedCount: number;
  warningCount: number;
  failedCount: number;
  metrics: ContentReadabilityMetrics;
  warnings: string[];
  reviewedAt: Date;
}

export interface ContentReadabilitySummary {
  status: ContentReadabilityStatus;
  score: number;
  warningCount: number;
  failedCount: number;
}

export interface ReviewReadabilityInput {
  contentVersionId: string;
  artifactId: string;
  organizationId: string;
  productId: string;
  campaignId: string;
  kind: ContentGenerationKind;
  payload: ContentVersionPayload;
  text: string;
}
