import { Type } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
import { GROWTH_STRATEGY_SECTION_STATUSES, GROWTH_STRATEGY_SECTIONS } from '../schemas/growth-strategy-review.schema';

export class UpdateSectionReviewDto {
  @IsIn(GROWTH_STRATEGY_SECTIONS)
  section: (typeof GROWTH_STRATEGY_SECTIONS)[number];

  @IsIn(GROWTH_STRATEGY_SECTION_STATUSES)
  status: (typeof GROWTH_STRATEGY_SECTION_STATUSES)[number];

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateGrowthStrategyReviewDto {
  @IsOptional()
  @IsString()
  overallNote?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateSectionReviewDto)
  sectionReviews?: UpdateSectionReviewDto[];
}
