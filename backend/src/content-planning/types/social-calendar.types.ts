export type SocialPlatform = 'linkedin' | 'facebook' | 'instagram' | 'x' | 'generic_social';

export type SocialContentType =
  | 'educational'
  | 'problem_insight'
  | 'use_case'
  | 'differentiation'
  | 'comparison'
  | 'buyer_enablement'
  | 'proof'
  | 'faq'
  | 'conversion_support'
  | 'activation'
  | 'thought_leadership'
  | 'blog_promotion'
  | 'engagement';

export type SocialCalendarItemStatus = 'planned' | 'approved' | 'completed' | 'skipped';

export interface SocialCalendarItem {
  id: string;

  day: number;
  week: number;

  platform: SocialPlatform;
  type: SocialContentType;

  title: string;
  angle: string;

  priorityScore: number;
  confidenceScore: number;

  pillarId: string;
  topicId?: string;

  funnelStage: string;
  audienceSegmentIds: string[];

  messagingPillarIds: string[];
  keywords: string[];

  sourceBlogItemId?: string;
  relatedCampaignActivityIds: string[];

  suggestedCTA?: string;

  recommendedFormat: string;

  dependencies: string[];
  successSignals: string[];

  status: SocialCalendarItemStatus;

  reasons: string[];
  warnings: string[];
}

export interface SocialWeekPlan {
  week: number;
  days: number[];

  theme: string;
  itemIds: string[];

  confidenceScore: number;
}

export interface SocialCalendarResult {
  durationDays: 30;

  weeks: SocialWeekPlan[];
  items: SocialCalendarItem[];

  topPriorityItemIds: string[];

  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];

  generatedAt: Date;
}
