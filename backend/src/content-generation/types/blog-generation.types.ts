export interface BlogGenerationOptions {
  language?: string;
  minWords?: number;
  maxWords?: number;
  outputFormat?: 'markdown' | 'plain_text';
}

export interface BlogDraftUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface BlogDraftCost {
  currency: 'USD';
  estimated: number;
}

export interface BlogDraftSourceContext {
  strategyGeneratedAt?: string;
  campaignPlanningVersion?: number;
  sourceIds?: string[];
}

export interface BlogDraftResult {
  id: string;

  kind: 'blog';

  blogCalendarItemId: string;

  title: string;
  content: string;

  format: 'markdown' | 'plain_text';

  wordCount: number;

  provider: string;
  model: string;

  usage: BlogDraftUsage;

  cost?: BlogDraftCost;

  promptVersion: string;

  sourceContext: BlogDraftSourceContext;

  warnings: string[];

  generatedAt: Date;
}
