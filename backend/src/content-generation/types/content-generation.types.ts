// Content-type-agnostic. 15C-15I extend `ContentGenerationKind` usage but
// never change this shape — prompt construction stays in 15B/adapters.
export type ContentGenerationKind = 'blog' | 'linkedin' | 'x' | 'facebook' | 'instagram' | 'newsletter' | 'video_script' | 'generic';

export const CONTENT_GENERATION_KINDS: ContentGenerationKind[] = ['blog', 'linkedin', 'x', 'facebook', 'instagram', 'newsletter', 'video_script', 'generic'];

export interface ContentGenerationSourceContext {
  strategyGeneratedAt?: string;
  campaignPlanningVersion?: number;
  sourceIds?: string[];
}

export interface ContentGenerationRequest {
  kind: ContentGenerationKind;

  prompt: string;
  systemPrompt?: string;

  model?: string;

  temperature?: number;
  maxOutputTokens?: number;

  organizationId?: string;
  productId?: string;
  campaignId?: string;

  sourceContext?: ContentGenerationSourceContext;

  metadata?: Record<string, string | number | boolean>;
}

export interface ContentGenerationUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface ContentGenerationCost {
  currency: 'USD';
  estimated: number;
}

export interface ContentGenerationResult {
  id: string;

  kind: ContentGenerationKind;

  content: string;

  provider: string;
  model: string;

  finishReason?: string;

  usage: ContentGenerationUsage;

  cost?: ContentGenerationCost;

  latencyMs?: number;

  generatedAt: Date;

  metadata?: Record<string, string | number | boolean>;
}
