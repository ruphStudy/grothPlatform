import { IsArray, IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { CAMPAIGN_STATUSES, CAMPAIGN_TYPES } from '../schemas/campaign.schema';

// Deliberately has no organizationId/productId/createdBy fields — those are
// never editable via this DTO, regardless of what a caller sends in the body.
export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(CAMPAIGN_TYPES)
  type?: (typeof CAMPAIGN_TYPES)[number];

  @IsOptional()
  @IsIn(CAMPAIGN_STATUSES)
  status?: (typeof CAMPAIGN_STATUSES)[number];

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  objectiveIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  channelIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  audienceSegmentIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  funnelStages?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  messagingPillarIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contentPillarIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  acquisitionMotionIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  conversionActionIds?: string[];
}
