import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Campaign, CampaignSchema } from '../campaigns/schemas/campaign.schema';
import { CmsPublication, CmsPublicationSchema } from '../cms-integrations/schemas/cms-publication.schema';
import { ContentVersion, ContentVersionSchema } from '../content-generation/schemas/content-version.schema';
import { ContentHumanReviewResult, ContentHumanReviewResultSchema } from '../content-generation/schemas/content-human-review-result.schema';
import { ContentQualityResult, ContentQualityResultSchema } from '../content-generation/schemas/content-quality-result.schema';
import { CreativeAsset, CreativeAssetSchema } from '../creative/schemas/creative-asset.schema';
import { CrmOpportunity, CrmOpportunitySchema } from '../crm/schemas/crm-opportunity.schema';
import { EmailEvent, EmailEventSchema } from '../email/schemas/email-event.schema';
import { EmailMessage, EmailMessageSchema } from '../email/schemas/email-message.schema';
import { EmailTemplate, EmailTemplateSchema } from '../email/schemas/email-template.schema';
import { LeadQualification, LeadQualificationSchema } from '../leads/schemas/lead-qualification.schema';
import { LeadSourceEvent, LeadSourceEventSchema } from '../leads/schemas/lead-source-event.schema';
import { Lead, LeadSchema } from '../leads/schemas/lead.schema';
import { ProductsModule } from '../products/products.module';
import { SocialIntegrationsModule } from '../social-integrations/social-integrations.module';
import { SocialPublication, SocialPublicationSchema } from '../social-publishing/schemas/social-publication.schema';
import { AnalyticsController, PublicAnalyticsController } from './analytics.controller';
import { AnalyticsEvent, AnalyticsEventSchema } from './schemas/analytics-event.schema';
import { AnalyticsReport, AnalyticsReportSchema } from './schemas/analytics-report.schema';
import { SocialPostMetricsSnapshot, SocialPostMetricsSnapshotSchema } from './schemas/social-post-metrics-snapshot.schema';
import { WebAnalyticsEvent, WebAnalyticsEventSchema } from './schemas/web-analytics-event.schema';
import { WebAnalyticsSite, WebAnalyticsSiteSchema } from './schemas/web-analytics-site.schema';
import { AnalyticsEventService } from './services/analytics-event.service';
import { AnalyticsFunnelService } from './services/analytics-funnel.service';
import { AnalyticsQueryService } from './services/analytics-query.service';
import { AnalyticsReportingService } from './services/analytics-reporting.service';
import { ContentAnalyticsService } from './services/content-analytics.service';
import { SocialAnalyticsService } from './services/social-analytics.service';
import { WebAnalyticsService } from './services/web-analytics.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AnalyticsEvent.name, schema: AnalyticsEventSchema },
      { name: WebAnalyticsSite.name, schema: WebAnalyticsSiteSchema },
      { name: WebAnalyticsEvent.name, schema: WebAnalyticsEventSchema },
      { name: AnalyticsReport.name, schema: AnalyticsReportSchema },
      { name: SocialPostMetricsSnapshot.name, schema: SocialPostMetricsSnapshotSchema },
      { name: Lead.name, schema: LeadSchema },
      { name: LeadSourceEvent.name, schema: LeadSourceEventSchema },
      { name: LeadQualification.name, schema: LeadQualificationSchema },
      { name: CrmOpportunity.name, schema: CrmOpportunitySchema },
      { name: EmailMessage.name, schema: EmailMessageSchema },
      { name: EmailEvent.name, schema: EmailEventSchema },
      { name: SocialPublication.name, schema: SocialPublicationSchema },
      { name: CmsPublication.name, schema: CmsPublicationSchema },
      { name: ContentVersion.name, schema: ContentVersionSchema },
      { name: ContentQualityResult.name, schema: ContentQualityResultSchema },
      { name: ContentHumanReviewResult.name, schema: ContentHumanReviewResultSchema },
      { name: CreativeAsset.name, schema: CreativeAssetSchema },
      { name: EmailTemplate.name, schema: EmailTemplateSchema },
      { name: Campaign.name, schema: CampaignSchema },
    ]),
    ProductsModule,
    SocialIntegrationsModule,
  ],
  controllers: [AnalyticsController, PublicAnalyticsController],
  providers: [AnalyticsEventService, AnalyticsQueryService, AnalyticsFunnelService, ContentAnalyticsService, WebAnalyticsService, AnalyticsReportingService, SocialAnalyticsService],
  exports: [AnalyticsEventService, AnalyticsQueryService, AnalyticsFunnelService, ContentAnalyticsService, WebAnalyticsService, AnalyticsReportingService, SocialAnalyticsService],
})
export class AnalyticsModule {}
