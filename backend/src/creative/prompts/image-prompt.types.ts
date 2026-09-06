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
  // 17E: a video script's hook line — never a fabricated speaker/presenter
  // identity, just the opening concept the thumbnail should evoke.
  hook?: string;
}

// Only ever populated from genuinely configured/persisted brand data
// (e.g. a 16E brandVoiceSnapshot, or a 17F BrandVisualProfile). Never
// fabricated when absent.
export interface ImagePromptBrandDirection {
  tone?: string;
  style?: string;
  colors?: string[];
  avoidStyles?: string[];
  preferredSubjects?: string[];
  avoidSubjects?: string[];
  // 17F: true only when a genuine logo/reference BrandAsset exists. The
  // builder never instructs the provider to recreate/invent that logo —
  // see buildBrandDirection() in image-prompt-builder.service.ts.
  hasLogoReference?: boolean;
}

export interface ImagePromptTextOverlayInput {
  enabled?: boolean;
  text?: string;
  // 17E: some features (e.g. thumbnails) need a stricter cap than the
  // configured global default (e.g. blog hero/social 80 chars). Falls back
  // to CREATIVE_TEXT_OVERLAY_MAX_CHARS when omitted.
  maxChars?: number;
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
