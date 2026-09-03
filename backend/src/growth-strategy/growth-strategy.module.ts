import { Module } from '@nestjs/common';
import { AudienceIntelligenceModule } from '../audience-intelligence/audience-intelligence.module';
import { KeywordIntelligenceModule } from '../keyword-intelligence/keyword-intelligence.module';
import { MarketIntelligenceModule } from '../market-intelligence/market-intelligence.module';
import { ProductsModule } from '../products/products.module';
import { WebsiteIntelligenceModule } from '../website-intelligence/website-intelligence.module';
import { GrowthChannelFitService } from './growth-channel-fit.service';
import { GrowthMotionService } from './growth-motion.service';
import { GrowthObjectiveService } from './growth-objective.service';
import { GrowthStrategyController } from './growth-strategy.controller';
import { GrowthStrategyService } from './growth-strategy.service';
import { StrategySignalService } from './strategy-signal.service';

@Module({
  imports: [ProductsModule, WebsiteIntelligenceModule, MarketIntelligenceModule, AudienceIntelligenceModule, KeywordIntelligenceModule],
  controllers: [GrowthStrategyController],
  providers: [StrategySignalService, GrowthObjectiveService, GrowthChannelFitService, GrowthMotionService, GrowthStrategyService],
  exports: [StrategySignalService, GrowthObjectiveService, GrowthChannelFitService, GrowthMotionService, GrowthStrategyService],
})
export class GrowthStrategyModule {}
