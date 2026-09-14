import { IsDateString, IsEnum, IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';
import { ATTRIBUTION_MODELS } from '../schemas/attribution-touchpoint.schema';
import type { AttributionModel } from '../schemas/attribution-touchpoint.schema';

export class AttributionQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsEnum(ATTRIBUTION_MODELS) model?: AttributionModel;
  @IsOptional() @IsMongoId() campaignId?: string;
  @IsOptional() @IsMongoId() leadId?: string;
  @IsOptional() @IsMongoId() opportunityId?: string;
  @IsOptional() @IsString() @MaxLength(60) channel?: string;
  @IsOptional() @IsString() @MaxLength(60) platform?: string;
  @IsOptional() @IsString() @MaxLength(120) utmSource?: string;
  @IsOptional() @IsString() @MaxLength(120) utmMedium?: string;
  @IsOptional() @IsString() @MaxLength(160) utmCampaign?: string;
  @IsOptional() @IsString() @MaxLength(40) contentKind?: string;
  @IsOptional() @IsString() @MaxLength(8) currency?: string;
}
