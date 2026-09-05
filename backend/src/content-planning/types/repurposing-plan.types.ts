export type RepurposingSourceType = 'blog' | 'social' | 'video' | 'campaign_activity';

export type RepurposingTargetType = 'blog' | 'social' | 'video';

export type RepurposingActionType = 'summarize' | 'expand' | 'adapt' | 'extract' | 'promote' | 'sequence' | 'reframe';

export interface RepurposingItem {
  id: string;

  sourceType: RepurposingSourceType;
  sourceId: string;
  sourceTitle: string;

  targetType: RepurposingTargetType;
  actionType: RepurposingActionType;

  targetTitle: string;
  targetFormatDirection: string;

  priorityScore: number;
  confidenceScore: number;

  pillarId?: string;
  topicId?: string;

  funnelStage: string;
  audienceSegmentIds: string[];

  messagingPillarIds: string[];
  keywords: string[];

  sourceDay?: number;
  recommendedTargetDay?: number;

  dependencyIds: string[];

  suggestedCTA?: string;

  isExistingLinkage: boolean;

  reasons: string[];
  warnings: string[];
}

export interface RepurposingChain {
  id: string;
  title: string;

  sourceItemId: string;
  repurposingItemIds: string[];

  channels: string[];
  funnelStages: string[];

  priorityScore: number;
  confidenceScore: number;

  reasons: string[];
}

export interface RepurposingPlanResult {
  items: RepurposingItem[];
  chains: RepurposingChain[];

  topPriorityItemIds: string[];
  primaryChainIds: string[];

  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];

  generatedAt: Date;
}
