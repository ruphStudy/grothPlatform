import type { CompetitorKeywordGapResult } from './competitor-keyword-gap.types';
import type { KeywordAudienceMapResult } from './keyword-audience-map.types';
import type { KeywordClusterResult } from './keyword-cluster.types';
import type { KeywordIntentResult } from './keyword-intent.types';
import type { KeywordLongTailResult } from './keyword-long-tail.types';
import type { KeywordOpportunityResult } from './keyword-opportunity.types';
import type { KeywordSignalResult } from './keyword-signal.types';

export interface KeywordIntelligencePreviewStats {
  keywordCount: number;
  clusterCount: number;
  highOpportunityCount: number;
  gapCount: number;
  longTailCount: number;
  mappedKeywordCount: number;
}

export interface KeywordIntelligencePreview {
  signals: KeywordSignalResult;
  intents: KeywordIntentResult;
  clusters: KeywordClusterResult;
  opportunities: KeywordOpportunityResult;
  competitorGaps?: CompetitorKeywordGapResult;
  longTail: KeywordLongTailResult;
  audienceMap: KeywordAudienceMapResult;
  stats: KeywordIntelligencePreviewStats;
  warnings: string[];
  generatedAt: Date;
}
