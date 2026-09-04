import { IsArray, IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { CAMPAIGN_TYPES } from '../schemas/campaign.schema';

export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(CAMPAIGN_TYPES)
  type?: (typeof CAMPAIGN_TYPES)[number];

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  // Optional strategy-linkage references — accepted as plain ID arrays only;
  // never trusted as the strategy payload itself.
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
