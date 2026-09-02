import { Module } from '@nestjs/common';
import { WebsiteContentExtractorService } from './website-content-extractor.service';
import { WebsiteFetchService } from './website-fetch.service';
import { WebsiteIntelligenceController } from './website-intelligence.controller';
import { WebsiteUrlSecurityService } from './website-url-security.service';

@Module({
  controllers: [WebsiteIntelligenceController],
  providers: [WebsiteFetchService, WebsiteUrlSecurityService, WebsiteContentExtractorService],
  exports: [WebsiteFetchService, WebsiteContentExtractorService],
})
export class WebsiteIntelligenceModule {}
