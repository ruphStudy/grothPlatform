import { Module } from '@nestjs/common';
import { WebsiteFetchService } from './website-fetch.service';
import { WebsiteIntelligenceController } from './website-intelligence.controller';

@Module({
  controllers: [WebsiteIntelligenceController],
  providers: [WebsiteFetchService],
  exports: [WebsiteFetchService],
})
export class WebsiteIntelligenceModule {}
