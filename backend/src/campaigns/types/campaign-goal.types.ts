export type CampaignGoalType =
  | 'awareness'
  | 'education'
  | 'consideration'
  | 'lead_generation'
  | 'conversion'
  | 'activation'
  | 'retention'
  | 'positioning'
  | 'differentiation'
  | 'buyer_enablement'
  | 'product_launch'
  | 'custom';

export type CampaignGoalSource = 'manual' | 'strategy';

export interface CampaignGoal {
  type: CampaignGoalType;
  title: string;
  description: string;

  priorityScore?: number;
  confidenceScore?: number;

  source: CampaignGoalSource;

  relatedStrategyObjectiveIds: string[];
  relatedFunnelStages: string[];
  relatedConversionActionIds: string[];

  successSignals: string[];
  warnings: string[];
}
