import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { ResearchModule } from '../research/research.module';
import { WebsiteIntelligenceModule } from '../website-intelligence/website-intelligence.module';
import { CompetitiveIntelligenceService } from './competitive-intelligence.service';
import { CompetitorDiscoveryService } from './competitor-discovery.service';
import { CompetitorFeatureComparisonService } from './competitor-feature-comparison.service';
import { CompetitorPositioningService } from './competitor-positioning.service';
import { CompetitorWebsiteAnalysisService } from './competitor-website-analysis.service';
import { MarketCategoryController } from './market-category.controller';
import { MarketCategoryService } from './market-category.service';
import { MarketGapService } from './market-gap.service';

@Module({
  imports: [ProductsModule, WebsiteIntelligenceModule, ResearchModule],
  controllers: [MarketCategoryController],
  providers: [
    MarketCategoryService,
    CompetitorDiscoveryService,
    CompetitorWebsiteAnalysisService,
    CompetitorFeatureComparisonService,
    CompetitorPositioningService,
    MarketGapService,
    CompetitiveIntelligenceService,
  ],
  exports: [
    MarketCategoryService,
    CompetitorDiscoveryService,
    CompetitorWebsiteAnalysisService,
    CompetitorFeatureComparisonService,
    CompetitorPositioningService,
    MarketGapService,
    CompetitiveIntelligenceService,
  ],
})
export class MarketIntelligenceModule {}
