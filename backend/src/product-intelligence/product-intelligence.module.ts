import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiModule } from '../ai/ai.module';
import { ProductsModule } from '../products/products.module';
import { ProductIntelligenceController } from './product-intelligence.controller';
import { ProductIntelligenceService } from './product-intelligence.service';
import {
  ProductIntelligenceProfile,
  ProductIntelligenceProfileSchema,
} from './schemas/product-intelligence-profile.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProductIntelligenceProfile.name, schema: ProductIntelligenceProfileSchema },
    ]),
    ProductsModule,
    AiModule,
  ],
  controllers: [ProductIntelligenceController],
  providers: [ProductIntelligenceService],
})
export class ProductIntelligenceModule {}
