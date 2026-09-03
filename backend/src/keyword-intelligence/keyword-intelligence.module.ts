import { Module } from '@nestjs/common';
import { AudienceIntelligenceModule } from '../audience-intelligence/audience-intelligence.module';
import { MarketIntelligenceModule } from '../market-intelligence/market-intelligence.module';
import { ProductsModule } from '../products/products.module';
import { WebsiteIntelligenceModule } from '../website-intelligence/website-intelligence.module';
import { CompetitorKeywordGapService } from './competitor-keyword-gap.service';
import { KeywordAudienceMapService } from './keyword-audience-map.service';
import { KeywordClusterService } from './keyword-cluster.service';
import { KeywordIntelligenceController } from './keyword-intelligence.controller';
import { KeywordIntelligenceService } from './keyword-intelligence.service';
import { KeywordIntentService } from './keyword-intent.service';
import { KeywordLongTailService } from './keyword-long-tail.service';
import { KeywordOpportunityService } from './keyword-opportunity.service';
import { KeywordSignalService } from './keyword-signal.service';

@Module({
  imports: [ProductsModule, WebsiteIntelligenceModule, MarketIntelligenceModule, AudienceIntelligenceModule],
  controllers: [KeywordIntelligenceController],
  providers: [
    KeywordSignalService,
    KeywordIntentService,
    KeywordClusterService,
    KeywordOpportunityService,
    CompetitorKeywordGapService,
    KeywordLongTailService,
    KeywordAudienceMapService,
    KeywordIntelligenceService,
  ],
  exports: [
    KeywordSignalService,
    KeywordIntentService,
    KeywordClusterService,
    KeywordOpportunityService,
    CompetitorKeywordGapService,
    KeywordLongTailService,
    KeywordAudienceMapService,
    KeywordIntelligenceService,
  ],
})
export class KeywordIntelligenceModule {}
