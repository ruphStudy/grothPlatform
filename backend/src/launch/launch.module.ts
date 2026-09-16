import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BillingModule } from '../billing/billing.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ProductsModule } from '../products/products.module';
import { TeamModule } from '../team/team.module';
import { LegalAcceptance, LegalAcceptanceSchema } from './schemas/legal-acceptance.schema';
import { UserOnboardingState, UserOnboardingStateSchema } from './schemas/user-onboarding-state.schema';
import { LaunchReadinessController, LegalController, OnboardingController } from './launch.controller';
import { LaunchReadinessService, LegalAcceptanceService, OnboardingService } from './launch.service';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: LegalAcceptance.name, schema: LegalAcceptanceSchema },
      { name: UserOnboardingState.name, schema: UserOnboardingStateSchema },
    ]),
    BillingModule,
    OrganizationsModule,
    ProductsModule,
    TeamModule,
  ],
  controllers: [LegalController, OnboardingController, LaunchReadinessController],
  providers: [LegalAcceptanceService, OnboardingService, LaunchReadinessService],
  exports: [LegalAcceptanceService, OnboardingService, LaunchReadinessService],
})
export class LaunchModule {}
