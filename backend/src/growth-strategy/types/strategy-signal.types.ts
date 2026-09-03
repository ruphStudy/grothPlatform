import type { AudienceJtbdResult } from '../../audience-intelligence/types/audience-jtbd.types';
import type { AudiencePainPointResult } from '../../audience-intelligence/types/audience-pain-point.types';
import type { AudiencePrioritizationResult } from '../../audience-intelligence/types/audience-prioritization.types';
import type { AudienceSegmentResult } from '../../audience-intelligence/types/audience-segment.types';
import type { AudienceSignalResult } from '../../audience-intelligence/types/audience-signal.types';
import type { BuyerUserMapResult } from '../../audience-intelligence/types/buyer-user-map.types';
import type { IcpResult } from '../../audience-intelligence/types/icp.types';
import type { CompetitorKeywordGapResult } from '../../keyword-intelligence/types/competitor-keyword-gap.types';
import type { KeywordAudienceMapResult } from '../../keyword-intelligence/types/keyword-audience-map.types';
import type { KeywordClusterResult } from '../../keyword-intelligence/types/keyword-cluster.types';
import type { KeywordLongTailResult } from '../../keyword-intelligence/types/keyword-long-tail.types';
import type { KeywordOpportunityResult } from '../../keyword-intelligence/types/keyword-opportunity.types';
import type { KeywordSignalResult } from '../../keyword-intelligence/types/keyword-signal.types';
import type { CompetitorFeatureComparisonResult } from '../../market-intelligence/types/competitor-feature-comparison.types';
import type { CompetitorPositioningAnalysisResult } from '../../market-intelligence/types/competitor-positioning.types';
import type { MarketCategoryResult } from '../../market-intelligence/types/market-category.types';
import type { MarketGapAnalysisResult } from '../../market-intelligence/types/market-gap.types';

export type StrategySignalCategory =
  | 'product'
  | 'positioning'
  | 'audience'
  | 'pain'
  | 'jtbd'
  | 'keyword'
  | 'market'
  | 'competitor'
  | 'commercial'
  | 'differentiation'
  | 'evidence_gap';

export interface StrategySignal {
  id: string;
  category: StrategySignalCategory;

  title: string;
  value: string;

  strengthScore: number;
  confidenceScore: number;

  source: string;
  evidence: string[];

  relatedSegmentIds?: string[];
  relatedKeywords?: string[];
  relatedUseCases?: string[];

  warnings: string[];
}

export interface StrategySignalResult {
  signals: StrategySignal[];

  strongestSignalIds: string[];

  productSignals: string[];
  audienceSignals: string[];
  marketSignals: string[];
  keywordSignals: string[];
  differentiationSignals: string[];

  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];

  generatedAt: Date;
}

export interface StrategySignalProductInput {
  name: string;
  shortDescription?: string;
  productType?: string;
  primaryGoal?: string;
  targetMarkets?: string[];
}

export interface StrategySignalProductProfileInput {
  category?: string;
  businessModel?: string;
  valueProposition?: string;
  coreFeatures?: string[];
  differentiators?: string[];
  suggestedPositioning?: string;
  confidenceScore?: number;
}

export interface StrategySignalExtractionInput {
  product: StrategySignalProductInput;
  productProfile?: StrategySignalProductProfileInput;

  marketCategory: MarketCategoryResult;
  featureComparison?: CompetitorFeatureComparisonResult;
  positioning?: CompetitorPositioningAnalysisResult;
  marketGaps?: MarketGapAnalysisResult;

  audienceSignals: AudienceSignalResult;
  segments: AudienceSegmentResult;
  icp: IcpResult;
  buyerUserMap: BuyerUserMapResult;
  painPoints: AudiencePainPointResult;
  jtbd: AudienceJtbdResult;
  prioritization: AudiencePrioritizationResult;

  keywordSignals: KeywordSignalResult;
  keywordClusters: KeywordClusterResult;
  keywordOpportunities: KeywordOpportunityResult;
  keywordLongTail: KeywordLongTailResult;
  keywordAudienceMap: KeywordAudienceMapResult;
  competitorKeywordGaps?: CompetitorKeywordGapResult;
}
