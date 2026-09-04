export type CampaignAudienceChannelSource = 'manual' | 'strategy';

export interface CampaignAudienceRecommendation {
  audienceSegmentId: string;
  label?: string;

  relevanceScore: number;
  confidenceScore: number;

  relatedGoalTypes: string[];
  relatedFunnelStages: string[];
  relatedChannelIds: string[];

  reasons: string[];
  warnings: string[];
}

export interface CampaignChannelRecommendation {
  channel: string;

  fitScore: number;
  confidenceScore: number;

  audienceSegmentIds: string[];
  relatedGoalTypes: string[];
  relatedFunnelStages: string[];

  reasons: string[];
  weaknesses: string[];
  warnings: string[];
}

export interface CampaignAudienceChannelMapping {
  audiences: CampaignAudienceRecommendation[];
  channels: CampaignChannelRecommendation[];

  primaryAudienceSegmentId?: string;
  primaryChannel?: string;

  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];

  source: CampaignAudienceChannelSource;
  generatedAt?: Date;
}
