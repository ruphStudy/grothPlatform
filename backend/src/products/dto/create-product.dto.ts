import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';
import { PRIMARY_GOALS, PRODUCT_TYPES } from '../schemas/product.schema';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsUrl({ require_tld: false, protocols: ['http', 'https'], require_protocol: true })
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
}
