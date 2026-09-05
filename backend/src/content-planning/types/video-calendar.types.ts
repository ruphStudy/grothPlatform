export type VideoContentType =
  | 'educational'
  | 'explainer'
  | 'problem_solution'
  | 'use_case'
  | 'comparison'
  | 'differentiation'
  | 'buyer_enablement'
  | 'faq'
  | 'conversion_support'
  | 'activation'
  | 'thought_leadership'
  | 'blog_repurpose'
  | 'social_repurpose';

export type VideoFormatDirection =
  | 'short_video'
  | 'long_video'
  | 'explainer_video'
  | 'demo_direction'
  | 'tutorial_direction'
  | 'talking_head_direction'
  | 'screen_walkthrough_direction'
  | 'faq_video'
  | 'comparison_video';

export type VideoCalendarItemStatus = 'planned' | 'approved' | 'completed' | 'skipped';

export interface VideoCalendarItem {
  id: string;

  day: number;
  week: number;

  title: string;
  type: VideoContentType;
  formatDirection: VideoFormatDirection;

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
  sourceSocialItemId?: string;
  relatedCampaignActivityIds: string[];

  suggestedCTA?: string;

  dependencies: string[];
  successSignals: string[];

  status: VideoCalendarItemStatus;

  reasons: string[];
  warnings: string[];
}

export interface VideoWeekPlan {
  week: number;
  days: number[];

  theme: string;
  itemIds: string[];

  confidenceScore: number;
}

export interface VideoCalendarResult {
  durationDays: 30;

  weeks: VideoWeekPlan[];
  items: VideoCalendarItem[];

  topPriorityItemIds: string[];

  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];

  generatedAt: Date;
}
