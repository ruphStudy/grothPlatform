export interface KeywordAudienceMatch {
  keyword: string;
  normalizedKeyword: string;

  segmentId: string;
  segmentName: string;

  relevanceScore: number;
  confidenceScore: number;

  primaryIntent: string;
  funnelStage: string;

  relatedUseCases: string[];

  reasons: string[];
  warnings: string[];
}

export interface KeywordAudienceMapResult {
  matches: KeywordAudienceMatch[];

  primaryAudienceByKeyword: Record<string, string>;

  keywordsBySegment: Record<string, string[]>;

  unmappedKeywords: string[];

  confidenceScore: number;
  warnings: string[];

  generatedAt: Date;
}
