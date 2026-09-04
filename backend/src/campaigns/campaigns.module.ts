import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GrowthStrategyModule } from '../growth-strategy/growth-strategy.module';
import { ProductsModule } from '../products/products.module';
import { CampaignAudienceChannelService } from './campaign-audience-channel.service';
import { CampaignGoalService } from './campaign-goal.service';
import { CampaignPlanService } from './campaign-plan.service';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { Campaign, CampaignSchema } from './schemas/campaign.schema';

@Module({
  imports: [ProductsModule, GrowthStrategyModule, MongooseModule.forFeature([{ name: Campaign.name, schema: CampaignSchema }])],
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignGoalService, CampaignAudienceChannelService, CampaignPlanService],
  exports: [CampaignsService, CampaignGoalService, CampaignAudienceChannelService, CampaignPlanService],
})
export class CampaignsModule {}
