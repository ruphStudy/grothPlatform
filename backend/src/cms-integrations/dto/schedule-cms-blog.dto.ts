import { IsArray, IsEnum, IsISO8601, IsInt, IsMongoId, IsOptional, IsString, MaxLength, MinLength, ArrayMaxSize } from 'class-validator';
import { CMS_PUBLISH_MODES, type CmsPublishMode } from '../schemas/cms-publication.schema';

const MAX_IDEMPOTENCY_KEY_CHARS = 128;

export class ScheduleCmsBlogDto {
  @IsMongoId()
  connectionId!: string;

  @IsEnum(CMS_PUBLISH_MODES)
  mode!: CmsPublishMode;

  @IsISO8601()
  scheduledAt!: string;

  @IsString()
  @MaxLength(100)
  timezone!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(MAX_IDEMPOTENCY_KEY_CHARS)
  idempotencyKey!: string;

  @IsOptional()
  @IsMongoId()
  featuredCreativeAssetId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsInt({ each: true })
  categoryIds?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsInt({ each: true })
  tagIds?: number[];
}
