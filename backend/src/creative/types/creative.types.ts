// Provider-neutral. 17B-17F build kind-specific prompt/workflow logic on top
// of this but never change this shape, and never depend on a concrete
// provider SDK type.
export type CreativeKind = 'social_image' | 'blog_hero' | 'thumbnail' | 'brand_asset' | 'generic';

export const CREATIVE_KINDS: CreativeKind[] = ['social_image', 'blog_hero', 'thumbnail', 'brand_asset', 'generic'];

export interface CreativeSourceContext {
  contentArtifactId?: string;
  contentVersionId?: string;
  sourceIds?: string[];
}

export interface CreativeGenerationRequest {
  kind: CreativeKind;

  prompt: string;
  negativePrompt?: string;

  width?: number;
  height?: number;
  aspectRatio?: string;

  quality?: 'standard' | 'high';

  organizationId?: string;
  productId?: string;
  campaignId?: string;

  sourceContext?: CreativeSourceContext;

  metadata?: Record<string, string | number | boolean>;
}

// Some providers return a hosted URL, others return inline base64/binary —
// callers must not assume a URL is always present.
export interface CreativeAsset {
  type: 'image';
  url?: string;
  base64?: string;
  mimeType?: string;
  width?: number;
  height?: number;
}

export interface CreativeUsage {
  imageCount?: number;
}

export interface CreativeCost {
  currency: 'USD';
  estimated: number;
}

export interface CreativeGenerationResult {
  id: string;

  kind: CreativeKind;

  provider: string;
  model?: string;

  asset: CreativeAsset;

  revisedPrompt?: string;

  usage?: CreativeUsage;
  cost?: CreativeCost;

  latencyMs?: number;

  generatedAt: Date;

  metadata?: Record<string, string | number | boolean>;
}
