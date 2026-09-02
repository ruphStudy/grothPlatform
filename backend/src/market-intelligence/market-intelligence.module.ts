import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { ResearchModule } from '../research/research.module';
import { WebsiteIntelligenceModule } from '../website-intelligence/website-intelligence.module';
import { CompetitorDiscoveryService } from './competitor-discovery.service';
import { MarketCategoryController } from './market-category.controller';
import { MarketCategoryService } from './market-category.service';

@Module({
  imports: [ProductsModule, WebsiteIntelligenceModule, ResearchModule],
  controllers: [MarketCategoryController],
  providers: [MarketCategoryService, CompetitorDiscoveryService],
  exports: [MarketCategoryService, CompetitorDiscoveryService],
})
export class MarketIntelligenceModule {}
