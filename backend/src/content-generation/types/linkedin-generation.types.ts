export type LinkedInTone = 'professional' | 'conversational' | 'thought_leadership';
export type LinkedInLength = 'short' | 'medium' | 'long';

export interface LinkedInGenerationOptions {
  language?: string;
  tone?: LinkedInTone;
  length?: LinkedInLength;
  includeCTA?: boolean;
  includeHashtags?: boolean;
  maxHashtags?: number;
}

export interface LinkedInDraftUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface LinkedInDraftCost {
  currency: 'USD';
  estimated: number;
}

export interface LinkedInDraftSourceContext {
  strategyGeneratedAt?: string;
  campaignPlanningVersion?: number;
  sourceIds?: string[];
}

export interface LinkedInDraftResult {
  id: string;

  kind: 'linkedin';

  socialCalendarItemId: string;

  content: string;

  characterCount: number;
  wordCount: number;

  tone: string;
  length: string;

  provider: string;
  model: string;

  usage: LinkedInDraftUsage;

  cost?: LinkedInDraftCost;

  promptVersion: string;

  sourceContext: LinkedInDraftSourceContext;

  warnings: string[];

  generatedAt: Date;
}
