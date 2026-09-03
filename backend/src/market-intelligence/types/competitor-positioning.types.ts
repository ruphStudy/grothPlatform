export interface ProductPositioningProfile {
  positioningStatements: string[];
  valueThemes: string[];
  audienceSignals: string[];
  pricingPosition: string[];
  ctaThemes: string[];
}

export interface CompetitorPositioningProfile {
  competitorName: string;
  competitorDomain: string;
  positioningStatements: string[];
  valueThemes: string[];
  audienceSignals: string[];
  pricingPosition: string[];
  ctaThemes: string[];
  confidenceScore: number;
}

export interface PositioningOverlap {
  theme: string;
  productEvidence: string[];
  competitorCount: number;
  competitors: string[];
}

export interface PositioningOpportunity {
  theme: string;
  reason: string;
  supportingCompetitors: string[];
  confidenceScore: number;
}

export interface CompetitorPositioningAnalysisResult {
  marketCategory?: string;
  productPositioning: ProductPositioningProfile;
  competitorPositioning: CompetitorPositioningProfile[];
  commonPositioningThemes: string[];
  overlap: PositioningOverlap[];
  opportunities: PositioningOpportunity[];
  confidenceScore: number;
  warnings: string[];
  stats: {
    discoveredCompetitors: number;
    analyzedCompetitors: number;
    competitorsUsed: number;
    positioningThemesDetected: number;
  };
  analyzedAt: Date;
}

// --- pure analyze() input shapes ---

export interface PositioningEntityEvidence {
  title?: string;
  metaDescription?: string;
  keyStatements: string[];
  features: string[];
  pricingSignals: string[];
  callsToAction: string[];
  documentationTopics: string[];
  technicalFacts: string[];
}

export interface PositioningCompetitorInput extends PositioningEntityEvidence {
  name: string;
  domain: string;
  confidenceScore: number;
}

export interface PositioningFeatureComparisonSummary {
  productDifferentiators: string[];
  possibleFeatureGaps: { capability: string; competitorCount: number; competitors: string[] }[];
  commonCapabilities: string[];
}

export interface PositioningAnalysisInput {
  product: PositioningEntityEvidence;
  competitors: PositioningCompetitorInput[];
  marketCategory?: string;
  marketDescriptors?: string[];
  featureComparison?: PositioningFeatureComparisonSummary;
}
