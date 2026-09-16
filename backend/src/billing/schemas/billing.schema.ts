import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const BILLING_INTERVALS = ['monthly', 'yearly'] as const;
export const PLAN_STATUSES = ['active', 'archived'] as const;
export const PLAN_VISIBILITIES = ['public', 'private'] as const;
export const SUBSCRIPTION_STATUSES = ['trialing', 'active', 'past_due', 'unpaid', 'cancelled', 'expired', 'incomplete'] as const;
export const PAYMENT_PROVIDERS = ['internal', 'stripe', 'razorpay', 'other'] as const;
export const WEBHOOK_STATUSES = ['processing', 'processed', 'ignored', 'failed'] as const;
export const RESERVATION_STATUSES = ['reserved', 'consumed', 'released'] as const;

export const UNLIMITED = null;

export const BILLING_METRIC_ENTITLEMENTS: Record<string, string> = {
  'product.created': 'maxProducts',
  'team.member_active': 'maxOrganizationMembers',
  'content.generated': 'maxContentGenerationsPerPeriod',
  'creative.generated': 'maxCreativeGenerationsPerPeriod',
  'growth_brain.run': 'maxGrowthBrainRunsPerPeriod',
  'learning.run': 'maxLearningRunsPerPeriod',
  'email.sent': 'maxEmailsSentPerPeriod',
  'social.published': 'maxSocialPublishesPerPeriod',
  'cms.published': 'maxCmsPublishesPerPeriod',
  'lead.created': 'maxLeads',
  'crm.opportunity_created': 'maxCrmOpportunities',
  'web_analytics.event': 'maxWebAnalyticsEventsPerPeriod',
  'ai.customer_unit': 'aiTokenAllowance',
};

export const BILLING_FEATURE_ENTITLEMENTS: Record<string, string> = {
  custom_roles: 'customRolesEnabled',
  approvals: 'approvalsEnabled',
  advanced_analytics: 'advancedAnalyticsEnabled',
  attribution: 'attributionEnabled',
  autonomous_brain: 'autonomousBrainEnabled',
};

export type BillingEntitlements = {
  maxProducts?: number | null;
  maxOrganizationMembers?: number | null;
  maxContentGenerationsPerPeriod?: number | null;
  maxCreativeGenerationsPerPeriod?: number | null;
  maxGrowthBrainRunsPerPeriod?: number | null;
  maxLearningRunsPerPeriod?: number | null;
  maxEmailsSentPerPeriod?: number | null;
  maxSocialPublishesPerPeriod?: number | null;
  maxCmsPublishesPerPeriod?: number | null;
  maxLeads?: number | null;
  maxCrmOpportunities?: number | null;
  maxWebAnalyticsEventsPerPeriod?: number | null;
  aiTokenAllowance?: number | null;
  aiCostAllowanceMinor?: number | null;
  retentionDays?: number | null;
  customRolesEnabled?: boolean;
  approvalsEnabled?: boolean;
  advancedAnalyticsEnabled?: boolean;
  attributionEnabled?: boolean;
  autonomousBrainEnabled?: boolean;
};

export type BillingPrice = {
  interval: (typeof BILLING_INTERVALS)[number];
  currency: string;
  amountMinor: number;
  providerPriceId?: string;
};

export type BillingPlanSnapshot = {
  key: string;
  name: string;
  entitlements: BillingEntitlements;
  price?: BillingPrice;
};

export type BillingPlanDocument = HydratedDocument<BillingPlan>;
export type OrganizationSubscriptionDocument = HydratedDocument<OrganizationSubscription>;
export type UsageEventDocument = HydratedDocument<UsageEvent>;
export type UsageCounterDocument = HydratedDocument<UsageCounter>;
export type UsageReservationDocument = HydratedDocument<UsageReservation>;
export type AiUsageEventDocument = HydratedDocument<AiUsageEvent>;
export type BillingWebhookEventDocument = HydratedDocument<BillingWebhookEvent>;
export type SubscriptionHistoryEventDocument = HydratedDocument<SubscriptionHistoryEvent>;

@Schema({ timestamps: true })
export class BillingPlan {
  @Prop({ required: true, unique: true, maxlength: 80 })
  key: string;

  @Prop({ required: true, maxlength: 120 })
  name: string;

  @Prop({ maxlength: 500 })
  description?: string;

  @Prop({ type: String, enum: PLAN_STATUSES, default: 'active', index: true })
  status: (typeof PLAN_STATUSES)[number];

  @Prop({ type: String, enum: PLAN_VISIBILITIES, default: 'public', index: true })
  visibility: (typeof PLAN_VISIBILITIES)[number];

  @Prop({ type: [String], enum: BILLING_INTERVALS, default: ['monthly'] })
  billingIntervalOptions: (typeof BILLING_INTERVALS)[number][];

  @Prop({ type: [{ interval: String, currency: String, amountMinor: Number, providerPriceId: String }], default: [] })
  prices: BillingPrice[];

  @Prop({ type: Object, default: {} })
  entitlements: BillingEntitlements;

  @Prop({ type: Object, default: {} })
  metadata?: Record<string, unknown>;

  @Prop({ type: Number, default: 0 })
  sortOrder: number;
}
export const BillingPlanSchema = SchemaFactory.createForClass(BillingPlan);
BillingPlanSchema.index({ visibility: 1, status: 1, sortOrder: 1 });

@Schema({ timestamps: true })
export class OrganizationSubscription {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  organizationId: Types.ObjectId;

  @Prop({ required: true })
  planKey: string;

  @Prop({ type: String, enum: SUBSCRIPTION_STATUSES, required: true, index: true })
  status: (typeof SUBSCRIPTION_STATUSES)[number];

  @Prop({ type: String, enum: BILLING_INTERVALS, required: true })
  billingInterval: (typeof BILLING_INTERVALS)[number];

  @Prop()
  currency?: string;

  @Prop()
  priceAmountMinor?: number;

  @Prop({ required: true })
  periodStart: Date;

  @Prop({ required: true })
  periodEnd: Date;

  @Prop()
  trialStart?: Date;

  @Prop()
  trialEnd?: Date;

  @Prop({ default: false })
  cancelAtPeriodEnd: boolean;

  @Prop()
  cancelledAt?: Date;

  @Prop({ type: String, enum: PAYMENT_PROVIDERS, required: true, default: 'internal' })
  provider: (typeof PAYMENT_PROVIDERS)[number];

  @Prop()
  providerCustomerId?: string;

  @Prop()
  providerSubscriptionId?: string;

  @Prop()
  providerPriceId?: string;

  @Prop({ type: Object, required: true })
  planSnapshot: BillingPlanSnapshot;

  @Prop({ default: true, index: true })
  isCurrent: boolean;
}
export const OrganizationSubscriptionSchema = SchemaFactory.createForClass(OrganizationSubscription);
OrganizationSubscriptionSchema.index({ organizationId: 1, isCurrent: 1 }, { unique: true, partialFilterExpression: { isCurrent: true } });
OrganizationSubscriptionSchema.index({ providerCustomerId: 1 });
OrganizationSubscriptionSchema.index({ providerSubscriptionId: 1 });

@Schema({ timestamps: true })
export class UsageEvent {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  productId?: Types.ObjectId;

  @Prop({ required: true, index: true })
  category: string;

  @Prop({ required: true, index: true })
  metric: string;

  @Prop({ required: true, min: 0 })
  quantity: number;

  @Prop({ required: true })
  unit: string;

  @Prop({ required: true })
  sourceType: string;

  @Prop()
  sourceEntityId?: string;

  @Prop({ required: true })
  idempotencyKey: string;

  @Prop({ required: true, index: true })
  occurredAt: Date;

  @Prop({ type: Object, default: {} })
  metadata?: Record<string, unknown>;
}
export const UsageEventSchema = SchemaFactory.createForClass(UsageEvent);
UsageEventSchema.index({ organizationId: 1, occurredAt: 1, metric: 1 });
UsageEventSchema.index({ organizationId: 1, productId: 1, occurredAt: 1 });
UsageEventSchema.index({ organizationId: 1, idempotencyKey: 1 }, { unique: true });

@Schema({ timestamps: true })
export class UsageCounter {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  productId?: Types.ObjectId;

  @Prop({ required: true })
  metric: string;

  @Prop({ required: true })
  periodStart: Date;

  @Prop({ required: true })
  periodEnd: Date;

  @Prop({ required: true, default: 0 })
  quantity: number;
}
export const UsageCounterSchema = SchemaFactory.createForClass(UsageCounter);
UsageCounterSchema.index({ organizationId: 1, metric: 1, periodStart: 1, productId: 1 });

@Schema({ timestamps: true })
export class UsageReservation {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ required: true })
  metric: string;

  @Prop({ required: true })
  quantity: number;

  @Prop({ type: String, enum: RESERVATION_STATUSES, default: 'reserved' })
  status: (typeof RESERVATION_STATUSES)[number];

  @Prop({ required: true, unique: true })
  idempotencyKey: string;

  @Prop({ required: true })
  expiresAt: Date;
}
export const UsageReservationSchema = SchemaFactory.createForClass(UsageReservation);
UsageReservationSchema.index({ organizationId: 1, metric: 1, status: 1 });
UsageReservationSchema.index({ expiresAt: 1 });

@Schema({ timestamps: true })
export class AiUsageEvent {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  productId?: Types.ObjectId;

  @Prop({ required: true, index: true })
  feature: string;

  @Prop({ required: true })
  action: string;

  @Prop({ required: true })
  provider: string;

  @Prop({ required: true })
  model: string;

  @Prop()
  inputTokens?: number;

  @Prop()
  outputTokens?: number;

  @Prop()
  totalTokens?: number;

  @Prop()
  providerCostMinor?: number;

  @Prop()
  providerCostCurrency?: string;

  @Prop()
  customerUsageUnits?: number;

  @Prop({ required: true })
  sourceType: string;

  @Prop()
  sourceEntityId?: string;

  @Prop({ required: true, unique: true })
  idempotencyKey: string;

  @Prop({ required: true, index: true })
  occurredAt: Date;
}
export const AiUsageEventSchema = SchemaFactory.createForClass(AiUsageEvent);
AiUsageEventSchema.index({ organizationId: 1, occurredAt: 1 });
AiUsageEventSchema.index({ organizationId: 1, productId: 1, feature: 1, occurredAt: 1 });

@Schema({ timestamps: true })
export class BillingWebhookEvent {
  @Prop({ required: true })
  provider: string;

  @Prop({ required: true })
  providerEventId: string;

  @Prop({ required: true })
  eventType: string;

  @Prop({ type: String, enum: WEBHOOK_STATUSES, default: 'processing' })
  status: (typeof WEBHOOK_STATUSES)[number];

  @Prop({ required: true })
  receivedAt: Date;

  @Prop()
  processedAt?: Date;

  @Prop()
  errorCode?: string;
}
export const BillingWebhookEventSchema = SchemaFactory.createForClass(BillingWebhookEvent);
BillingWebhookEventSchema.index({ provider: 1, providerEventId: 1 }, { unique: true });

@Schema({ timestamps: true })
export class SubscriptionHistoryEvent {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop()
  subscriptionId?: string;

  @Prop({ required: true })
  eventType: string;

  @Prop()
  actorUserId?: string;

  @Prop({ required: true, default: 'user' })
  actorType: 'user' | 'provider' | 'system';

  @Prop({ type: Object, default: {} })
  metadata?: Record<string, unknown>;
}
export const SubscriptionHistoryEventSchema = SchemaFactory.createForClass(SubscriptionHistoryEvent);
SubscriptionHistoryEventSchema.index({ organizationId: 1, createdAt: -1 });
