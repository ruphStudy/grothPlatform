import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';
import { BILLING_INTERVALS } from '../../billing/schemas/billing.schema';
import { PRIMARY_GOALS, PRODUCT_TYPES } from '../../products/schemas/product.schema';

export class UpdateOnboardingDto {
  @IsOptional()
  @IsString()
  currentStep?: string;

  @IsOptional()
  @IsString({ each: true })
  completedSteps?: string[];

  @IsOptional()
  @IsString()
  selectedPlanKey?: string;

  @IsOptional()
  @IsIn(BILLING_INTERVALS)
  selectedBillingInterval?: 'monthly' | 'yearly';

  @IsOptional()
  @IsString()
  organizationId?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  growthGoal?: string;
}

export class CreateOnboardingOrganizationDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class CreateOnboardingProductDto {
  @IsString()
  @IsNotEmpty()
  organizationId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsUrl({ require_tld: false, protocols: ['http', 'https'], require_protocol: true })
  websiteUrl?: string;

  @IsOptional()
  @IsString()
  shortDescription?: string;

  @IsOptional()
  @IsIn(PRODUCT_TYPES)
  productType?: (typeof PRODUCT_TYPES)[number];

  @IsOptional()
  @IsIn(PRIMARY_GOALS)
  primaryGoal?: (typeof PRIMARY_GOALS)[number];

  @IsOptional()
  @IsString()
  targetMarket?: string;
}

export class CompleteOnboardingDto {
  @IsString()
  @IsNotEmpty()
  organizationId: string;

  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsOptional()
  @IsString()
  selectedPlanKey?: string;

  @IsOptional()
  @IsIn(BILLING_INTERVALS)
  selectedBillingInterval?: 'monthly' | 'yearly';
}

export class TourStateDto {
  @IsString()
  @IsNotEmpty()
  tourVersion: string;

  @IsOptional()
  @IsBoolean()
  started?: boolean;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;

  @IsOptional()
  @IsBoolean()
  skipped?: boolean;
}
