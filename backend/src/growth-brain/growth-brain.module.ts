import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiModule } from '../ai/ai.module';
import { AnalyticsEvent, AnalyticsEventSchema } from '../analytics/schemas/analytics-event.schema';
import { AttributionTouchpoint, AttributionTouchpointSchema } from '../attribution/schemas/attribution-touchpoint.schema';
import { BillingModule } from '../billing/billing.module';
import { Campaign, CampaignSchema } from '../campaigns/schemas/campaign.schema';
import { ContentVersion, ContentVersionSchema } from '../content-generation/schemas/content-version.schema';
import { GrowthStrategyReview, GrowthStrategyReviewSchema } from '../growth-strategy/schemas/growth-strategy-review.schema';
import { LearningObservation, LearningObservationSchema, LearningRecommendation, LearningRecommendationSchema, StrategyAdjustmentProposal, StrategyAdjustmentProposalSchema } from '../learning/schemas/learning.schema';
import { ProductsModule } from '../products/products.module';
import { GrowthBrainController } from './growth-brain.controller';
import {
  ChannelPriority,
  ChannelPrioritySchema,
  ContentPriority,
  ContentPrioritySchema,
  GrowthAllocationPlan,
  GrowthAllocationPlanSchema,
  GrowthDecisionExplanation,
  GrowthDecisionExplanationSchema,
  GrowthDecisionRun,
  GrowthDecisionRunSchema,
  GrowthOpportunity,
  GrowthOpportunitySchema,
  GrowthResourceConstraints,
  GrowthResourceConstraintsSchema,
  WeeklyGrowthPlan,
  WeeklyGrowthPlanSchema,
} from './schemas/growth-brain.schema';
import { BudgetEffortAllocationService, ChannelPrioritizationService, ContentPrioritizationService, DecisionExplanationService, GrowthBrainReadService, GrowthDecisionEngineService, OpportunityRankingService, WeeklyGrowthPlanService } from './services/growth-brain.services';

@Module({
  imports: [
    AiModule,
    BillingModule,
    ProductsModule,
    MongooseModule.forFeature([
      { name: GrowthDecisionRun.name, schema: GrowthDecisionRunSchema },
      { name: GrowthOpportunity.name, schema: GrowthOpportunitySchema },
      { name: GrowthResourceConstraints.name, schema: GrowthResourceConstraintsSchema },
      { name: GrowthAllocationPlan.name, schema: GrowthAllocationPlanSchema },
      { name: ChannelPriority.name, schema: ChannelPrioritySchema },
      { name: ContentPriority.name, schema: ContentPrioritySchema },
      { name: WeeklyGrowthPlan.name, schema: WeeklyGrowthPlanSchema },
      { name: GrowthDecisionExplanation.name, schema: GrowthDecisionExplanationSchema },
      { name: Campaign.name, schema: CampaignSchema },
      { name: GrowthStrategyReview.name, schema: GrowthStrategyReviewSchema },
      { name: LearningObservation.name, schema: LearningObservationSchema },
      { name: LearningRecommendation.name, schema: LearningRecommendationSchema },
      { name: StrategyAdjustmentProposal.name, schema: StrategyAdjustmentProposalSchema },
      { name: AnalyticsEvent.name, schema: AnalyticsEventSchema },
      { name: AttributionTouchpoint.name, schema: AttributionTouchpointSchema },
      { name: ContentVersion.name, schema: ContentVersionSchema },
    ]),
  ],
  controllers: [GrowthBrainController],
  providers: [GrowthDecisionEngineService, OpportunityRankingService, BudgetEffortAllocationService, ChannelPrioritizationService, ContentPrioritizationService, WeeklyGrowthPlanService, DecisionExplanationService, GrowthBrainReadService],
  exports: [GrowthDecisionEngineService, GrowthBrainReadService],
})
export class GrowthBrainModule {}
