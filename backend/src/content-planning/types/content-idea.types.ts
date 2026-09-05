export type ContentIdeaType =
  | 'educational'
  | 'problem_solution'
  | 'use_case'
  | 'comparison'
  | 'differentiation'
  | 'buyer_enablement'
  | 'conversion_support'
  | 'activation'
  | 'thought_leadership'
  | 'faq'
  | 'proof'
  | 'repurpose';

export interface ContentIdea {
  id: string;

  title: string;
  angle: string;

  type: ContentIdeaType;

  priorityScore: number;
  confidenceScore: number;

  funnelStage: string;
  channel: string;
  formatDirection: string;

  audienceSegmentIds: string[];

  messagingPillarIds: string[];
  contentPillarIds: string[];
  campaignActivityIds: string[];

  keywords: string[];

  objective: string;

  suggestedCTA?: string;

  reasons: string[];
  warnings: string[];
}

export interface ContentIdeaResult {
  ideas: ContentIdea[];

  primaryIdeaIds: string[];

  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];

  generatedAt: Date;
}
