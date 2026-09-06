import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUrl, MaxLength, ValidateNested } from 'class-validator';
import { BRAND_ASSET_TYPES } from '../types/brand-asset.types';
import { CREATIVE_KINDS } from '../types/creative.types';
import type { CreativeKind } from '../types/creative.types';

// Only a safe metadata/reference record is ever accepted — no binary
// upload/storage subsystem is built in 17F (see spec item 5). `asset.url`
// is expected to be an already-hosted reference (e.g. a prior 17C-17E
// CreativeAsset URL, or an externally uploaded file's URL).
export class BrandAssetFileDto {
  @IsOptional()
  @IsUrl()
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  storageKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  mimeType?: string;

  @IsOptional()
  width?: number;

  @IsOptional()
  height?: number;
}

export class BrandAssetUsageDto {
  @IsOptional()
  @IsBoolean()
  primary?: boolean;

  @IsOptional()
  @IsArray()
  @IsIn(CREATIVE_KINDS, { each: true })
  allowedCreativeKinds?: CreativeKind[];
}

export class BrandAssetMetadataDto {
  @IsOptional()
  @IsIn(['uploaded', 'generated', 'external'])
  source?: 'uploaded' | 'generated' | 'external';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  altText?: string;
}

export class CreateBrandAssetDto {
  @IsIn(BRAND_ASSET_TYPES)
  type!: (typeof BRAND_ASSET_TYPES)[number];

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ValidateNested()
  @Type(() => BrandAssetFileDto)
  asset!: BrandAssetFileDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BrandAssetUsageDto)
  usage?: BrandAssetUsageDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BrandAssetMetadataDto)
  metadata?: BrandAssetMetadataDto;
}
