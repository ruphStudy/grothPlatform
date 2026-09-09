import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { ContentGenerationModule } from '../content-generation/content-generation.module';
import { CreativeModule } from '../creative/creative.module';
import { GrowthStrategyModule } from '../growth-strategy/growth-strategy.module';
import { ProductsModule } from '../products/products.module';
import { WebsiteUrlSecurityService } from '../website-intelligence/website-url-security.service';
import { CmsConnection, CmsConnectionSchema } from './connections/schemas/cms-connection.schema';
import { CmsCredentialEncryptionService } from './connections/services/cms-credential-encryption.service';
import { CmsConnectionsService } from './connections/services/cms-connections.service';
import { CmsConnectionsController } from './connections/cms-connections.controller';
import { CmsPublicationsController } from './cms-publications.controller';
import { CmsSchedulesController } from './cms-schedules.controller';
import { CmsEngineService } from './engine/cms-engine.service';
import { CMS_PROVIDER_REGISTRY_TOKEN } from './providers/cms-provider.tokens';
import type { CmsProvider } from './providers/cms-provider.interface';
import { WordPressCmsProvider } from './providers/wordpress-cms.provider';
import { CmsPublication, CmsPublicationSchema } from './schemas/cms-publication.schema';
import { CmsSchedule, CmsScheduleSchema } from './schemas/cms-schedule.schema';
import { CmsPublicationsService } from './services/cms-publications.service';
import { CmsSchedulerService } from './services/cms-scheduler.service';
import { CmsSchedulingService } from './services/cms-scheduling.service';
import type { CmsPlatform } from './types/cms.types';

// 20A: CmsEngineService depends only on the provider-registry token — a
// Map<CmsPlatform, CmsProvider> — never on a concrete provider class, so
// a second CMS platform later only means one more provider + one more
// map entry. 20B adds the persisted CmsConnection/WordPress workflow on
// top; no article publishing is wired here. WebsiteUrlSecurityService is
// re-provided here (not imported via WebsiteIntelligenceModule, which
// doesn't export it) — it is a stateless, ConfigService-only service, so
// instantiating it a second time carries no coupling risk.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CmsConnection.name, schema: CmsConnectionSchema },
      { name: CmsPublication.name, schema: CmsPublicationSchema },
      { name: CmsSchedule.name, schema: CmsScheduleSchema },
    ]),
    ProductsModule,
    CampaignsModule,
    GrowthStrategyModule,
    ContentGenerationModule,
    CreativeModule,
  ],
  controllers: [CmsConnectionsController, CmsPublicationsController, CmsSchedulesController],
  providers: [
    WordPressCmsProvider,
    {
      provide: CMS_PROVIDER_REGISTRY_TOKEN,
      useFactory: (wordpress: WordPressCmsProvider) => {
        const registry = new Map<CmsPlatform, CmsProvider>();
        registry.set('wordpress', wordpress);
        return registry;
      },
      inject: [WordPressCmsProvider],
    },
    CmsEngineService,
    WebsiteUrlSecurityService,
    CmsCredentialEncryptionService,
    CmsConnectionsService,
    CmsPublicationsService,
    CmsSchedulingService,
    CmsSchedulerService,
  ],
  exports: [CmsEngineService, CmsConnectionsService, CmsPublicationsService, CmsSchedulingService],
})
export class CmsIntegrationsModule {}
