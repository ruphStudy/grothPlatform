import type { CompetitorFeatureComparisonResult } from './competitor-feature-comparison.types';
import type { CompetitorPositioningAnalysisResult } from './competitor-positioning.types';
import type { MarketCategoryResult } from './market-category.types';

export type MarketGapCategory = 'capability' | 'positioning' | 'audience' | 'pricing' | 'go-to-market' | 'differentiation';

export type MarketGapOpportunityType =
  | 'possible_product_gap'
  | 'differentiation_opportunity'
  | 'positioning_gap'
  | 'audience_opportunity'
  | 'pricing_opportunity'
  | 'go_to_market_opportunity';

export interface MarketGapEvidence {
  type: string;
  description: string;
  competitors: string[];
  supportingCount: number;
}

export interface MarketGapOpportunity {
  id: string;
  category: MarketGapCategory;
  title: string;
  description: string;
  opportunityType: MarketGapOpportunityType;
  priorityScore: number;
  confidenceScore: number;
  evidence: MarketGapEvidence[];
  caution: string;
}

export interface CommonMarketPattern {
  category: MarketGapCategory;
  label: string;
  competitorCount: number;
  totalCompetitors: number;
  prevalencePercent: number;
  interpretation: string;
}

export interface MarketGapAnalysisResult {
  marketCategory?: string;
  opportunities: MarketGapOpportunity[];
  strongestOpportunities: MarketGapOpportunity[];
  commonMarketPatterns: CommonMarketPattern[];
  confidenceScore: number;
  warnings: string[];
  stats: {
    discoveredCompetitors: number;
    analyzedCompetitors: number;
    competitorsUsed: number;
    featureGapCount: number;
    positioningOpportunityCount: number;
    totalOpportunities: number;
  };
  analyzedAt: Date;
}

export interface MarketGapAnalysisInput {
  marketCategory: MarketCategoryResult;
  featureComparison: CompetitorFeatureComparisonResult;
  positioning: CompetitorPositioningAnalysisResult;
}
