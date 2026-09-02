import { Module } from '@nestjs/common';
import { WebsiteContentExtractorService } from './website-content-extractor.service';
import { WebsiteCorePageExtractionService } from './website-core-page-extraction.service';
import { WebsiteFetchService } from './website-fetch.service';
import { WebsiteIntelligenceController } from './website-intelligence.controller';
import { WebsitePageDiscoveryService } from './website-page-discovery.service';
import { WebsitePageSelectionService } from './website-page-selection.service';
import { WebsiteUrlSecurityService } from './website-url-security.service';

@Module({
  controllers: [WebsiteIntelligenceController],
  providers: [
    WebsiteFetchService,
    WebsiteUrlSecurityService,
    WebsiteContentExtractorService,
    WebsitePageDiscoveryService,
    WebsitePageSelectionService,
    WebsiteCorePageExtractionService,
  ],
  exports: [
    WebsiteFetchService,
    WebsiteContentExtractorService,
    WebsitePageDiscoveryService,
    WebsitePageSelectionService,
    WebsiteCorePageExtractionService,
  ],
})
export class WebsiteIntelligenceModule {}
