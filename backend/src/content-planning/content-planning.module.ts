import { Module } from '@nestjs/common';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { GrowthStrategyModule } from '../growth-strategy/growth-strategy.module';
import { ProductsModule } from '../products/products.module';
import { ContentIdeaService } from './content-idea.service';
import { ContentPlanningController } from './content-planning.controller';

@Module({
  imports: [ProductsModule, CampaignsModule, GrowthStrategyModule],
  controllers: [ContentPlanningController],
  providers: [ContentIdeaService],
  exports: [ContentIdeaService],
})
export class ContentPlanningModule {}
