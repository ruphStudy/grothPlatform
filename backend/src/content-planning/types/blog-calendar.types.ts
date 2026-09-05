export type BlogCalendarItemType =
  | 'educational'
  | 'guide'
  | 'use_case'
  | 'comparison'
  | 'differentiation'
  | 'buyer_enablement'
  | 'faq'
  | 'conversion_support'
  | 'activation'
  | 'thought_leadership';

export type BlogCalendarItemStatus = 'planned' | 'approved' | 'completed' | 'skipped';

export interface BlogCalendarItem {
  id: string;

  day: number;
  week: number;

  title: string;
  type: BlogCalendarItemType;

  pillarId: string;
  topicId: string;

  priorityScore: number;
  confidenceScore: number;

  funnelStage: string;
  audienceSegmentIds: string[];

  primaryKeyword?: string;
  supportingKeywords: string[];
  intentTypes: string[];

  objective: string;
  angle: string;

  suggestedCTA?: string;

  relatedCampaignActivityIds: string[];

  dependencies: string[];

  successSignals: string[];

  status: BlogCalendarItemStatus;

  reasons: string[];
  warnings: string[];
}

export interface BlogWeekPlan {
  week: number;
  days: number[];

  theme: string;
  itemIds: string[];

  confidenceScore: number;
}

export interface BlogCalendarResult {
  durationDays: 30;

  weeks: BlogWeekPlan[];
  items: BlogCalendarItem[];

  topPriorityItemIds: string[];

  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];

  generatedAt: Date;
}
