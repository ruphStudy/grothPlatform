import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { WebsiteIntelligenceModule } from '../website-intelligence/website-intelligence.module';
import { MarketCategoryController } from './market-category.controller';
import { MarketCategoryService } from './market-category.service';

@Module({
  imports: [ProductsModule, WebsiteIntelligenceModule],
  controllers: [MarketCategoryController],
  providers: [MarketCategoryService],
  exports: [MarketCategoryService],
})
export class MarketIntelligenceModule {}
