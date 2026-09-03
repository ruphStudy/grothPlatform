import type { CompetitorAnalysisFailure, CompetitorWebsiteAnalysis } from './competitor-analysis.types';
import type { CompetitorFeatureComparisonResult } from './competitor-feature-comparison.types';
import type { CompetitorPositioningAnalysisResult } from './competitor-positioning.types';
import type { MarketCategoryResult } from './market-category.types';
import type { MarketGapAnalysisResult } from './market-gap.types';

export interface CompetitiveIntelligencePreview {
  marketCategory: MarketCategoryResult;
  discovery: {
    discoveredCompetitors: number;
    warnings: string[];
  };
  competitorAnalysis: {
    competitors: CompetitorWebsiteAnalysis[];
    failures: CompetitorAnalysisFailure[];
  };
  featureComparison: CompetitorFeatureComparisonResult;
  positioning: CompetitorPositioningAnalysisResult;
  marketGaps: MarketGapAnalysisResult;
  stats: {
    discoveredCompetitors: number;
    analyzedCompetitors: number;
    failedCompetitorAnalyses: number;
    productFeatureCount: number;
    totalOpportunities: number;
  };
  warnings: string[];
  generatedAt: Date;
}
