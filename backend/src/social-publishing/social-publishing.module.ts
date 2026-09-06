import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { ContentGenerationModule } from '../content-generation/content-generation.module';
import { CreativeModule } from '../creative/creative.module';
import { GrowthStrategyModule } from '../growth-strategy/growth-strategy.module';
import { ProductsModule } from '../products/products.module';
import { SocialIntegrationsModule } from '../social-integrations/social-integrations.module';
import { SocialPublication, SocialPublicationSchema } from './schemas/social-publication.schema';
import { SocialPublishingService } from './services/social-publishing.service';
import { SocialPublishingController } from './social-publishing.controller';

// 19A/19B: the only module that persists SocialPublication records and
// orchestrates publishing. Reuses 15/16 content-version + human-review
// infrastructure, 17 CreativeAsset infrastructure, and 18 social
// connection/provider infrastructure wholesale — no publishing logic
// lives inside any platform adapter, controller, or the creative/content
// modules themselves.
@Module({
  imports: [
    MongooseModule.forFeature([{ name: SocialPublication.name, schema: SocialPublicationSchema }]),
    CampaignsModule,
    GrowthStrategyModule,
    ProductsModule,
    ContentGenerationModule,
    CreativeModule,
    SocialIntegrationsModule,
  ],
  controllers: [SocialPublishingController],
  providers: [SocialPublishingService],
})
export class SocialPublishingModule {}
