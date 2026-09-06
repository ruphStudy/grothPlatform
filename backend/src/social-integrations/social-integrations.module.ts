import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductsModule } from '../products/products.module';
import { OAuthState, OAuthStateSchema } from './connections/schemas/oauth-state.schema';
import { PendingAccountSelection, PendingAccountSelectionSchema } from './connections/schemas/pending-account-selection.schema';
import { SocialConnection, SocialConnectionSchema } from './connections/schemas/social-connection.schema';
import { MetaAccountSelectionService } from './connections/services/meta-account-selection.service';
import { OAuthStateService } from './connections/services/oauth-state.service';
import { SocialConnectionsService } from './connections/services/social-connections.service';
import { TokenEncryptionService } from './connections/services/token-encryption.service';
import { SocialConnectionsController } from './connections/social-connections.controller';
import { SocialOAuthCallbackController } from './connections/social-oauth-callback.controller';
import { SocialEngineService } from './engine/social-engine.service';
import { FacebookSocialProvider } from './providers/facebook-social.provider';
import { InstagramSocialProvider } from './providers/instagram-social.provider';
import { LinkedInSocialProvider } from './providers/linkedin-social.provider';
import { SOCIAL_PROVIDER_REGISTRY_TOKEN } from './providers/social-provider.tokens';
import type { SocialProvider } from './providers/social-provider.interface';
import { XSocialProvider } from './providers/x-social.provider';
import type { SocialPlatform } from './types/social.types';

// 18A: SocialEngineService depends only on the provider-registry token — a
// Map<SocialPlatform, SocialProvider> — never on a concrete provider
// class, so a fifth platform only means one more provider + one more map
// entry. 18B adds the persisted SocialConnection/OAuthState workflow on
// top; no publishing/scheduling is wired here.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SocialConnection.name, schema: SocialConnectionSchema },
      { name: OAuthState.name, schema: OAuthStateSchema },
      { name: PendingAccountSelection.name, schema: PendingAccountSelectionSchema },
    ]),
    ProductsModule,
  ],
  controllers: [SocialConnectionsController, SocialOAuthCallbackController],
  providers: [
    LinkedInSocialProvider,
    XSocialProvider,
    FacebookSocialProvider,
    InstagramSocialProvider,
    {
      provide: SOCIAL_PROVIDER_REGISTRY_TOKEN,
      useFactory: (linkedin: LinkedInSocialProvider, x: XSocialProvider, facebook: FacebookSocialProvider, instagram: InstagramSocialProvider) => {
        const registry = new Map<SocialPlatform, SocialProvider>();
        registry.set('linkedin', linkedin);
        registry.set('x', x);
        registry.set('facebook', facebook);
        registry.set('instagram', instagram);
        return registry;
      },
      inject: [LinkedInSocialProvider, XSocialProvider, FacebookSocialProvider, InstagramSocialProvider],
    },
    SocialEngineService,
    TokenEncryptionService,
    OAuthStateService,
    SocialConnectionsService,
    MetaAccountSelectionService,
  ],
  exports: [SocialEngineService],
})
export class SocialIntegrationsModule {}
