import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PERMISSIONS } from '../team/schemas/team.schema';
import { AuthorizationService } from '../team/services/team.service';
import { CheckoutDto, ChangePlanDto } from './dto/billing.dto';
import { AiUsageService, BillingPlanService, PaymentProviderService, QuotaService, SubscriptionService, UsageMeterService } from './services/billing.service';

@Controller('billing')
export class BillingPlansController {
  constructor(private readonly plans: BillingPlanService) {}

  @Get('plans')
  listPlans() {
    return this.plans.listPublicPlans();
  }

  @Get('plans/:planKey')
  getPlan(@Param('planKey') planKey: string) {
    return this.plans.getPlan(planKey);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/billing')
export class OrganizationBillingController {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly subscriptions: SubscriptionService,
    private readonly payments: PaymentProviderService,
    private readonly usage: UsageMeterService,
    private readonly aiUsage: AiUsageService,
    private readonly quotas: QuotaService,
  ) {}

  private async canView(organizationId: string, userId: string) {
    return this.authz.assertPermission(organizationId, userId, PERMISSIONS.BILLING_VIEW);
  }

  private async canManage(organizationId: string, userId: string) {
    return this.authz.assertPermission(organizationId, userId, PERMISSIONS.BILLING_MANAGE);
  }

  @Get('subscription')
  async subscription(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string) {
    await this.canView(organizationId, req.user.userId);
    return this.subscriptions.current(organizationId);
  }

  @Post('checkout')
  async checkout(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Body() dto: CheckoutDto) {
    await this.canManage(organizationId, req.user.userId);
    return this.payments.createCheckoutSession(organizationId, req.user.userId, dto.planKey, dto.billingInterval, dto.currency);
  }

  @Post('change-plan')
  async changePlan(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Body() dto: ChangePlanDto) {
    await this.canManage(organizationId, req.user.userId);
    return this.subscriptions.changeInternal(organizationId, dto.planKey, dto.billingInterval, req.user.userId, dto.currency);
  }

  @Post('cancel')
  async cancel(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string) {
    await this.canManage(organizationId, req.user.userId);
    return this.subscriptions.cancel(organizationId, req.user.userId);
  }

  @Post('reactivate')
  async reactivate(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string) {
    await this.canManage(organizationId, req.user.userId);
    return this.subscriptions.reactivate(organizationId, req.user.userId);
  }

  @Post('portal')
  async portal(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string) {
    await this.canManage(organizationId, req.user.userId);
    return this.payments.portal(organizationId);
  }

  @Get('usage')
  async usageSummary(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Query('productId') productId?: string) {
    await this.canView(organizationId, req.user.userId);
    const [summary, breakdown] = await Promise.all([this.usage.summaries(organizationId, productId), this.usage.productBreakdown(organizationId)]);
    return { summary, breakdown };
  }

  @Get('usage/ai')
  async ai(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string) {
    await this.canView(organizationId, req.user.userId);
    return this.aiUsage.summary(organizationId);
  }

  @Get('quotas')
  async quotaStatus(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string) {
    await this.canView(organizationId, req.user.userId);
    return this.quotas.quotas(organizationId);
  }
}

@Controller('webhooks/billing')
export class BillingWebhookController {
  constructor(private readonly payments: PaymentProviderService) {}

  @Post('stripe')
  stripe(@Req() req: any, @Headers('stripe-signature') signature: string) {
    const raw = typeof req.rawBody === 'string' ? req.rawBody : req.rawBody?.toString?.() || JSON.stringify(req.body || {});
    return this.payments.processStripeWebhook(raw, signature);
  }
}
