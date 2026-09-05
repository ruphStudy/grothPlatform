export type InstagramTone = 'conversational' | 'friendly' | 'professional' | 'educational' | 'inspirational';
export type InstagramLength = 'short' | 'medium' | 'long';

export interface InstagramGenerationOptions {
  language?: string;
  tone?: InstagramTone;
  length?: InstagramLength;
  includeCTA?: boolean;
  includeHashtags?: boolean;
  maxHashtags?: number;
  includeEmojis?: boolean;
  maxEmojis?: number;
}

export interface InstagramCaptionUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface InstagramCaptionCost {
  currency: 'USD';
  estimated: number;
}

export interface InstagramCaptionSourceContext {
  strategyGeneratedAt?: string;
  campaignPlanningVersion?: number;
  sourceIds?: string[];
}

export interface InstagramCaptionResult {
  id: string;

  kind: 'instagram';

  socialCalendarItemId: string;

  content: string;

  characterCount: number;
  wordCount: number;

  tone: string;
  length: string;

  hashtagCount: number;
  emojiCount: number;

  provider: string;
  model: string;

  usage: InstagramCaptionUsage;

  cost?: InstagramCaptionCost;

  promptVersion: string;

  sourceContext: InstagramCaptionSourceContext;

  warnings: string[];

  generatedAt: Date;
}
