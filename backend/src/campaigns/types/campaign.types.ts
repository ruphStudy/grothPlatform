import type { CampaignGoal } from './campaign-goal.types';
import type { CampaignAudienceChannelMapping } from './campaign-audience-channel.types';
import type { CampaignPlanResult } from './campaign-plan.types';

export type { CampaignGoal, CampaignGoalType, CampaignGoalSource } from './campaign-goal.types';
export type {
  CampaignAudienceChannelMapping,
  CampaignAudienceRecommendation,
  CampaignChannelRecommendation,
  CampaignAudienceChannelSource,
} from './campaign-audience-channel.types';
export type { CampaignPlanResult, CampaignActivity, CampaignWeekPlan, CampaignActivityType, CampaignActivityStatus } from './campaign-plan.types';

export type CampaignStatus = 'draft' | 'planned' | 'approved' | 'active' | 'paused' | 'completed' | 'archived';

export type CampaignType =
  | 'awareness'
  | 'education'
  | 'consideration'
  | 'lead_generation'
  | 'conversion'
  | 'activation'
  | 'retention'
  | 'product_launch'
  | 'promotion'
  | 'evergreen'
  | 'custom';

export type CampaignPlanningSource = 'manual' | 'strategy_generated';

export interface CampaignStrategyReferenceResponse {
  reviewedStrategyGeneratedAt?: Date;
  strategyReviewId?: string;
}

export interface CampaignPlanningMetadataResponse {
  source: CampaignPlanningSource;
  version: number;
}

export interface CampaignResponse {
  id: string;
  organizationId: string;
  productId: string;

  name: string;
  slug: string;
  description?: string;

  status: CampaignStatus;
  type?: CampaignType;

  objectiveIds: string[];
  channelIds: string[];
  audienceSegmentIds: string[];
  funnelStages: string[];
  messagingPillarIds: string[];
  contentPillarIds: string[];
  acquisitionMotionIds: string[];
  conversionActionIds: string[];

  startDate?: Date;
  endDate?: Date;

  strategyReference?: CampaignStrategyReferenceResponse;
  planningMetadata: CampaignPlanningMetadataResponse;
  goal?: CampaignGoal;
  audienceChannelMapping?: CampaignAudienceChannelMapping;
  plan?: CampaignPlanResult;

  createdBy: string;
  updatedBy?: string;

  createdAt?: Date;
  updatedAt?: Date;
}
