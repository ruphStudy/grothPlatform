import type { ContentBrandVoiceSummary } from './content-brand-voice.types';
import type { ContentFactValidationSummary } from './content-fact-validation.types';
import type { ContentGenerationKind, ContentGenerationCost, ContentGenerationUsage } from './content-generation.types';
import type { ContentGroundingSummary } from './content-grounding.types';
import type { ContentOriginalitySummary } from './content-originality.types';
import type { ContentQualitySummary } from './content-quality.types';
import type { ContentReadabilitySummary } from './content-readability.types';
import type { ContentSeoReviewSummary } from './content-seo-review.types';

export type ContentImprovementFocus = 'all' | 'facts' | 'seo' | 'readability' | 'brand_voice' | 'originality';

export interface ContentImprovementOptions {
  focus?: ContentImprovementFocus;
  language?: string;
}

export interface ImproveContentVersionInput {
  organizationId: string;
  productId: string;
  campaignId: string;
  artifactId: string;
  version: number;
  userId: string;
  focus?: ContentImprovementFocus;
  language?: string;
}

export interface ContentImprovementResult {
  artifactId: string;
  versionId: string;
  version: number;
  kind: ContentGenerationKind;
  improvedFromVersion: number;
  improvementFocus: ContentImprovementFocus;
  provider: string;
  model: string;
  usage: ContentGenerationUsage;
  cost?: ContentGenerationCost;
  warnings: string[];
  generatedAt: Date;
  grounding?: ContentGroundingSummary;
  factValidation?: ContentFactValidationSummary;
  seoReview?: ContentSeoReviewSummary;
  readability?: ContentReadabilitySummary;
  brandVoice?: ContentBrandVoiceSummary;
  originality?: ContentOriginalitySummary;
  quality?: ContentQualitySummary;
}
