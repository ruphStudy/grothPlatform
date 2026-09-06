import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { BRAND_ASSET_TYPES } from '../types/brand-asset.types';

export class PromoteCreativeToBrandAssetDto {
  @IsIn(BRAND_ASSET_TYPES)
  type!: (typeof BRAND_ASSET_TYPES)[number];

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
