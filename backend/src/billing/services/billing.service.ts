import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHmac, timingSafeEqual } from 'crypto';
import { Model, Types } from 'mongoose';
import { Organization, OrganizationDocument } from '../../organizations/schemas/organization.schema';
import { Product, ProductDocument } from '../../products/schemas/product.schema';
import { AuditLogService } from '../../audit/services/audit-log.service';
import {
  AiUsageEvent,
  AiUsageEventDocument,
  BILLING_FEATURE_ENTITLEMENTS,
  BILLING_METRIC_ENTITLEMENTS,
  BillingEntitlements,
  BillingPlan,
  BillingPlanDocument,
  BillingPlanSnapshot,
  BillingPrice,
  BillingWebhookEvent,
  BillingWebhookEventDocument,
  OrganizationSubscription,
  OrganizationSubscriptionDocument,
  SubscriptionHistoryEvent,
  SubscriptionHistoryEventDocument,
  UsageCounter,
  UsageCounterDocument,
  UsageEvent,
  UsageEventDocument,
  UsageReservation,
  UsageReservationDocument,
} from '../schemas/billing.schema';

const DAY = 86400000;
const DEFAULT_CURRENCY = 'USD';

const SYSTEM_PLANS: Array<Partial<BillingPlan> & { key: string; name: string; entitlements: BillingEntitlements; prices: BillingPrice[] }> = [
  {
    key: 'free',
    name: 'Free',
    description: 'Starter access for early validation.',
    status: 'active',
    visibility: 'public',
    billingIntervalOptions: ['monthly'],
    prices: [{ interval: 'monthly', currency: 'USD', amountMinor: 0 }],
    sortOrder: 0,
    entitlements: {
      maxProducts: 1,
      maxOrganizationMembers: 2,
      maxContentGenerationsPerPeriod: 10,
      maxCreativeGenerationsPerPeriod: 2,
      maxGrowthBrainRunsPerPeriod: 1,
      maxLearningRunsPerPeriod: 1,
      maxEmailsSentPerPeriod: 50,
      maxSocialPublishesPerPeriod: 10,
      maxCmsPublishesPerPeriod: 4,
      maxLeads: 100,
      maxCrmOpportunities: 25,
      maxWebAnalyticsEventsPerPeriod: 1000,
      aiTokenAllowance: 50000,
      aiCostAllowanceMinor: 500,
      retentionDays: 30,
      customRolesEnabled: false,
      approvalsEnabled: true,
      advancedAnalyticsEnabled: false,
      attributionEnabled: false,
      autonomousBrainEnabled: false,
    },
  },
  {
    key: 'starter',
    name: 'Starter',
    description: 'Core growth execution for small teams.',
    status: 'active',
    visibility: 'public',
    billingIntervalOptions: ['monthly', 'yearly'],
    prices: [
      { interval: 'monthly', currency: 'USD', amountMinor: 2900, providerPriceId: 'price_mock_starter_monthly_usd' },
      { interval: 'yearly', currency: 'USD', amountMinor: 29000, providerPriceId: 'price_mock_starter_yearly_usd' },
    ],
    sortOrder: 10,
    entitlements: {
      maxProducts: 3,
      maxOrganizationMembers: 5,
      maxContentGenerationsPerPeriod: 100,
      maxCreativeGenerationsPerPeriod: 20,
      maxGrowthBrainRunsPerPeriod: 8,
      maxLearningRunsPerPeriod: 8,
      maxEmailsSentPerPeriod: 2500,
      maxSocialPublishesPerPeriod: 100,
      maxCmsPublishesPerPeriod: 50,
      maxLeads: 2500,
      maxCrmOpportunities: 500,
      maxWebAnalyticsEventsPerPeriod: 100000,
      aiTokenAllowance: 500000,
      aiCostAllowanceMinor: 5000,
      retentionDays: 90,
      customRolesEnabled: false,
      approvalsEnabled: true,
      advancedAnalyticsEnabled: false,
      attributionEnabled: true,
      autonomousBrainEnabled: false,
    },
  },
  {
    key: 'growth',
    name: 'Growth',
    description: 'Higher-volume AI, publishing, and analytics.',
    status: 'active',
    visibility: 'public',
    billingIntervalOptions: ['monthly', 'yearly'],
    prices: [
      { interval: 'monthly', currency: 'USD', amountMinor: 7900, providerPriceId: 'price_mock_growth_monthly_usd' },
      { interval: 'yearly', currency: 'USD', amountMinor: 79000, providerPriceId: 'price_mock_growth_yearly_usd' },
    ],
    sortOrder: 20,
    entitlements: {
      maxProducts: 10,
      maxOrganizationMembers: 15,
      maxContentGenerationsPerPeriod: 500,
      maxCreativeGenerationsPerPeriod: 100,
      maxGrowthBrainRunsPerPeriod: 30,
      maxLearningRunsPerPeriod: 30,
      maxEmailsSentPerPeriod: 25000,
      maxSocialPublishesPerPeriod: 500,
      maxCmsPublishesPerPeriod: 250,
      maxLeads: 25000,
      maxCrmOpportunities: 5000,
      maxWebAnalyticsEventsPerPeriod: 1000000,
      aiTokenAllowance: 3000000,
      aiCostAllowanceMinor: 30000,
      retentionDays: 365,
      customRolesEnabled: true,
      approvalsEnabled: true,
      advancedAnalyticsEnabled: true,
      attributionEnabled: true,
      autonomousBrainEnabled: true,
    },
  },
  {
    key: 'pro',
    name: 'Pro',
    description: 'Scale plan with effectively unlimited core quotas.',
    status: 'active',
    visibility: 'public',
    billingIntervalOptions: ['monthly', 'yearly'],
    prices: [
      { interval: 'monthly', currency: 'USD', amountMinor: 19900, providerPriceId: 'price_mock_pro_monthly_usd' },
      { interval: 'yearly', currency: 'USD', amountMinor: 199000, providerPriceId: 'price_mock_pro_yearly_usd' },
    ],
    sortOrder: 30,
    entitlements: {
      maxProducts: null,
      maxOrganizationMembers: null,
      maxContentGenerationsPerPeriod: null,
      maxCreativeGenerationsPerPeriod: null,
      maxGrowthBrainRunsPerPeriod: null,
      maxLearningRunsPerPeriod: null,
      maxEmailsSentPerPeriod: null,
      maxSocialPublishesPerPeriod: null,
      maxCmsPublishesPerPeriod: null,
      maxLeads: null,
      maxCrmOpportunities: null,
      maxWebAnalyticsEventsPerPeriod: null,
      aiTokenAllowance: null,
      aiCostAllowanceMinor: null,
      retentionDays: null,
      customRolesEnabled: true,
      approvalsEnabled: true,
      advancedAnalyticsEnabled: true,
      attributionEnabled: true,
      autonomousBrainEnabled: true,
    },
  },
];

function monthWindow(date = new Date()) {
  return { periodStart: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)), periodEnd: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)) };
}

function objectId(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new NotFoundException('resource_not_found');
  return new Types.ObjectId(id);
}

@Injectable()
export class BillingPlanService {
  constructor(@InjectModel(BillingPlan.name) private readonly planModel: Model<BillingPlanDocument>) {}

  async seedSystemPlans() {
    for (const plan of SYSTEM_PLANS) {
      await this.planModel.updateOne({ key: plan.key }, { $setOnInsert: plan }, { upsert: true }).exec();
    }
  }

  async listPublicPlans() {
    await this.seedSystemPlans();
    return this.planModel.find({ visibility: 'public' }).sort({ sortOrder: 1 }).lean().exec();
  }

  async getPlan(planKey: string) {
    await this.seedSystemPlans();
    const plan = await this.planModel.findOne({ key: planKey }).lean().exec();
    if (!plan) throw new NotFoundException('billing_plan_not_found');
    return plan;
  }

  async activePlanForCheckout(planKey: string) {
    const plan = await this.getPlan(planKey);
    if (plan.status === 'archived') throw new ConflictException('billing_plan_archived');
    return plan;
  }

  snapshot(plan: BillingPlan, interval: 'monthly' | 'yearly', currency?: string): BillingPlanSnapshot {
    const price = this.priceFor(plan, interval, currency);
    return { key: plan.key, name: plan.name, entitlements: plan.entitlements || {}, price };
  }

  priceFor(plan: BillingPlan, interval: 'monthly' | 'yearly', currency?: string) {
    const resolvedCurrency = currency || DEFAULT_CURRENCY;
    const price = (plan.prices || []).find((item) => item.interval === interval && item.currency === resolvedCurrency) || (plan.prices || []).find((item) => item.interval === interval);
    if (!price) throw new BadRequestException('billing_price_not_configured');
    if (!Number.isInteger(price.amountMinor)) throw new BadRequestException('billing_price_invalid');
    return price;
  }
}

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectModel(OrganizationSubscription.name) private readonly subscriptionModel: Model<OrganizationSubscriptionDocument>,
    @InjectModel(SubscriptionHistoryEvent.name) private readonly historyModel: Model<SubscriptionHistoryEventDocument>,
    @InjectModel(Organization.name) private readonly orgModel: Model<OrganizationDocument>,
    private readonly plans: BillingPlanService,
    private readonly config: ConfigService,
    private readonly auditLogs: AuditLogService,
  ) {}

  async ensureFreeSubscription(organizationId: string, actorUserId?: string) {
    const existing = await this.subscriptionModel.findOne({ organizationId: objectId(organizationId), isCurrent: true }).exec();
    if (existing) return existing;
    const plan = await this.plans.getPlan('free');
    const now = new Date();
    const trialDays = Number(this.config.get<string>('BILLING_TRIAL_DAYS') || 0);
    const window = monthWindow(now);
    const sub = await new this.subscriptionModel({
      organizationId: objectId(organizationId),
      planKey: 'free',
      status: trialDays > 0 ? 'trialing' : 'active',
      billingInterval: 'monthly',
      currency: 'USD',
      priceAmountMinor: 0,
      periodStart: window.periodStart,
      periodEnd: window.periodEnd,
      trialStart: trialDays > 0 ? now : undefined,
      trialEnd: trialDays > 0 ? new Date(now.getTime() + trialDays * DAY) : undefined,
      cancelAtPeriodEnd: false,
      provider: 'internal',
      planSnapshot: this.plans.snapshot(plan as BillingPlan, 'monthly', 'USD'),
      isCurrent: true,
    }).save();
    await this.audit(organizationId, 'subscription_started', actorUserId, 'system', { planKey: 'free' });
    return sub;
  }

  async current(organizationId: string) {
    const org = await this.orgModel.findById(objectId(organizationId)).lean().exec();
    if (!org) throw new NotFoundException('organization_not_found');
    return this.ensureFreeSubscription(organizationId);
  }

  async entitlements(organizationId: string) {
    const subscription = await this.current(organizationId);
    return subscription.planSnapshot.entitlements || {};
  }

  async changeInternal(organizationId: string, planKey: string, interval: 'monthly' | 'yearly', actorUserId: string, currency?: string) {
    const plan = await this.plans.activePlanForCheckout(planKey);
    const price = this.plans.priceFor(plan as BillingPlan, interval, currency);
    await this.subscriptionModel.updateMany({ organizationId: objectId(organizationId), isCurrent: true }, { $set: { isCurrent: false } }).exec();
    const now = new Date();
    const periodStart = now;
    const periodEnd = new Date(now.getTime() + (interval === 'yearly' ? 365 : 31) * DAY);
    const sub = await new this.subscriptionModel({
      organizationId: objectId(organizationId),
      planKey,
      status: price.amountMinor === 0 ? 'active' : 'incomplete',
      billingInterval: interval,
      currency: price.currency,
      priceAmountMinor: price.amountMinor,
      periodStart,
      periodEnd,
      cancelAtPeriodEnd: false,
      provider: price.amountMinor === 0 ? 'internal' : 'stripe',
      providerPriceId: price.providerPriceId,
      planSnapshot: this.plans.snapshot(plan as BillingPlan, interval, price.currency),
      isCurrent: true,
    }).save();
    await this.audit(organizationId, 'plan_changed', actorUserId, 'user', { planKey, interval });
    await this.auditLogs.record({ organizationId, actorType: 'user', actorUserId, action: 'billing.plan_changed', resourceType: 'subscription', resourceId: sub._id.toString(), result: 'success', afterSummary: { planKey, interval, status: sub.status } });
    return sub;
  }

  async cancel(organizationId: string, actorUserId: string) {
    const sub = await this.current(organizationId);
    sub.cancelAtPeriodEnd = true;
    sub.cancelledAt = new Date();
    await sub.save();
    await this.audit(organizationId, 'cancel_requested', actorUserId, 'user', { periodEnd: sub.periodEnd });
    await this.auditLogs.record({ organizationId, actorType: 'user', actorUserId, action: 'billing.cancel_requested', resourceType: 'subscription', resourceId: sub._id.toString(), result: 'success', afterSummary: { cancelAtPeriodEnd: true, periodEnd: sub.periodEnd } });
    return sub;
  }

  async reactivate(organizationId: string, actorUserId: string) {
    const sub = await this.current(organizationId);
    sub.cancelAtPeriodEnd = false;
    sub.cancelledAt = undefined;
    await sub.save();
    await this.audit(organizationId, 'reactivated', actorUserId, 'user', {});
    await this.auditLogs.record({ organizationId, actorType: 'user', actorUserId, action: 'billing.reactivated', resourceType: 'subscription', resourceId: sub._id.toString(), result: 'success', afterSummary: { cancelAtPeriodEnd: false } });
    return sub;
  }

  async syncFromProvider(input: { organizationId: string; planKey: string; interval: 'monthly' | 'yearly'; status: any; providerCustomerId?: string; providerSubscriptionId?: string; providerPriceId?: string; periodStart?: Date; periodEnd?: Date; currency?: string; priceAmountMinor?: number }) {
    const sub = await this.changeInternal(input.organizationId, input.planKey, input.interval, 'provider', input.currency);
    sub.status = input.status;
    sub.provider = 'stripe';
    sub.providerCustomerId = input.providerCustomerId;
    sub.providerSubscriptionId = input.providerSubscriptionId;
    sub.providerPriceId = input.providerPriceId;
    if (input.periodStart) sub.periodStart = input.periodStart;
    if (input.periodEnd) sub.periodEnd = input.periodEnd;
    if (input.priceAmountMinor !== undefined) sub.priceAmountMinor = input.priceAmountMinor;
    await sub.save();
    await this.audit(input.organizationId, 'subscription_synced', undefined, 'provider', { status: input.status });
    await this.auditLogs.record({ organizationId: input.organizationId, actorType: 'provider', action: 'billing.subscription_synced', resourceType: 'subscription', resourceId: sub._id.toString(), result: 'success', afterSummary: { status: input.status, planKey: input.planKey } });
    return sub;
  }

  async audit(organizationId: string, eventType: string, actorUserId?: string, actorType: 'user' | 'provider' | 'system' = 'user', metadata: Record<string, unknown> = {}) {
    await this.historyModel.create({ organizationId: objectId(organizationId), eventType, actorUserId, actorType, metadata });
  }
}

@Injectable()
export class UsageMeterService {
  constructor(
    @InjectModel(UsageEvent.name) private readonly eventModel: Model<UsageEventDocument>,
    @InjectModel(UsageCounter.name) private readonly counterModel: Model<UsageCounterDocument>,
    private readonly subscriptions: SubscriptionService,
  ) {}

  async record(input: { organizationId: string; productId?: string; category: string; metric: string; quantity?: number; unit?: string; sourceType: string; sourceEntityId?: string; idempotencyKey: string; occurredAt?: Date; metadata?: Record<string, unknown> }) {
    const occurredAt = input.occurredAt || new Date();
    const sub = await this.subscriptions.current(input.organizationId);
    const quantity = input.quantity ?? 1;
    try {
      await this.eventModel.create({
        organizationId: objectId(input.organizationId),
        productId: input.productId ? objectId(input.productId) : undefined,
        category: input.category,
        metric: input.metric,
        quantity,
        unit: input.unit || 'count',
        sourceType: input.sourceType,
        sourceEntityId: input.sourceEntityId,
        idempotencyKey: input.idempotencyKey,
        occurredAt,
        metadata: input.metadata || {},
      });
    } catch (err: any) {
      if (err?.code === 11000) return { duplicate: true };
      throw err;
    }
    await this.counterModel.updateOne(
      { organizationId: objectId(input.organizationId), productId: input.productId ? objectId(input.productId) : undefined, metric: input.metric, periodStart: sub.periodStart, periodEnd: sub.periodEnd },
      { $inc: { quantity }, $set: { periodStart: sub.periodStart, periodEnd: sub.periodEnd } },
      { upsert: true },
    ).exec();
    return { duplicate: false };
  }

  async used(organizationId: string, metric: string) {
    const sub = await this.subscriptions.current(organizationId);
    const counter = await this.counterModel.findOne({ organizationId: objectId(organizationId), metric, periodStart: sub.periodStart, periodEnd: sub.periodEnd }).lean().exec();
    return counter?.quantity || 0;
  }

  async summaries(organizationId: string, productId?: string) {
    const sub = await this.subscriptions.current(organizationId);
    const entitlements = sub.planSnapshot.entitlements || {};
    const counters = await this.counterModel.find({ organizationId: objectId(organizationId), ...(productId ? { productId: objectId(productId) } : {}), periodStart: sub.periodStart, periodEnd: sub.periodEnd }).lean().exec();
    const usedByMetric = new Map(counters.map((counter) => [counter.metric, counter.quantity]));
    return Object.entries(BILLING_METRIC_ENTITLEMENTS).map(([metric, entitlementKey]) => {
      const used = usedByMetric.get(metric) || 0;
      const limit = (entitlements as any)[entitlementKey] ?? null;
      const remaining = limit === null ? null : Math.max(0, Number(limit) - used);
      const percentage = limit === null || Number(limit) === 0 ? null : Math.min(100, Math.round((used / Number(limit)) * 100));
      return { metric, label: metric.replace(/[._]/g, ' '), used, limit, remaining, percentage, warningLevel: percentage === null ? 'none' : percentage >= 100 ? 'exceeded' : percentage >= 80 ? 'warning' : 'none', periodStart: sub.periodStart, periodEnd: sub.periodEnd };
    });
  }

  async productBreakdown(organizationId: string, metric?: string) {
    const sub = await this.subscriptions.current(organizationId);
    const rows = await this.counterModel.find({ organizationId: objectId(organizationId), ...(metric ? { metric } : {}), productId: { $exists: true }, periodStart: sub.periodStart, periodEnd: sub.periodEnd }).lean().exec();
    return rows.map((row) => ({ productId: row.productId?.toString(), metric: row.metric, used: row.quantity }));
  }
}

@Injectable()
export class QuotaService {
  constructor(
    @InjectModel(UsageReservation.name) private readonly reservationModel: Model<UsageReservationDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    private readonly subscriptions: SubscriptionService,
    private readonly usage: UsageMeterService,
  ) {}

  async status(organizationId: string, metric: string) {
    const sub = await this.subscriptions.current(organizationId);
    const key = BILLING_METRIC_ENTITLEMENTS[metric];
    const limit = key ? (sub.planSnapshot.entitlements as any)[key] ?? null : null;
    const used = await this.usage.used(organizationId, metric);
    const remaining = limit === null ? null : Math.max(0, Number(limit) - used);
    const percentage = limit === null || Number(limit) === 0 ? null : Math.min(100, Math.round((used / Number(limit)) * 100));
    return { metric, used, limit, remaining, percentage, periodEnd: sub.periodEnd, warningLevel: percentage === null ? 'none' : percentage >= 100 ? 'exceeded' : percentage >= 80 ? 'warning' : 'none' };
  }

  async assertCanConsume(input: { organizationId: string; metric: string; quantity?: number; idempotencyKey?: string }) {
    const quantity = input.quantity ?? 1;
    const status = await this.status(input.organizationId, input.metric);
    if (status.limit !== null && status.used + quantity > Number(status.limit)) {
      throw new ForbiddenException({ errorCode: 'billing_quota_exceeded', metric: input.metric, limit: status.limit, used: status.used, remaining: status.remaining, periodEnd: status.periodEnd });
    }
    if (input.idempotencyKey) {
      try {
        await this.reservationModel.create({ organizationId: objectId(input.organizationId), metric: input.metric, quantity, status: 'reserved', idempotencyKey: input.idempotencyKey, expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
      } catch (err: any) {
        if (err?.code !== 11000) throw err;
      }
    }
    return status;
  }

  async consumeReservation(idempotencyKey: string) {
    await this.reservationModel.updateOne({ idempotencyKey, status: 'reserved' }, { $set: { status: 'consumed' } }).exec();
  }

  async releaseReservation(idempotencyKey: string) {
    await this.reservationModel.updateOne({ idempotencyKey, status: 'reserved' }, { $set: { status: 'released' } }).exec();
  }

  async assertFeatureEnabled(organizationId: string, feature: string) {
    const sub = await this.subscriptions.current(organizationId);
    const key = BILLING_FEATURE_ENTITLEMENTS[feature];
    if (!key) return;
    if ((sub.planSnapshot.entitlements as any)[key] !== true) throw new ForbiddenException({ errorCode: 'billing_feature_not_available', feature, currentPlan: sub.planKey });
  }

  async assertProductLimit(organizationId: string) {
    const sub = await this.subscriptions.current(organizationId);
    const limit = sub.planSnapshot.entitlements.maxProducts;
    if (limit === null || limit === undefined) return;
    const count = await this.productModel.countDocuments({ organizationId: objectId(organizationId) }).exec();
    if (count >= limit) throw new ForbiddenException({ errorCode: 'billing_quota_exceeded', metric: 'product.created', limit, used: count, remaining: 0, periodEnd: sub.periodEnd });
  }

  async quotas(organizationId: string) {
    return Promise.all(Object.keys(BILLING_METRIC_ENTITLEMENTS).map((metric) => this.status(organizationId, metric)));
  }
}

@Injectable()
export class AiUsageService {
  constructor(
    @InjectModel(AiUsageEvent.name) private readonly aiModel: Model<AiUsageEventDocument>,
    private readonly usage: UsageMeterService,
  ) {}

  async record(input: { organizationId: string; productId?: string; feature: string; action: string; provider: string; model: string; inputTokens?: number; outputTokens?: number; totalTokens?: number; providerCostMinor?: number; providerCostCurrency?: string; customerUsageUnits?: number; sourceType: string; sourceEntityId?: string; idempotencyKey: string }) {
    try {
      await this.aiModel.create({
        organizationId: objectId(input.organizationId),
        productId: input.productId ? objectId(input.productId) : undefined,
        feature: input.feature,
        action: input.action,
        provider: input.provider,
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        totalTokens: input.totalTokens,
        providerCostMinor: input.providerCostMinor,
        providerCostCurrency: input.providerCostCurrency,
        customerUsageUnits: input.customerUsageUnits,
        sourceType: input.sourceType,
        sourceEntityId: input.sourceEntityId,
        idempotencyKey: input.idempotencyKey,
        occurredAt: new Date(),
      } as any);
    } catch (err: any) {
      if (err?.code === 11000) return { duplicate: true };
      throw err;
    }
    if (input.customerUsageUnits) {
      await this.usage.record({ organizationId: input.organizationId, productId: input.productId, category: 'ai', metric: 'ai.customer_unit', quantity: input.customerUsageUnits, unit: 'unit', sourceType: input.sourceType, sourceEntityId: input.sourceEntityId, idempotencyKey: `usage:${input.idempotencyKey}` });
    }
    return { duplicate: false };
  }

  async summary(organizationId: string) {
    const rows = await this.aiModel.aggregate([
      { $match: { organizationId: objectId(organizationId) } },
      { $group: { _id: { feature: '$feature', provider: '$provider', model: '$model', productId: '$productId' }, calls: { $sum: 1 }, tokens: { $sum: { $ifNull: ['$totalTokens', 0] } }, customerUsageUnits: { $sum: { $ifNull: ['$customerUsageUnits', 0] } } } },
      { $sort: { calls: -1 } },
    ]).exec();
    return rows.map((row) => ({ feature: row._id.feature, provider: row._id.provider, model: row._id.model, productId: row._id.productId?.toString(), calls: row.calls, tokens: row.tokens, customerUsageUnits: row.customerUsageUnits }));
  }
}

@Injectable()
export class PaymentProviderService {
  constructor(
    private readonly plans: BillingPlanService,
    private readonly subscriptions: SubscriptionService,
    private readonly config: ConfigService,
    @InjectModel(BillingWebhookEvent.name) private readonly webhookModel: Model<BillingWebhookEventDocument>,
    private readonly auditLogs: AuditLogService,
  ) {}

  async createCheckoutSession(organizationId: string, userId: string, planKey: string, interval: 'monthly' | 'yearly', currency?: string) {
    const plan = await this.plans.activePlanForCheckout(planKey);
    const price = this.plans.priceFor(plan as BillingPlan, interval, currency);
    if (!price.providerPriceId && price.amountMinor > 0) throw new BadRequestException('billing_price_not_configured');
    await this.subscriptions.audit(organizationId, 'checkout_created', userId, 'user', { planKey, interval });
    await this.auditLogs.record({ organizationId, actorType: 'user', actorUserId: userId, action: 'billing.checkout_created', resourceType: 'checkout', result: 'success', afterSummary: { planKey, interval, amountMinor: price.amountMinor } });
    if (price.amountMinor === 0) {
      const sub = await this.subscriptions.changeInternal(organizationId, planKey, interval, userId, price.currency);
      return { provider: 'internal', checkoutUrl: `/organizations/${organizationId}/billing?checkout=free`, subscription: sub };
    }
    const frontendBase = this.config.get<string>('FRONTEND_BASE_URL') || '';
    return {
      provider: 'stripe',
      checkoutUrl: `${frontendBase}/billing/checkout/success?organizationId=${organizationId}&session_id=mock_${Date.now()}`,
      providerPriceId: price.providerPriceId,
      message: 'mock_checkout_created_server_side',
    };
  }

  async portal(organizationId: string) {
    const frontendBase = this.config.get<string>('FRONTEND_BASE_URL') || '';
    return { provider: 'stripe', portalUrl: `${frontendBase}/organizations/${organizationId}/billing?portal=mock` };
  }

  verifyWebhook(rawBody: string, signature: string) {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET') || 'mock_webhook_secret';
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature || '');
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ForbiddenException('billing_webhook_invalid');
  }

  async processStripeWebhook(rawBody: string, signature: string) {
    this.verifyWebhook(rawBody, signature);
    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      throw new BadRequestException('billing_webhook_invalid');
    }
    let webhook;
    try {
      webhook = await this.webhookModel.create({ provider: 'stripe', providerEventId: event.id, eventType: event.type, status: 'processing', receivedAt: new Date() });
    } catch (err: any) {
      if (err?.code === 11000) return { status: 'ignored', duplicate: true };
      throw err;
    }
    try {
      const obj = event.data?.object || {};
      const organizationId = obj.metadata?.organizationId || obj.organizationId;
      if (!organizationId) {
        webhook.status = 'ignored';
      } else if (['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated'].includes(event.type)) {
        await this.subscriptions.syncFromProvider({ organizationId, planKey: obj.metadata?.planKey || obj.planKey || 'starter', interval: obj.metadata?.billingInterval || obj.billingInterval || 'monthly', status: obj.status || 'active', providerCustomerId: obj.customer || obj.providerCustomerId, providerSubscriptionId: obj.subscription || obj.id, providerPriceId: obj.priceId, currency: obj.currency || 'USD', priceAmountMinor: obj.amountMinor, periodStart: obj.current_period_start ? new Date(obj.current_period_start * 1000) : undefined, periodEnd: obj.current_period_end ? new Date(obj.current_period_end * 1000) : undefined });
        webhook.status = 'processed';
      } else if (event.type === 'customer.subscription.deleted') {
        await this.subscriptions.syncFromProvider({ organizationId, planKey: 'free', interval: 'monthly', status: 'cancelled', providerSubscriptionId: obj.id, currency: 'USD', priceAmountMinor: 0 });
        webhook.status = 'processed';
      } else if (event.type === 'invoice.payment_failed') {
        await this.subscriptions.syncFromProvider({ organizationId, planKey: obj.metadata?.planKey || 'starter', interval: obj.metadata?.billingInterval || 'monthly', status: 'past_due', providerCustomerId: obj.customer, providerSubscriptionId: obj.subscription, currency: obj.currency || 'USD', priceAmountMinor: obj.amount_due });
        webhook.status = 'processed';
      } else {
        webhook.status = 'ignored';
      }
      webhook.processedAt = new Date();
      await webhook.save();
      return { status: webhook.status };
    } catch (err) {
      webhook.status = 'failed';
      webhook.errorCode = 'billing_webhook_processing_failed';
      await webhook.save();
      throw err;
    }
  }
}
