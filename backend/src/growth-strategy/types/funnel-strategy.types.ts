export type FunnelStage = 'awareness' | 'consideration' | 'conversion' | 'activation' | 'retention';

export interface FunnelStageStrategy {
  stage: FunnelStage;

  objective: string;
  priorityScore: number;
  confidenceScore: number;

  audienceSegmentIds: string[];
  channels: string[];
  keywordIntents: string[];
  keywords: string[];

  recommendedActions: string[];

  entrySignals: string[];
  successSignals: string[];

  reasons: string[];
  warnings: string[];
}

export interface FunnelStrategyResult {
  stages: FunnelStageStrategy[];

  primaryEntryStage?: FunnelStage;
  primaryConversionPath: FunnelStage[];

  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];

  generatedAt: Date;
}
