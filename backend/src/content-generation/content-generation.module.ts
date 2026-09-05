import { Module } from '@nestjs/common';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { ContentPlanningModule } from '../content-planning/content-planning.module';
import { GrowthStrategyModule } from '../growth-strategy/growth-strategy.module';
import { ProductsModule } from '../products/products.module';
import { BlogGenerationService } from './adapters/blog-generation.service';
import { LinkedInGenerationService } from './adapters/linkedin-generation.service';
import { ContentGenerationController } from './content-generation.controller';
import { ContentGenerationEngineService } from './engine/content-generation-engine.service';
import { OpenAiContentGenerationProvider } from './providers/openai-content-generation.provider';
import { ContentPromptBuilderService } from './prompting/content-prompt-builder.service';

@Module({
  imports: [ProductsModule, CampaignsModule, GrowthStrategyModule, ContentPlanningModule],
  controllers: [ContentGenerationController],
  providers: [ContentGenerationEngineService, OpenAiContentGenerationProvider, ContentPromptBuilderService, BlogGenerationService, LinkedInGenerationService],
  exports: [ContentGenerationEngineService, ContentPromptBuilderService],
})
export class ContentGenerationModule {}
