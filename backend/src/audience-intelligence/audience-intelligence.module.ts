import { Module } from '@nestjs/common';
import { MarketIntelligenceModule } from '../market-intelligence/market-intelligence.module';
import { ProductsModule } from '../products/products.module';
import { WebsiteIntelligenceModule } from '../website-intelligence/website-intelligence.module';
import { AudienceIntelligenceController } from './audience-intelligence.controller';
import { AudienceSignalService } from './audience-signal.service';

@Module({
  imports: [ProductsModule, WebsiteIntelligenceModule, MarketIntelligenceModule],
  controllers: [AudienceIntelligenceController],
  providers: [AudienceSignalService],
  exports: [AudienceSignalService],
})
export class AudienceIntelligenceModule {}
