import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { AudienceIntelligenceModule } from './audience-intelligence/audience-intelligence.module';
import { MarketIntelligenceModule } from './market-intelligence/market-intelligence.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { ProductIntelligenceModule } from './product-intelligence/product-intelligence.module';
import { ProductsModule } from './products/products.module';
import { ResearchModule } from './research/research.module';
import { UsersModule } from './users/users.module';
import { WebsiteIntelligenceModule } from './website-intelligence/website-intelligence.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
    }),
    UsersModule,
    AuthModule,
    OrganizationsModule,
    ProductsModule,
    ProductIntelligenceModule,
    WebsiteIntelligenceModule,
    ResearchModule,
    MarketIntelligenceModule,
    AudienceIntelligenceModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
