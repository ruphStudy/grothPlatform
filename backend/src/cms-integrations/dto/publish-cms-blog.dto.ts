import { IsArray, IsIn, IsInt, IsMongoId, IsOptional, IsString, MaxLength, ArrayMaxSize } from 'class-validator';
import { CMS_PUBLISH_MODES } from '../schemas/cms-publication.schema';
import type { CmsPublishMode } from '../schemas/cms-publication.schema';

export class PublishCmsBlogDto {
  @IsMongoId()
  connectionId: string;

  @IsIn(CMS_PUBLISH_MODES)
  mode: CmsPublishMode;

  @IsString()
  @MaxLength(200)
  idempotencyKey: string;

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
