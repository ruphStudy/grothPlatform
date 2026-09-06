import type { CreativeKind } from '../types/creative.types';

// Every field here is genuine, already-resolved GIP context. The builder
// never fetches anything itself and never invents a value for a field the
// caller leaves undefined — see image-prompt-builder.service.ts.
export interface ImagePromptProductContext {
  name: string;
  category?: string;
  shortDescription?: string;
  valueProposition?: string;
}

export interface ImagePromptAudienceContext {
  label?: string;
  description?: string;
}

export interface ImagePromptCampaignContext {
  objective?: string;
  funnelStage?: string;
  ctaDirection?: string;
}

export interface ImagePromptContentContext {
  title?: string;
  topic?: string;
  platform?: string;
}

// Only ever populated from genuinely configured/persisted brand data
// (e.g. a 16E brandVoiceSnapshot). Never fabricated when absent.
export interface ImagePromptBrandDirection {
  tone?: string;
  style?: string;
  colors?: string[];
}

export interface ImagePromptTextOverlayInput {
  enabled?: boolean;
  text?: string;
}

export interface ImagePromptSourceContext {
  organizationId?: string;
  productId?: string;
  campaignId?: string;
  contentArtifactId?: string;
  contentVersionId?: string;
  sourceIds?: string[];
}

export interface BuildImagePromptInput {
  kind: CreativeKind;

  aspectRatio?: string;
  styleDirection?: string;

  product?: ImagePromptProductContext;
  audience?: ImagePromptAudienceContext;
  campaign?: ImagePromptCampaignContext;
  content?: ImagePromptContentContext;
  brand?: ImagePromptBrandDirection;

  textOverlay?: ImagePromptTextOverlayInput;

  sourceContext?: ImagePromptSourceContext;
  metadata?: Record<string, string | number | boolean>;
}

export interface CreativeImagePromptTextOverlay {
  enabled: boolean;
  text?: string;
}

// The normalized, provider-neutral output — this is what 17C hands to
// CreativeEngineService.generate() (mapped onto CreativeGenerationRequest).
export interface CreativeImagePrompt {
  prompt: string;
  negativePrompt?: string;

  kind: CreativeKind;

  aspectRatio?: string;
  styleDirection?: string;

  textOverlay?: CreativeImagePromptTextOverlay;

  sourceContext?: ImagePromptSourceContext;
  metadata?: Record<string, string | number | boolean>;
}
