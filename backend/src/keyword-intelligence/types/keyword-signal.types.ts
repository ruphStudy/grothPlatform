import type { AudiencePainPointResult } from '../../audience-intelligence/types/audience-pain-point.types';
import type { AudienceJtbdResult } from '../../audience-intelligence/types/audience-jtbd.types';
import type { AudienceSegmentResult } from '../../audience-intelligence/types/audience-segment.types';
import type { AudienceSignalResult } from '../../audience-intelligence/types/audience-signal.types';
import type { MarketCategoryResult } from '../../market-intelligence/types/market-category.types';
import type { ProductWebsiteKnowledge } from '../../website-intelligence/product-website-knowledge.types';

export type KeywordSignalSource =
  | 'product_name'
  | 'product_description'
  | 'product_type'
  | 'market_category'
  | 'market_term'
  | 'website_identity'
  | 'feature'
  | 'use_case'
  | 'audience'
  | 'pain_point'
  | 'jtbd'
  | 'pricing'
  | 'competitor_gap';

export type KeywordIntent =
  | 'informational'
  | 'commercial'
  | 'transactional'
  | 'navigational'
  | 'solution'
  | 'problem'
  | 'comparison'
  | 'audience_specific';

export interface KeywordSignal {
  keyword: string;
  normalizedKeyword: string;

  sources: KeywordSignalSource[];
  intent: KeywordIntent[];

  confidenceScore: number;

  evidence: string[];

  relatedSegments?: string[];
  relatedUseCases?: string[];

  warnings: string[];
}

export interface KeywordSignalResult {
  keywords: KeywordSignal[];

  productKeywords: string[];
  featureKeywords: string[];
  audienceKeywords: string[];
  problemKeywords: string[];
  commercialKeywords: string[];
  longTailKeywords: string[];

  confidenceScore: number;

  missingSignals: string[];
  warnings: string[];

  generatedAt: Date;
}

export interface KeywordSignalProductInput {
  name: string;
  shortDescription?: string;
  productType?: string;
  primaryGoal?: string;
  targetMarkets?: string[];
}

export interface KeywordSignalExtractionInput {
  product: KeywordSignalProductInput;
  websiteKnowledge?: ProductWebsiteKnowledge;
  marketCategory?: MarketCategoryResult;
  audienceSignals?: AudienceSignalResult;
  segments?: AudienceSegmentResult;
  painPoints?: AudiencePainPointResult;
  jtbd?: AudienceJtbdResult;
}
