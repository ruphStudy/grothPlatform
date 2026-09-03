export type KeywordOpportunityTier = 'high' | 'medium' | 'low' | 'insufficient_evidence';

export interface KeywordOpportunity {
  keyword: string;
  normalizedKeyword: string;

  clusterId?: string;

  opportunityScore: number;
  confidenceScore: number;

  tier: KeywordOpportunityTier;

  primaryIntent: string;
  funnelStage: string;

  reasons: string[];
  strengths: string[];
  weaknesses: string[];
  warnings: string[];
}

export interface KeywordOpportunityResult {
  opportunities: KeywordOpportunity[];

  highOpportunityKeywords: string[];
  mediumOpportunityKeywords: string[];

  confidenceScore: number;
  warnings: string[];
  generatedAt: Date;
}
