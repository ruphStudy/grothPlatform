import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Campaign, CampaignSchema } from '../campaigns/schemas/campaign.schema';
import { CmsPublication, CmsPublicationSchema } from '../cms-integrations/schemas/cms-publication.schema';
import { ContentVersion, ContentVersionSchema } from '../content-generation/schemas/content-version.schema';
import { CreativeAsset, CreativeAssetSchema } from '../creative/schemas/creative-asset.schema';
import { CrmOpportunity, CrmOpportunitySchema } from '../crm/schemas/crm-opportunity.schema';
import { EmailEvent, EmailEventSchema } from '../email/schemas/email-event.schema';
import { EmailMessage, EmailMessageSchema } from '../email/schemas/email-message.schema';
import { LeadQualification, LeadQualificationSchema } from '../leads/schemas/lead-qualification.schema';
import { LeadSourceEvent, LeadSourceEventSchema } from '../leads/schemas/lead-source-event.schema';
import { Lead, LeadSchema } from '../leads/schemas/lead.schema';
import { ProductsModule } from '../products/products.module';
import { SocialPublication, SocialPublicationSchema } from '../social-publishing/schemas/social-publication.schema';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsEvent, AnalyticsEventSchema } from './schemas/analytics-event.schema';
import { AnalyticsEventService } from './services/analytics-event.service';
import { AnalyticsQueryService } from './services/analytics-query.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AnalyticsEvent.name, schema: AnalyticsEventSchema },
      { name: Lead.name, schema: LeadSchema },
      { name: LeadSourceEvent.name, schema: LeadSourceEventSchema },
      { name: LeadQualification.name, schema: LeadQualificationSchema },
      { name: CrmOpportunity.name, schema: CrmOpportunitySchema },
      { name: EmailMessage.name, schema: EmailMessageSchema },
      { name: EmailEvent.name, schema: EmailEventSchema },
      { name: SocialPublication.name, schema: SocialPublicationSchema },
      { name: CmsPublication.name, schema: CmsPublicationSchema },
      { name: ContentVersion.name, schema: ContentVersionSchema },
      { name: CreativeAsset.name, schema: CreativeAssetSchema },
      { name: Campaign.name, schema: CampaignSchema },
    ]),
    ProductsModule,
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsEventService, AnalyticsQueryService],
  exports: [AnalyticsEventService, AnalyticsQueryService],
})
export class AnalyticsModule {}
