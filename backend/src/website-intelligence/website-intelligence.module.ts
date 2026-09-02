import { Module } from '@nestjs/common';
import { WebsiteFetchService } from './website-fetch.service';
import { WebsiteIntelligenceController } from './website-intelligence.controller';
import { WebsiteUrlSecurityService } from './website-url-security.service';

@Module({
  controllers: [WebsiteIntelligenceController],
  providers: [WebsiteFetchService, WebsiteUrlSecurityService],
  exports: [WebsiteFetchService],
})
export class WebsiteIntelligenceModule {}
