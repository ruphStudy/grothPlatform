import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { ContentGenerationModule } from '../content-generation/content-generation.module';
import { GrowthStrategyModule } from '../growth-strategy/growth-strategy.module';
import { ProductsModule } from '../products/products.module';
import { BrandAssetsController } from './brand-assets.controller';
import { BrandVisualProfileController } from './brand-visual-profile.controller';
import { CreativeController } from './creative.controller';
import { CreativeEngineService } from './engine/creative-engine.service';
import { ImagePromptBuilderService } from './prompts/image-prompt-builder.service';
import { CREATIVE_PROVIDER_TOKEN } from './providers/creative-provider.interface';
import { FakeCreativeProvider } from './providers/fake-creative-provider.service';
import { BrandAsset, BrandAssetSchema } from './schemas/brand-asset.schema';
import { BrandVisualProfile, BrandVisualProfileSchema } from './schemas/brand-visual-profile.schema';
import { CreativeAsset, CreativeAssetSchema } from './schemas/creative-asset.schema';
import { BrandAssetsService } from './services/brand-assets.service';
import { BrandVisualProfileService } from './services/brand-visual-profile.service';
import { CreativeAssetsService } from './services/creative-assets.service';
import { CreativeGenerationService } from './services/creative-generation.service';

// 17A: DI infrastructure only (engine + provider token). 17B adds the
// deterministic ImagePromptBuilderService (no DB, no provider call). 17C-
// 17E share ONE persisted creative workflow — CreativeGenerationService —
// covering social images, blog heroes, and thumbnails; it reuses the same
// paid-generation approval gates as 15C-15I/16H, and CreativeAssetsService
// is the only place that writes a CreativeAsset document. 17F adds
// organization/product-scoped brand asset management (BrandAssetsService/
// BrandVisualProfileService) that CreativeGenerationService consults —
// cheaply, read-only — to enrich the 17B prompt when genuine brand data
// exists.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CreativeAsset.name, schema: CreativeAssetSchema },
      { name: BrandAsset.name, schema: BrandAssetSchema },
      { name: BrandVisualProfile.name, schema: BrandVisualProfileSchema },
    ]),
    CampaignsModule,
    GrowthStrategyModule,
    ProductsModule,
    ContentGenerationModule,
  ],
  controllers: [CreativeController, BrandAssetsController, BrandVisualProfileController],
  providers: [
    FakeCreativeProvider,
    { provide: CREATIVE_PROVIDER_TOKEN, useClass: FakeCreativeProvider },
    CreativeEngineService,
    ImagePromptBuilderService,
    CreativeAssetsService,
    CreativeGenerationService,
    BrandAssetsService,
    BrandVisualProfileService,
  ],
  exports: [CreativeEngineService, ImagePromptBuilderService, CreativeAssetsService],
})
export class CreativeModule {}
