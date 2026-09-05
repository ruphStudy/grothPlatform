export type ContentTopicTier = 'primary' | 'secondary' | 'experimental' | 'deferred';

export interface ContentTopic {
  id: string;
  title: string;

  tier: ContentTopicTier;

  priorityScore: number;
  confidenceScore: number;

  relatedIdeaIds: string[];

  audienceSegmentIds: string[];
  channels: string[];
  funnelStages: string[];

  contentPillarIds: string[];
  messagingPillarIds: string[];

  keywords: string[];
  intentTypes: string[];

  reasons: string[];
  weaknesses: string[];
  warnings: string[];
}

export interface TopicPrioritizationResult {
  topics: ContentTopic[];

  primaryTopicIds: string[];
  secondaryTopicIds: string[];

  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];

  generatedAt: Date;
}
