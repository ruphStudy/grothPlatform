export type LongTailExpansionType =
  | 'audience'
  | 'use_case'
  | 'problem'
  | 'intent'
  | 'feature'
  | 'comparison'
  | 'competitor_gap';

export interface LongTailKeyword {
  keyword: string;
  normalizedKeyword: string;

  baseKeyword: string;

  expansionType: LongTailExpansionType;

  primaryIntent: string;
  funnelStage: string;

  relatedSegments: string[];
  relatedUseCases: string[];

  opportunityScore: number;
  confidenceScore: number;

  reasons: string[];
  warnings: string[];
}

export interface KeywordLongTailResult {
  keywords: LongTailKeyword[];

  strongestKeywords: string[];

  confidenceScore: number;
  warnings: string[];

  generatedAt: Date;
}
