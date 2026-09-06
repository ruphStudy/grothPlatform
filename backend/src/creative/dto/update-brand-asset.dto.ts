import { Type } from 'class-transformer';
import { IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { BrandAssetMetadataDto, BrandAssetUsageDto } from './create-brand-asset.dto';

// Renaming/metadata edits and the primary toggle only — type/asset
// reference are immutable after creation (create a new BrandAsset instead
// of repointing an existing one to different binary content).
export class UpdateBrandAssetDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BrandAssetUsageDto)
  usage?: BrandAssetUsageDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BrandAssetMetadataDto)
  metadata?: BrandAssetMetadataDto;
}
