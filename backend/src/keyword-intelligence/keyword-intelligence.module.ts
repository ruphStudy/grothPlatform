import { Module } from '@nestjs/common';
import { AudienceIntelligenceModule } from '../audience-intelligence/audience-intelligence.module';
import { MarketIntelligenceModule } from '../market-intelligence/market-intelligence.module';
import { ProductsModule } from '../products/products.module';
import { WebsiteIntelligenceModule } from '../website-intelligence/website-intelligence.module';
import { KeywordClusterService } from './keyword-cluster.service';
import { KeywordIntelligenceController } from './keyword-intelligence.controller';
import { KeywordIntelligenceService } from './keyword-intelligence.service';
import { KeywordIntentService } from './keyword-intent.service';
import { KeywordSignalService } from './keyword-signal.service';

@Module({
  imports: [ProductsModule, WebsiteIntelligenceModule, MarketIntelligenceModule, AudienceIntelligenceModule],
  controllers: [KeywordIntelligenceController],
  providers: [KeywordSignalService, KeywordIntentService, KeywordClusterService, KeywordIntelligenceService],
  exports: [KeywordSignalService, KeywordIntentService, KeywordClusterService, KeywordIntelligenceService],
})
export class KeywordIntelligenceModule {}
