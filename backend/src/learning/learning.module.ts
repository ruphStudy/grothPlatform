import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyticsEvent, AnalyticsEventSchema } from '../analytics/schemas/analytics-event.schema';
import { SocialPostMetricsSnapshot, SocialPostMetricsSnapshotSchema } from '../analytics/schemas/social-post-metrics-snapshot.schema';
import { WebAnalyticsEvent, WebAnalyticsEventSchema } from '../analytics/schemas/web-analytics-event.schema';
import { AttributionTouchpoint, AttributionTouchpointSchema } from '../attribution/schemas/attribution-touchpoint.schema';
import { CmsPublication, CmsPublicationSchema } from '../cms-integrations/schemas/cms-publication.schema';
import { ContentVersion, ContentVersionSchema } from '../content-generation/schemas/content-version.schema';
import { ContentQualityResult, ContentQualityResultSchema } from '../content-generation/schemas/content-quality-result.schema';
import { CrmOpportunity, CrmOpportunitySchema } from '../crm/schemas/crm-opportunity.schema';
import { EmailEvent, EmailEventSchema } from '../email/schemas/email-event.schema';
import { GrowthStrategyReview, GrowthStrategyReviewSchema } from '../growth-strategy/schemas/growth-strategy-review.schema';
import { Lead, LeadSchema } from '../leads/schemas/lead.schema';
import { ProductsModule } from '../products/products.module';
import { SocialPublication, SocialPublicationSchema } from '../social-publishing/schemas/social-publication.schema';
import { LearningController } from './learning.controller';
import {
  LearningInsight,
  LearningInsightSchema,
  LearningObservation,
  LearningObservationSchema,
  LearningRecommendation,
  LearningRecommendationSchema,
  LearningRun,
  LearningRunSchema,
  StrategyAdjustmentProposal,
  StrategyAdjustmentProposalSchema,
} from './schemas/learning.schema';
import { LearningService } from './services/learning.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LearningRun.name, schema: LearningRunSchema },
      { name: LearningObservation.name, schema: LearningObservationSchema },
      { name: LearningInsight.name, schema: LearningInsightSchema },
      { name: LearningRecommendation.name, schema: LearningRecommendationSchema },
      { name: StrategyAdjustmentProposal.name, schema: StrategyAdjustmentProposalSchema },
      { name: AnalyticsEvent.name, schema: AnalyticsEventSchema },
      { name: WebAnalyticsEvent.name, schema: WebAnalyticsEventSchema },
      { name: SocialPostMetricsSnapshot.name, schema: SocialPostMetricsSnapshotSchema },
      { name: AttributionTouchpoint.name, schema: AttributionTouchpointSchema },
      { name: CmsPublication.name, schema: CmsPublicationSchema },
      { name: SocialPublication.name, schema: SocialPublicationSchema },
      { name: ContentVersion.name, schema: ContentVersionSchema },
      { name: ContentQualityResult.name, schema: ContentQualityResultSchema },
      { name: CrmOpportunity.name, schema: CrmOpportunitySchema },
      { name: EmailEvent.name, schema: EmailEventSchema },
      { name: Lead.name, schema: LeadSchema },
      { name: GrowthStrategyReview.name, schema: GrowthStrategyReviewSchema },
    ]),
    ProductsModule,
  ],
  controllers: [LearningController],
  providers: [LearningService],
  exports: [LearningService],
})
export class LearningModule {}
