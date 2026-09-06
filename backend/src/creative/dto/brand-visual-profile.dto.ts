import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

// Only normalized 6-digit hex colors are ever accepted — never an
// arbitrary CSS color string (named colors, rgb(), gradients, etc.).
export class BrandColorsDto {
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_PATTERN, { message: 'primary must be a hex color like #112233' })
  primary?: string;

  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_PATTERN, { message: 'secondary must be a hex color like #112233' })
  secondary?: string;

  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_PATTERN, { message: 'accent must be a hex color like #112233' })
  accent?: string;

  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_PATTERN, { message: 'background must be a hex color like #112233' })
  background?: string;
}

export class BrandLogoUsageDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  preferredAssetId?: string;
}

const MAX_LIST_ITEMS = 10;
const MAX_ITEM_CHARS = 60;

export class UpdateBrandVisualProfileDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandColorsDto)
  colors?: BrandColorsDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_LIST_ITEMS)
  @IsString({ each: true })
  @MaxLength(MAX_ITEM_CHARS, { each: true })
  visualStyle?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_LIST_ITEMS)
  @IsString({ each: true })
  @MaxLength(MAX_ITEM_CHARS, { each: true })
  avoidStyles?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_LIST_ITEMS)
  @IsString({ each: true })
  @MaxLength(MAX_ITEM_CHARS, { each: true })
  preferredSubjects?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_LIST_ITEMS)
  @IsString({ each: true })
  @MaxLength(MAX_ITEM_CHARS, { each: true })
  avoidSubjects?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => BrandLogoUsageDto)
  logoUsage?: BrandLogoUsageDto;
}
