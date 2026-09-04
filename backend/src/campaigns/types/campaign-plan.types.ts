export type CampaignActivityType =
  | 'seo'
  | 'blog'
  | 'landing_page'
  | 'social'
  | 'video'
  | 'email'
  | 'outbound'
  | 'community'
  | 'partnership'
  | 'paid_search'
  | 'paid_social'
  | 'conversion'
  | 'activation'
  | 'proof'
  | 'measurement';

export type CampaignActivityStatus = 'planned' | 'approved' | 'completed' | 'skipped';

export interface CampaignActivity {
  id: string;

  day: number;
  week: number;

  type: CampaignActivityType;
  title: string;
  objective: string;

  channel: string;
  audienceSegmentIds: string[];
  funnelStage: string;

  messagingPillarIds: string[];
  contentPillarIds: string[];

  keywordDirections: string[];
  contentFormat?: string;

  recommendedActions: string[];

  conversionDirection?: string;

  priorityScore: number;
  confidenceScore: number;

  dependencies: string[];

  successSignals: string[];

  status: CampaignActivityStatus;

  reasons: string[];
  warnings: string[];
}

export interface CampaignWeekPlan {
  week: number;
  days: number[];

  theme: string;
  objective: string;

  activityIds: string[];

  confidenceScore: number;
}

export interface CampaignPlanResult {
  durationDays: 30;

  weeks: CampaignWeekPlan[];
  activities: CampaignActivity[];

  topPriorityActivityIds: string[];

  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];

  generatedAt: Date;
}
