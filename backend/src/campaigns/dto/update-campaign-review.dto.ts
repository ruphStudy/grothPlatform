import { Type } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
import { CAMPAIGN_REVIEW_SECTIONS, CAMPAIGN_REVIEW_SECTION_STATUSES } from '../schemas/campaign.schema';

export class UpdateCampaignSectionReviewDto {
  @IsIn(CAMPAIGN_REVIEW_SECTIONS)
  section: (typeof CAMPAIGN_REVIEW_SECTIONS)[number];

  @IsIn(CAMPAIGN_REVIEW_SECTION_STATUSES)
  status: (typeof CAMPAIGN_REVIEW_SECTION_STATUSES)[number];

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateCampaignReviewDto {
  @IsOptional()
  @IsString()
  overallNote?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateCampaignSectionReviewDto)
  sectionReviews?: UpdateCampaignSectionReviewDto[];
}
