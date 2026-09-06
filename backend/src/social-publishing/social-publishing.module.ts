import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { ContentGenerationModule } from '../content-generation/content-generation.module';
import { CreativeModule } from '../creative/creative.module';
import { GrowthStrategyModule } from '../growth-strategy/growth-strategy.module';
import { ProductsModule } from '../products/products.module';
import { SocialIntegrationsModule } from '../social-integrations/social-integrations.module';
import { SocialPublication, SocialPublicationSchema } from './schemas/social-publication.schema';
import { SocialSchedule, SocialScheduleSchema } from './schemas/social-schedule.schema';
import { SocialPublishingService } from './services/social-publishing.service';
import { SocialSchedulingService } from './services/social-scheduling.service';
import { SocialSchedulerService } from './services/social-scheduler.service';
import { SocialPublishingController } from './social-publishing.controller';
import { SocialSchedulingController } from './social-scheduling.controller';

// 19A/19B: the only module that persists SocialPublication records and
// orchestrates publishing. Reuses 15/16 content-version + human-review
// infrastructure, 17 CreativeAsset infrastructure, and 18 social
// connection/provider infrastructure wholesale — no publishing logic
// lives inside any platform adapter, controller, or the creative/content
// modules themselves.
// 19C/19D: SocialSchedulingService reuses SocialPublishingService's shared
// gates for scheduling (no provider call); SocialSchedulerService is a
// module-lifecycle-driven polling worker that executes due schedules
// through SocialPublishingService.publish() — no separate queue stack.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SocialPublication.name, schema: SocialPublicationSchema },
      { name: SocialSchedule.name, schema: SocialScheduleSchema },
    ]),
    CampaignsModule,
    GrowthStrategyModule,
    ProductsModule,
    ContentGenerationModule,
    CreativeModule,
    SocialIntegrationsModule,
  ],
  controllers: [SocialPublishingController, SocialSchedulingController],
  providers: [SocialPublishingService, SocialSchedulingService, SocialSchedulerService],
})
export class SocialPublishingModule {}
