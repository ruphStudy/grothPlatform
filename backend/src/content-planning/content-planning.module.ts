import { Module } from '@nestjs/common';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { GrowthStrategyModule } from '../growth-strategy/growth-strategy.module';
import { ProductsModule } from '../products/products.module';
import { ContentIdeaService } from './content-idea.service';
import { ContentPillarPlanService } from './content-pillar-plan.service';
import { ContentPlanningController } from './content-planning.controller';
import { TopicPrioritizationService } from './topic-prioritization.service';

@Module({
  imports: [ProductsModule, CampaignsModule, GrowthStrategyModule],
  controllers: [ContentPlanningController],
  providers: [ContentIdeaService, TopicPrioritizationService, ContentPillarPlanService],
  exports: [ContentIdeaService, TopicPrioritizationService, ContentPillarPlanService],
})
export class ContentPlanningModule {}
