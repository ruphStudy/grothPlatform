export type XMode = 'single_post' | 'thread';
export type XTone = 'concise' | 'professional' | 'conversational' | 'thought_leadership';

export interface XGenerationOptions {
  language?: string;
  mode?: XMode;
  tone?: XTone;
  includeCTA?: boolean;
  includeHashtags?: boolean;
  maxHashtags?: number;
  threadMaxPosts?: number;
}

export interface XDraftUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface XDraftCost {
  currency: 'USD';
  estimated: number;
}

export interface XDraftSourceContext {
  strategyGeneratedAt?: string;
  campaignPlanningVersion?: number;
  sourceIds?: string[];
}

export interface XDraftResult {
  id: string;

  kind: 'x';

  socialCalendarItemId: string;

  mode: XMode;

  content?: string;
  posts?: string[];

  characterCount?: number;
  postCharacterCounts?: number[];

  wordCount: number;

  tone: string;

  provider: string;
  model: string;

  usage: XDraftUsage;

  cost?: XDraftCost;

  promptVersion: string;

  sourceContext: XDraftSourceContext;

  warnings: string[];

  generatedAt: Date;

  // 15J — persisted version identity.
  artifactId: string;
  versionId: string;
  version: number;
}
