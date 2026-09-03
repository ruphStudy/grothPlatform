import { Module } from '@nestjs/common';
import { MarketIntelligenceModule } from '../market-intelligence/market-intelligence.module';
import { ProductsModule } from '../products/products.module';
import { WebsiteIntelligenceModule } from '../website-intelligence/website-intelligence.module';
import { AudienceIntelligenceController } from './audience-intelligence.controller';
import { AudienceSegmentService } from './audience-segment.service';
import { AudienceSignalService } from './audience-signal.service';
import { BuyerUserMapService } from './buyer-user-map.service';
import { IcpService } from './icp.service';

@Module({
  imports: [ProductsModule, WebsiteIntelligenceModule, MarketIntelligenceModule],
  controllers: [AudienceIntelligenceController],
  providers: [AudienceSignalService, AudienceSegmentService, IcpService, BuyerUserMapService],
  exports: [AudienceSignalService, AudienceSegmentService, IcpService, BuyerUserMapService],
})
export class AudienceIntelligenceModule {}
