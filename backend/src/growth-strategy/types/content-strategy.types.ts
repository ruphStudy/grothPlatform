export type ContentFormat =
  | 'blog'
  | 'landing_page'
  | 'comparison_page'
  | 'case_study'
  | 'guide'
  | 'checklist'
  | 'social_post'
  | 'short_video'
  | 'long_video'
  | 'webinar'
  | 'email'
  | 'faq'
  | 'documentation';

export interface ContentPillar {
  id: string;
  title: string;
  theme: string;

  priorityScore: number;
  confidenceScore: number;

  targetAudienceSegmentIds: string[];
  relatedObjectiveIds: string[];
  relatedFunnelStages: string[];
  relatedMessagingPillarIds: string[];

  supportingKeywords: string[];
  supportingSignalIds: string[];

  reasons: string[];
  warnings: string[];
}

export interface ContentFormatRecommendation {
  format: ContentFormat;

  priorityScore: number;
  confidenceScore: number;

  targetFunnelStages: string[];
  targetAudienceSegmentIds: string[];
  relatedContentPillarIds: string[];

  reasons: string[];
}

export interface ContentTopicDirection {
  id: string;
  title: string;

  contentPillarId: string;
  intent: string;
  funnelStage: string;

  audienceSegmentIds: string[];
  keywords: string[];

  priorityScore: number;
  confidenceScore: number;

  reasons: string[];
}

export interface ContentStrategyResult {
  pillars: ContentPillar[];
  formats: ContentFormatRecommendation[];
  topicDirections: ContentTopicDirection[];

  primaryPillarId?: string;

  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];

  generatedAt: Date;
}
