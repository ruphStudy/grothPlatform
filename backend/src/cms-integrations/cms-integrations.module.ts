import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductsModule } from '../products/products.module';
import { WebsiteUrlSecurityService } from '../website-intelligence/website-url-security.service';
import { CmsConnection, CmsConnectionSchema } from './connections/schemas/cms-connection.schema';
import { CmsCredentialEncryptionService } from './connections/services/cms-credential-encryption.service';
import { CmsConnectionsService } from './connections/services/cms-connections.service';
import { CmsConnectionsController } from './connections/cms-connections.controller';
import { CmsEngineService } from './engine/cms-engine.service';
import { CMS_PROVIDER_REGISTRY_TOKEN } from './providers/cms-provider.tokens';
import type { CmsProvider } from './providers/cms-provider.interface';
import { WordPressCmsProvider } from './providers/wordpress-cms.provider';
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
  imports: [MongooseModule.forFeature([{ name: CmsConnection.name, schema: CmsConnectionSchema }]), ProductsModule],
  controllers: [CmsConnectionsController],
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
  ],
  exports: [CmsEngineService, CmsConnectionsService],
})
export class CmsIntegrationsModule {}
