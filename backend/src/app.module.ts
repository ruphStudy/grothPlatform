import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { AudienceIntelligenceModule } from './audience-intelligence/audience-intelligence.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { CmsIntegrationsModule } from './cms-integrations/cms-integrations.module';
import { ContentGenerationModule } from './content-generation/content-generation.module';
import { ContentPlanningModule } from './content-planning/content-planning.module';
import { CreativeModule } from './creative/creative.module';
import { CrmModule } from './crm/crm.module';
import { EmailModule } from './email/email.module';
import { GrowthStrategyModule } from './growth-strategy/growth-strategy.module';
import { MarketIntelligenceModule } from './market-intelligence/market-intelligence.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { ProductIntelligenceModule } from './product-intelligence/product-intelligence.module';
import { KeywordIntelligenceModule } from './keyword-intelligence/keyword-intelligence.module';
import { LeadsModule } from './leads/leads.module';
import { ProductsModule } from './products/products.module';
import { ResearchModule } from './research/research.module';
import { SocialIntegrationsModule } from './social-integrations/social-integrations.module';
import { SocialPublishingModule } from './social-publishing/social-publishing.module';
import { UsersModule } from './users/users.module';
import { WebsiteIntelligenceModule } from './website-intelligence/website-intelligence.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
    }),
    UsersModule,
    AuthModule,
    OrganizationsModule,
    ProductsModule,
    ProductIntelligenceModule,
    WebsiteIntelligenceModule,
    ResearchModule,
    MarketIntelligenceModule,
    AudienceIntelligenceModule,
    AnalyticsModule,
    KeywordIntelligenceModule,
    GrowthStrategyModule,
    CampaignsModule,
    ContentPlanningModule,
    ContentGenerationModule,
    CreativeModule,
    SocialIntegrationsModule,
    SocialPublishingModule,
    CmsIntegrationsModule,
    LeadsModule,
    CrmModule,
    EmailModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
