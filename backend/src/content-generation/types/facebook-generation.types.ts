export type FacebookTone = 'professional' | 'conversational' | 'friendly' | 'educational' | 'thought_leadership';
export type FacebookLength = 'short' | 'medium' | 'long';

export interface FacebookGenerationOptions {
  language?: string;
  tone?: FacebookTone;
  length?: FacebookLength;
  includeCTA?: boolean;
  includeHashtags?: boolean;
  maxHashtags?: number;
}

export interface FacebookDraftUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface FacebookDraftCost {
  currency: 'USD';
  estimated: number;
}

export interface FacebookDraftSourceContext {
  strategyGeneratedAt?: string;
  campaignPlanningVersion?: number;
  sourceIds?: string[];
}

export interface FacebookDraftResult {
  id: string;

  kind: 'facebook';

  socialCalendarItemId: string;

  content: string;

  characterCount: number;
  wordCount: number;

  tone: string;
  length: string;

  provider: string;
  model: string;

  usage: FacebookDraftUsage;

  cost?: FacebookDraftCost;

  promptVersion: string;

  sourceContext: FacebookDraftSourceContext;

  warnings: string[];

  generatedAt: Date;
}
