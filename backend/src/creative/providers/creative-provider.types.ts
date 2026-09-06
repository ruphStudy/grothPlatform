import type { CreativeAsset, CreativeCost, CreativeUsage } from '../types/creative.types';

// Provider-level request/response — deliberately narrower than the engine's
// CreativeGenerationRequest/Result: a provider never sees kind, tenant IDs,
// sourceContext, or metadata, so no concrete provider adapter can leak or
// depend on Creative-feature-specific concerns.
export interface CreativeProviderRequest {
  prompt: string;
  negativePrompt?: string;

  model?: string;

  width?: number;
  height?: number;
  aspectRatio?: string;

  quality?: 'standard' | 'high';
}

export interface CreativeProviderResponse {
  asset: CreativeAsset;
  model: string;

  revisedPrompt?: string;

  usage?: CreativeUsage;
  cost?: CreativeCost;
}
