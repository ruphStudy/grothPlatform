import { ArrayMaxSize, IsArray, IsEnum, IsISO8601, IsInt, IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';
import { CMS_PUBLISH_MODES, type CmsPublishMode } from '../schemas/cms-publication.schema';

export class UpdateCmsScheduleDto {
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @IsOptional()
  @IsMongoId()
  connectionId?: string;

  @IsOptional()
  @IsEnum(CMS_PUBLISH_MODES)
  mode?: CmsPublishMode;

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
