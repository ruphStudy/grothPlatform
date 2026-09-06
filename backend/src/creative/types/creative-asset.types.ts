import type { CreativeAssetReviewStatus } from '../schemas/creative-asset.schema';
import type { CreativeCost, CreativeKind, CreativeUsage } from './creative.types';

export interface CreativeAssetListFilter {
  kind?: CreativeKind;
  contentArtifactId?: string;
  contentVersionId?: string;
  platform?: string;
  limit?: number;
}

export interface CreativeAssetFileInput {
  type: 'image';
  url?: string;
  storageKey?: string;
  mimeType?: string;
  width?: number;
  height?: number;
}

export interface CreativeAssetPromptSnapshotInput {
  promptVersion: string;
  aspectRatio?: string;
  styleDirection?: string;
  textOverlayEnabled: boolean;
}

export interface CreateCreativeAssetInput {
  organizationId: string;
  productId: string;
  campaignId: string;

  kind: CreativeKind;

  contentArtifactId: string;
  contentVersionId: string;
  contentVersion: number;
  contentKind: string;
  platform: string;

  provider: string;
  model?: string;

  asset: CreativeAssetFileInput;

  promptSnapshot: CreativeAssetPromptSnapshotInput;

  usage?: CreativeUsage;
  cost?: CreativeCost;

  userId?: string;
}

export interface CreativeAssetResponse {
  id: string;

  kind: CreativeKind;

  source: {
    contentArtifactId: string;
    contentVersionId: string;
    contentVersion: number;
    contentKind: string;
    platform: string;
  };

  provider: string;
  model?: string;

  asset: CreativeAssetFileInput;

  promptSnapshot: CreativeAssetPromptSnapshotInput;

  usage?: CreativeUsage;
  cost?: CreativeCost;

  status: 'generated' | 'failed';
  reviewStatus: CreativeAssetReviewStatus;

  createdAt: Date;
}
