import type { CreativeKind } from './creative.types';

export type BrandAssetType = 'logo' | 'logo_mark' | 'icon' | 'product_image' | 'screenshot' | 'background' | 'reference_image' | 'other';

export const BRAND_ASSET_TYPES: BrandAssetType[] = ['logo', 'logo_mark', 'icon', 'product_image', 'screenshot', 'background', 'reference_image', 'other'];

export type BrandAssetSource = 'uploaded' | 'generated' | 'external';

export interface BrandAssetFile {
  url?: string;
  storageKey?: string;
  mimeType?: string;
  width?: number;
  height?: number;
}

export interface BrandAssetUsage {
  primary?: boolean;
  allowedCreativeKinds?: CreativeKind[];
}

export interface BrandAssetMetadata {
  source?: BrandAssetSource;
  altText?: string;
}

export interface CreateBrandAssetInput {
  organizationId: string;
  productId: string;
  type: BrandAssetType;
  name: string;
  description?: string;
  asset: BrandAssetFile;
  usage?: BrandAssetUsage;
  metadata?: BrandAssetMetadata;
  userId?: string;
}

export interface UpdateBrandAssetInput {
  name?: string;
  description?: string;
  usage?: BrandAssetUsage;
  metadata?: BrandAssetMetadata;
}

export interface PromoteCreativeToBrandAssetInput {
  organizationId: string;
  productId: string;
  creativeAssetId: string;
  type: BrandAssetType;
  name: string;
  description?: string;
  userId?: string;
}

export interface BrandAssetResponse {
  id: string;
  organizationId: string;
  productId: string;
  type: BrandAssetType;
  name: string;
  description?: string;
  asset: BrandAssetFile;
  usage?: BrandAssetUsage;
  metadata?: BrandAssetMetadata;
  createdAt: Date;
  updatedAt: Date;
}
