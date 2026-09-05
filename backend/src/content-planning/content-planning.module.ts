import { Module } from '@nestjs/common';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { GrowthStrategyModule } from '../growth-strategy/growth-strategy.module';
import { ProductsModule } from '../products/products.module';
import { BlogCalendarService } from './blog-calendar.service';
import { ContentIdeaService } from './content-idea.service';
import { ContentPillarPlanService } from './content-pillar-plan.service';
import { ContentPlanningController } from './content-planning.controller';
import { SocialCalendarService } from './social-calendar.service';
import { TopicPrioritizationService } from './topic-prioritization.service';
import { VideoCalendarService } from './video-calendar.service';

@Module({
  imports: [ProductsModule, CampaignsModule, GrowthStrategyModule],
  controllers: [ContentPlanningController],
  providers: [ContentIdeaService, TopicPrioritizationService, ContentPillarPlanService, BlogCalendarService, SocialCalendarService, VideoCalendarService],
  exports: [ContentIdeaService, TopicPrioritizationService, ContentPillarPlanService, BlogCalendarService, SocialCalendarService, VideoCalendarService],
})
export class ContentPlanningModule {}
