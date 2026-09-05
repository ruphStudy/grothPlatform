export type VideoScriptTone = 'professional' | 'conversational' | 'educational' | 'energetic' | 'thought_leadership';
export type VideoScriptDuration = 'short' | 'medium' | 'long';

export interface VideoScriptGenerationOptions {
  language?: string;
  tone?: VideoScriptTone;
  duration?: VideoScriptDuration;
  includeCTA?: boolean;
  includeHook?: boolean;
  includeSceneDirections?: boolean;
  outputFormat?: 'markdown' | 'plain_text';
}

export interface VideoScriptScene {
  order: number;
  heading?: string;
  narration: string;
  visualDirection?: string;
}

export interface VideoScriptDraftUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface VideoScriptDraftCost {
  currency: 'USD';
  estimated: number;
}

export interface VideoScriptDraftSourceContext {
  strategyGeneratedAt?: string;
  campaignPlanningVersion?: number;
  sourceIds?: string[];
}

export interface VideoScriptDraftResult {
  id: string;

  kind: 'video_script';

  videoCalendarItemId: string;

  title: string;

  hook?: string;
  script: string;

  scenes?: VideoScriptScene[];

  estimatedWordCount: number;
  estimatedDurationSeconds: number;

  tone: string;
  duration: string;
  format: 'markdown' | 'plain_text';

  provider: string;
  model: string;

  usage: VideoScriptDraftUsage;

  cost?: VideoScriptDraftCost;

  promptVersion: string;

  sourceContext: VideoScriptDraftSourceContext;

  warnings: string[];

  generatedAt: Date;
}
