import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Organization, OrganizationSchema } from '../organizations/schemas/organization.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { TeamModule } from '../team/team.module';
import { BillingPlansController, BillingWebhookController, OrganizationBillingController } from './billing.controller';
import {
  AiUsageEvent,
  AiUsageEventSchema,
  BillingPlan,
  BillingPlanSchema,
  BillingWebhookEvent,
  BillingWebhookEventSchema,
  OrganizationSubscription,
  OrganizationSubscriptionSchema,
  SubscriptionHistoryEvent,
  SubscriptionHistoryEventSchema,
  UsageCounter,
  UsageCounterSchema,
  UsageEvent,
  UsageEventSchema,
  UsageReservation,
  UsageReservationSchema,
} from './schemas/billing.schema';
import { AiUsageService, BillingPlanService, PaymentProviderService, QuotaService, SubscriptionService, UsageMeterService } from './services/billing.service';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => TeamModule),
    MongooseModule.forFeature([
      { name: BillingPlan.name, schema: BillingPlanSchema },
      { name: OrganizationSubscription.name, schema: OrganizationSubscriptionSchema },
      { name: UsageEvent.name, schema: UsageEventSchema },
      { name: UsageCounter.name, schema: UsageCounterSchema },
      { name: UsageReservation.name, schema: UsageReservationSchema },
      { name: AiUsageEvent.name, schema: AiUsageEventSchema },
      { name: BillingWebhookEvent.name, schema: BillingWebhookEventSchema },
      { name: SubscriptionHistoryEvent.name, schema: SubscriptionHistoryEventSchema },
      { name: Organization.name, schema: OrganizationSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [BillingPlansController, OrganizationBillingController, BillingWebhookController],
  providers: [BillingPlanService, SubscriptionService, UsageMeterService, QuotaService, AiUsageService, PaymentProviderService],
  exports: [BillingPlanService, SubscriptionService, UsageMeterService, QuotaService, AiUsageService, PaymentProviderService],
})
export class BillingModule {}
