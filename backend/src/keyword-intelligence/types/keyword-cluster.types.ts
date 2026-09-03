export type KeywordClusterType =
  | 'category'
  | 'feature'
  | 'use_case'
  | 'audience'
  | 'problem'
  | 'commercial'
  | 'brand'
  | 'mixed';

export interface KeywordCluster {
  id: string;
  name: string;

  type: KeywordClusterType;

  primaryKeyword: string;
  keywords: string[];

  primaryIntent: string;
  intents: string[];

  funnelStages: string[];

  relatedSegments: string[];
  relatedUseCases: string[];

  coherenceScore: number;
  confidenceScore: number;

  reasons: string[];
  warnings: string[];
}

export interface KeywordClusterResult {
  clusters: KeywordCluster[];
  unclusteredKeywords: string[];

  confidenceScore: number;
  warnings: string[];

  generatedAt: Date;
}
