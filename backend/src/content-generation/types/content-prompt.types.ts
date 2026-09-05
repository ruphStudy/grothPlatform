import type { ContentGenerationKind } from './content-generation.types';

export interface ContentPromptOrganization {
  name?: string;
}

export interface ContentPromptProduct {
  name: string;
  shortDescription?: string;
  category?: string;
  valueProposition?: string;
}

export interface ContentPromptCampaign {
  name?: string;
  goal?: string;
  funnelStage?: string;
  audienceSegmentIds?: string[];
  channelIds?: string[];
  conversionDirection?: string;
}

export interface ContentPromptContentDirection {
  title: string;
  type?: string;
  angle?: string;

  objective?: string;
  funnelStage?: string;

  audience?: string[];
  keywords?: string[];

  pillar?: string;
  topic?: string;

  messagingDirections?: string[];

  suggestedCTA?: string;
  formatDirection?: string;
}

export interface ContentPromptEvidence {
  pains?: string[];
  goals?: string[];
  objections?: string[];
  differentiators?: string[];
  capabilities?: string[];
  proofPoints?: string[];
  useCases?: string[];
  facts?: string[];
}

export interface ContentPromptBrand {
  tone?: string[];
  style?: string[];
  avoid?: string[];
}

export interface ContentPromptConstraints {
  language?: string;
  minWords?: number;
  maxWords?: number;
  maxCharacters?: number;
  includeCTA?: boolean;
  includeHashtags?: boolean;
  outputFormat?: string;
}

export interface ContentPromptSourceContext {
  strategyGeneratedAt?: string;
  campaignPlanningVersion?: number;
  sourceIds?: string[];
}

export interface ContentPromptBuildInput {
  kind: ContentGenerationKind;

  organization?: ContentPromptOrganization;

  product: ContentPromptProduct;

  campaign?: ContentPromptCampaign;

  content: ContentPromptContentDirection;

  evidence?: ContentPromptEvidence;

  brand?: ContentPromptBrand;

  constraints?: ContentPromptConstraints;

  sourceContext?: ContentPromptSourceContext;
}

export interface ContentPromptBuildMetadata {
  promptVersion: string;
  evidenceCount: number;
  hasAudienceEvidence: boolean;
  hasKeywordEvidence: boolean;
  hasCTAEvidence: boolean;
  hasProofEvidence: boolean;
}

export interface ContentPromptBuildResult {
  kind: ContentGenerationKind;

  systemPrompt: string;
  prompt: string;

  sourceContext?: ContentPromptSourceContext;

  metadata: ContentPromptBuildMetadata;

  warnings: string[];
}
