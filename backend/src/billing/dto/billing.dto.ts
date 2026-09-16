import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { BILLING_INTERVALS } from '../schemas/billing.schema';

export class CheckoutDto {
  @IsString()
  planKey: string;

  @IsIn(BILLING_INTERVALS)
  billingInterval: (typeof BILLING_INTERVALS)[number];

  @IsOptional()
  @IsString()
  currency?: string;
}

export class ChangePlanDto extends CheckoutDto {}

export class BillingWebhookDto {
  @IsString()
  id: string;

  @IsString()
  type: string;

  @IsObject()
  data: Record<string, unknown>;
}
