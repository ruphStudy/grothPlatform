import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AudienceIntelligenceModule } from '../audience-intelligence/audience-intelligence.module';
import { KeywordIntelligenceModule } from '../keyword-intelligence/keyword-intelligence.module';
import { MarketIntelligenceModule } from '../market-intelligence/market-intelligence.module';
import { ProductsModule } from '../products/products.module';
import { WebsiteIntelligenceModule } from '../website-intelligence/website-intelligence.module';
import { AcquisitionStrategyService } from './acquisition-strategy.service';
import { ContentStrategyService } from './content-strategy.service';
import { ConversionStrategyService } from './conversion-strategy.service';
import { FunnelStrategyService } from './funnel-strategy.service';
import { GrowthChannelFitService } from './growth-channel-fit.service';
import { GrowthMotionService } from './growth-motion.service';
import { GrowthObjectiveService } from './growth-objective.service';
import { GrowthPlanService } from './growth-plan.service';
import { GrowthStrategyController } from './growth-strategy.controller';
import { GrowthStrategyReviewService } from './growth-strategy-review.service';
import { GrowthStrategyService } from './growth-strategy.service';
import { MessagingStrategyService } from './messaging-strategy.service';
import { GrowthStrategyReview, GrowthStrategyReviewSchema } from './schemas/growth-strategy-review.schema';
import { StrategySignalService } from './strategy-signal.service';

@Module({
  imports: [
    ProductsModule,
    WebsiteIntelligenceModule,
    MarketIntelligenceModule,
    AudienceIntelligenceModule,
    KeywordIntelligenceModule,
    MongooseModule.forFeature([{ name: GrowthStrategyReview.name, schema: GrowthStrategyReviewSchema }]),
  ],
  controllers: [GrowthStrategyController],
  providers: [
    StrategySignalService,
    GrowthObjectiveService,
    GrowthChannelFitService,
    GrowthMotionService,
    FunnelStrategyService,
    MessagingStrategyService,
    ContentStrategyService,
    AcquisitionStrategyService,
    ConversionStrategyService,
    GrowthPlanService,
    GrowthStrategyReviewService,
    GrowthStrategyService,
  ],
  exports: [
    StrategySignalService,
    GrowthObjectiveService,
    GrowthChannelFitService,
    GrowthMotionService,
    FunnelStrategyService,
    MessagingStrategyService,
    ContentStrategyService,
    AcquisitionStrategyService,
    ConversionStrategyService,
    GrowthPlanService,
    GrowthStrategyReviewService,
    GrowthStrategyService,
  ],
})
export class GrowthStrategyModule {}
