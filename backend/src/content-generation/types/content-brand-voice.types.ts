import type { ContentGenerationKind } from './content-generation.types';
import type { ContentVersionGenerationOptions, ContentVersionPayload } from './content-versioning.types';

// Denormalized brand-voice inputs captured at generation time — used by
// Sprint 16E so a version can be (re)reviewed against the exact tone/style/
// avoid direction that produced it, without rebuilding Growth Strategy.
// Optional: versions saved before Sprint 16E will not have this, and today
// no caller populates `style`/`avoid` — only `tone` is ever set.
export interface ContentVersionBrandVoiceSnapshot {
  tone?: string[];
  style?: string[];
  avoid?: string[];
}

export type BrandVoiceCheckType =
  | 'requested_tone'
  | 'style_alignment'
  | 'avoid_rules'
  | 'hype'
  | 'professionalism'
  | 'conversationality'
  | 'clarity'
  | 'consistency'
  | 'unsupported_voice_claims'
  | 'platform_fit'
  | 'other';

export type BrandVoiceCheckClassification = 'passed' | 'warning' | 'failed' | 'not_applicable';

export type ContentBrandVoiceStatus = 'aligned' | 'needs_adjustment' | 'misaligned';

export interface BrandVoiceCheck {
  id: string;
  type: BrandVoiceCheckType;
  classification: BrandVoiceCheckClassification;
  score?: number;
  reason: string;
  evidence?: string[];
}

export interface ContentBrandVoiceResultResponse {
  contentVersionId: string;
  artifactId: string;
  organizationId: string;
  productId: string;
  campaignId: string;
  status: ContentBrandVoiceStatus;
  score: number;
  checks: BrandVoiceCheck[];
  passedCount: number;
  warningCount: number;
  failedCount: number;
  warnings: string[];
  reviewedAt: Date;
}

export interface ContentBrandVoiceSummary {
  status: ContentBrandVoiceStatus;
  score: number;
  warningCount: number;
  failedCount: number;
}

export interface ReviewBrandVoiceInput {
  contentVersionId: string;
  artifactId: string;
  organizationId: string;
  productId: string;
  campaignId: string;
  kind: ContentGenerationKind;
  payload: ContentVersionPayload;
  text: string;
  brandVoiceSnapshot?: ContentVersionBrandVoiceSnapshot;
  generationOptions?: ContentVersionGenerationOptions;
}
