export interface SharedCapability {
  productFeature: string;
  competitorFeature: string;
  similarityScore: number;
}

export interface CompetitorFeatureComparison {
  competitorName: string;
  competitorDomain: string;
  competitorConfidenceScore: number;
  sharedCapabilities: SharedCapability[];
  competitorOnlyCapabilities: string[];
  productOnlyCapabilities: string[];
  similarityScore: number;
}

export interface PossibleFeatureGap {
  capability: string;
  competitorCount: number;
  competitors: string[];
  importanceScore: number;
}

export interface CompetitorFeatureComparisonResult {
  marketCategory?: string;
  productFeatures: string[];
  competitors: CompetitorFeatureComparison[];
  commonCapabilities: string[];
  productDifferentiators: string[];
  possibleFeatureGaps: PossibleFeatureGap[];
  confidenceScore: number;
  warnings: string[];
  stats: {
    discoveredCompetitors: number;
    analyzedCompetitors: number;
    competitorsUsed: number;
    productFeatureCount: number;
  };
  comparedAt: Date;
}

export interface FeatureComparisonCompetitorInput {
  name: string;
  domain: string;
  confidenceScore: number;
  features: string[];
}

export interface FeatureComparisonInput {
  productFeatures: string[];
  competitors: FeatureComparisonCompetitorInput[];
  marketCategory?: string;
}
