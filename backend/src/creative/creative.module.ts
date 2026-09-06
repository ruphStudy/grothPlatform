import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { ContentGenerationModule } from '../content-generation/content-generation.module';
import { GrowthStrategyModule } from '../growth-strategy/growth-strategy.module';
import { ProductsModule } from '../products/products.module';
import { CreativeController } from './creative.controller';
import { CreativeEngineService } from './engine/creative-engine.service';
import { ImagePromptBuilderService } from './prompts/image-prompt-builder.service';
import { CREATIVE_PROVIDER_TOKEN } from './providers/creative-provider.interface';
import { FakeCreativeProvider } from './providers/fake-creative-provider.service';
import { CreativeAsset, CreativeAssetSchema } from './schemas/creative-asset.schema';
import { CreativeAssetsService } from './services/creative-assets.service';
import { CreativeGenerationService } from './services/creative-generation.service';

// 17A: DI infrastructure only (engine + provider token). 17B adds the
// deterministic ImagePromptBuilderService (no DB, no provider call). 17C-
// 17E share ONE persisted creative workflow — CreativeGenerationService —
// covering social images, blog heroes, and thumbnails; it reuses the same
// paid-generation approval gates as 15C-15I/16H, and CreativeAssetsService
// is the only place that writes a CreativeAsset document.
@Module({
  imports: [
    MongooseModule.forFeature([{ name: CreativeAsset.name, schema: CreativeAssetSchema }]),
    CampaignsModule,
    GrowthStrategyModule,
    ProductsModule,
    ContentGenerationModule,
  ],
  controllers: [CreativeController],
  providers: [
    FakeCreativeProvider,
    { provide: CREATIVE_PROVIDER_TOKEN, useClass: FakeCreativeProvider },
    CreativeEngineService,
    ImagePromptBuilderService,
    CreativeAssetsService,
    CreativeGenerationService,
  ],
  exports: [CreativeEngineService, ImagePromptBuilderService],
})
export class CreativeModule {}
