import { IsIn, IsOptional } from 'class-validator';
import { CAMPAIGN_TYPES } from '../schemas/campaign.schema';

// Optional campaign-type override used only for compatibility scoring during
// derivation — never persisted onto the campaign by this call.
export class DeriveCampaignGoalDto {
  @IsOptional()
  @IsIn(CAMPAIGN_TYPES)
  campaignType?: (typeof CAMPAIGN_TYPES)[number];
}
