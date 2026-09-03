export type SearchIntentPrimary =
  | 'informational'
  | 'commercial'
  | 'transactional'
  | 'navigational'
  | 'comparison'
  | 'problem'
  | 'solution'
  | 'audience_specific';

export type KeywordFunnelStage = 'awareness' | 'consideration' | 'decision' | 'mixed';

export interface KeywordIntentProfile {
  keyword: string;
  normalizedKeyword: string;

  primaryIntent: SearchIntentPrimary;
  secondaryIntents: SearchIntentPrimary[];

  funnelStage: KeywordFunnelStage;

  intentScore: number;
  confidenceScore: number;

  reasons: string[];
  warnings: string[];
}

export interface KeywordIntentResult {
  profiles: KeywordIntentProfile[];

  byPrimaryIntent: Record<string, string[]>;

  awarenessKeywords: string[];
  considerationKeywords: string[];
  decisionKeywords: string[];

  confidenceScore: number;
  warnings: string[];
  generatedAt: Date;
}
