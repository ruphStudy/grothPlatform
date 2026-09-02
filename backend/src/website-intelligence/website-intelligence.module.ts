import { Module } from '@nestjs/common';
import { WebsiteContentExtractorService } from './website-content-extractor.service';
import { WebsiteFetchService } from './website-fetch.service';
import { WebsiteIntelligenceController } from './website-intelligence.controller';
import { WebsitePageDiscoveryService } from './website-page-discovery.service';
import { WebsiteUrlSecurityService } from './website-url-security.service';

@Module({
  controllers: [WebsiteIntelligenceController],
  providers: [WebsiteFetchService, WebsiteUrlSecurityService, WebsiteContentExtractorService, WebsitePageDiscoveryService],
  exports: [WebsiteFetchService, WebsiteContentExtractorService, WebsitePageDiscoveryService],
})
export class WebsiteIntelligenceModule {}
