export type NewsletterSourceType = 'blog_calendar_item' | 'content_topic' | 'content_pillar';
export type NewsletterTone = 'professional' | 'conversational' | 'educational' | 'thought_leadership';
export type NewsletterLength = 'short' | 'medium' | 'long';

export interface NewsletterGenerationOptions {
  language?: string;
  tone?: NewsletterTone;
  length?: NewsletterLength;
  includeSubjectLine?: boolean;
  includePreheader?: boolean;
  includeCTA?: boolean;
  outputFormat?: 'markdown' | 'plain_text';
}

export interface NewsletterDraftUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface NewsletterDraftCost {
  currency: 'USD';
  estimated: number;
}

export interface NewsletterDraftSourceContext {
  strategyGeneratedAt?: string;
  campaignPlanningVersion?: number;
  sourceIds?: string[];
}

export interface NewsletterDraftResult {
  id: string;

  kind: 'newsletter';

  sourceType: NewsletterSourceType;
  sourceId: string;

  subjectLine?: string;
  preheader?: string;

  content: string;

  format: 'markdown' | 'plain_text';

  wordCount: number;
  characterCount: number;

  tone: string;
  length: string;

  provider: string;
  model: string;

  usage: NewsletterDraftUsage;

  cost?: NewsletterDraftCost;

  promptVersion: string;

  sourceContext: NewsletterDraftSourceContext;

  warnings: string[];

  generatedAt: Date;

  // 15J — persisted version identity.
  artifactId: string;
  versionId: string;
  version: number;
}
