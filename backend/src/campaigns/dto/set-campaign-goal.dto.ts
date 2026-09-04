import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { CAMPAIGN_GOAL_TYPES } from '../schemas/campaign.schema';

// Manual campaign-goal definition — always source='manual', never requires
// strategy approval.
export class SetCampaignGoalDto {
  @IsIn(CAMPAIGN_GOAL_TYPES)
  type: (typeof CAMPAIGN_GOAL_TYPES)[number];

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  successSignals?: string[];
}
