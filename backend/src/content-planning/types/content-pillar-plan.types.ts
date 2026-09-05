export type CampaignContentPillarTier = 'primary' | 'supporting' | 'experimental';

export interface CampaignContentPillar {
  id: string;
  title: string;
  theme: string;

  tier: CampaignContentPillarTier;

  priorityScore: number;
  confidenceScore: number;

  topicIds: string[];

  audienceSegmentIds: string[];
  channels: string[];
  funnelStages: string[];

  messagingPillarIds: string[];
  strategyContentPillarIds: string[];

  keywords: string[];
  intentTypes: string[];

  purpose: string;
  reasons: string[];
  weaknesses: string[];
  warnings: string[];
}

export interface ContentPillarPlanResult {
  pillars: CampaignContentPillar[];

  primaryPillarIds: string[];
  supportingPillarIds: string[];

  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];

  generatedAt: Date;
}
