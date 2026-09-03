import { Module } from '@nestjs/common';
import { AudienceIntelligenceModule } from '../audience-intelligence/audience-intelligence.module';
import { MarketIntelligenceModule } from '../market-intelligence/market-intelligence.module';
import { ProductsModule } from '../products/products.module';
import { WebsiteIntelligenceModule } from '../website-intelligence/website-intelligence.module';
import { KeywordIntelligenceController } from './keyword-intelligence.controller';
import { KeywordIntelligenceService } from './keyword-intelligence.service';
import { KeywordSignalService } from './keyword-signal.service';

@Module({
  imports: [ProductsModule, WebsiteIntelligenceModule, MarketIntelligenceModule, AudienceIntelligenceModule],
  controllers: [KeywordIntelligenceController],
  providers: [KeywordSignalService, KeywordIntelligenceService],
  exports: [KeywordSignalService, KeywordIntelligenceService],
})
export class KeywordIntelligenceModule {}
