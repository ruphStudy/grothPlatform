import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';
import { PRIMARY_GOALS, PRODUCT_TYPES } from '../schemas/product.schema';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsUrl()
  websiteUrl?: string;

  @IsOptional()
  @IsString()
  shortDescription?: string;

  @IsOptional()
  @IsIn(PRODUCT_TYPES)
  productType?: (typeof PRODUCT_TYPES)[number];

  @IsOptional()
  @IsIn(PRIMARY_GOALS)
  primaryGoal?: (typeof PRIMARY_GOALS)[number];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetMarkets?: string[];

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}
