export type CompetitorKeywordGapType = 'missing' | 'weak_coverage' | 'differentiation' | 'shared';

export interface CompetitorKeywordGap {
  keyword: string;
  normalizedKeyword: string;

  gapType: CompetitorKeywordGapType;

  competitorCount: number;
  competitors: string[];

  relatedFeatures: string[];
  relatedUseCases: string[];

  opportunityScore: number;
  confidenceScore: number;

  reasons: string[];
  strengths: string[];
  weaknesses: string[];
  warnings: string[];
}

export interface CompetitorKeywordGapResult {
  gaps: CompetitorKeywordGap[];

  strongestGapKeywords: string[];

  sharedKeywords: string[];
  differentiationKeywords: string[];

  confidenceScore: number;
  warnings: string[];
  generatedAt: Date;
}
