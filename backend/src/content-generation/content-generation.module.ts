import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { ContentPlanningModule } from '../content-planning/content-planning.module';
import { GrowthStrategyModule } from '../growth-strategy/growth-strategy.module';
import { ProductsModule } from '../products/products.module';
import { BlogGenerationService } from './adapters/blog-generation.service';
import { FacebookGenerationService } from './adapters/facebook-generation.service';
import { InstagramGenerationService } from './adapters/instagram-generation.service';
import { LinkedInGenerationService } from './adapters/linkedin-generation.service';
import { NewsletterGenerationService } from './adapters/newsletter-generation.service';
import { VideoScriptGenerationService } from './adapters/video-script-generation.service';
import { XGenerationService } from './adapters/x-generation.service';
import { ContentArtifactsController } from './content-artifacts.controller';
import { ContentGenerationController } from './content-generation.controller';
import { ContentGenerationEngineService } from './engine/content-generation-engine.service';
import { OpenAiContentGenerationProvider } from './providers/openai-content-generation.provider';
import { ContentPromptBuilderService } from './prompting/content-prompt-builder.service';
import { ContentArtifact, ContentArtifactSchema } from './schemas/content-artifact.schema';
import { ContentFactValidationResult, ContentFactValidationResultSchema } from './schemas/content-fact-validation-result.schema';
import { ContentBrandVoiceResult, ContentBrandVoiceResultSchema } from './schemas/content-brand-voice-result.schema';
import { ContentGroundingResult, ContentGroundingResultSchema } from './schemas/content-grounding-result.schema';
import { ContentReadabilityResult, ContentReadabilityResultSchema } from './schemas/content-readability-result.schema';
import { ContentSeoReviewResult, ContentSeoReviewResultSchema } from './schemas/content-seo-review-result.schema';
import { ContentVersion, ContentVersionSchema } from './schemas/content-version.schema';
import { ContentBrandVoiceService } from './services/content-brand-voice.service';
import { ContentFactValidationService } from './services/content-fact-validation.service';
import { ContentGroundingService } from './services/content-grounding.service';
import { ContentReadabilityService } from './services/content-readability.service';
import { ContentSeoReviewService } from './services/content-seo-review.service';
import { ContentVersioningService } from './services/content-versioning.service';

@Module({
  imports: [
    ProductsModule,
    CampaignsModule,
    GrowthStrategyModule,
    ContentPlanningModule,
    MongooseModule.forFeature([
      { name: ContentArtifact.name, schema: ContentArtifactSchema },
      { name: ContentVersion.name, schema: ContentVersionSchema },
      { name: ContentGroundingResult.name, schema: ContentGroundingResultSchema },
      { name: ContentFactValidationResult.name, schema: ContentFactValidationResultSchema },
      { name: ContentSeoReviewResult.name, schema: ContentSeoReviewResultSchema },
      { name: ContentReadabilityResult.name, schema: ContentReadabilityResultSchema },
      { name: ContentBrandVoiceResult.name, schema: ContentBrandVoiceResultSchema },
    ]),
  ],
  controllers: [ContentGenerationController, ContentArtifactsController],
  providers: [
    ContentGenerationEngineService,
    OpenAiContentGenerationProvider,
    ContentPromptBuilderService,
    ContentGroundingService,
    ContentFactValidationService,
    ContentSeoReviewService,
    ContentReadabilityService,
    ContentBrandVoiceService,
    ContentVersioningService,
    BlogGenerationService,
    LinkedInGenerationService,
    XGenerationService,
    FacebookGenerationService,
    InstagramGenerationService,
    NewsletterGenerationService,
    VideoScriptGenerationService,
  ],
  exports: [
    ContentGenerationEngineService,
    ContentPromptBuilderService,
    ContentVersioningService,
    ContentGroundingService,
    ContentFactValidationService,
    ContentSeoReviewService,
    ContentReadabilityService,
    ContentBrandVoiceService,
  ],
})
export class ContentGenerationModule {}
