import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { Connection, Model, Types } from 'mongoose';
import { BillingPlanService, QuotaService, SubscriptionService, UsageMeterService } from '../billing/services/billing.service';
import { BillingPlan } from '../billing/schemas/billing.schema';
import { OrganizationsService } from '../organizations/organizations.service';
import { ProductsService } from '../products/products.service';
import { PERMISSIONS } from '../team/schemas/team.schema';
import { AuthorizationService } from '../team/services/team.service';
import { CompleteOnboardingDto, CreateOnboardingOrganizationDto, CreateOnboardingProductDto, TourStateDto, UpdateOnboardingDto } from './dto/launch.dto';
import { LegalAcceptance, LegalAcceptanceDocument } from './schemas/legal-acceptance.schema';
import { UserOnboardingState, UserOnboardingStateDocument } from './schemas/user-onboarding-state.schema';

export const TOUR_VERSION = 'gip-main-tour:v1';

function objectId(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new BadRequestException('invalid_id');
  return new Types.ObjectId(id);
}

function daysRemaining(date?: Date) {
  if (!date) return null;
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86400000));
}

@Injectable()
export class LegalAcceptanceService {
  constructor(
    @InjectModel(LegalAcceptance.name) private readonly legalModel: Model<LegalAcceptanceDocument>,
    private readonly config: ConfigService,
  ) {}

  versions() {
    return {
      termsVersion: this.config.get<string>('TERMS_VERSION') || '2026-09',
      privacyVersion: this.config.get<string>('PRIVACY_VERSION') || '2026-09',
      legalEntityName: this.config.get<string>('LEGAL_ENTITY_NAME') || 'Your legal entity name',
      legalContactEmail: this.config.get<string>('LEGAL_CONTACT_EMAIL') || this.config.get<string>('SUPPORT_EMAIL') || 'support@example.com',
      supportEmail: this.config.get<string>('SUPPORT_EMAIL') || 'support@example.com',
    };
  }

  async recordSignupAcceptance(input: { userId: string; termsVersion?: string; privacyVersion?: string; ip?: string; userAgent?: string }) {
    const current = this.versions();
    if (input.termsVersion && input.termsVersion !== current.termsVersion) throw new BadRequestException('terms_version_outdated');
    if (input.privacyVersion && input.privacyVersion !== current.privacyVersion) throw new BadRequestException('privacy_version_outdated');
    const now = new Date();
    const userId = objectId(input.userId);
    const ipHash = input.ip ? createHash('sha256').update(input.ip).digest('hex') : undefined;
    const userAgentSummary = input.userAgent?.slice(0, 180);
    for (const item of [
      { documentType: 'terms' as const, version: current.termsVersion },
      { documentType: 'privacy' as const, version: current.privacyVersion },
    ]) {
      await this.legalModel.updateOne(
        { userId, documentType: item.documentType, version: item.version },
        { $setOnInsert: { userId, documentType: item.documentType, version: item.version, acceptedAt: now, ipHash, userAgentSummary } },
        { upsert: true },
      ).exec();
    }
  }

  async hasAcceptedCurrentLegalTerms(userId: string) {
    const current = this.versions();
    const rows = await this.legalModel.find({ userId: objectId(userId), version: { $in: [current.termsVersion, current.privacyVersion] } }).lean().exec();
    return rows.some((row) => row.documentType === 'terms' && row.version === current.termsVersion)
      && rows.some((row) => row.documentType === 'privacy' && row.version === current.privacyVersion);
  }
}

@Injectable()
export class OnboardingService {
  constructor(
    @InjectModel(UserOnboardingState.name) private readonly onboardingModel: Model<UserOnboardingStateDocument>,
    private readonly organizations: OrganizationsService,
    private readonly products: ProductsService,
    private readonly authz: AuthorizationService,
    private readonly subscriptions: SubscriptionService,
    private readonly plans: BillingPlanService,
    private readonly usage: UsageMeterService,
    private readonly legal: LegalAcceptanceService,
  ) {}

  private async state(userId: string) {
    const userObjectId = objectId(userId);
    const existing = await this.onboardingModel.findOne({ userId: userObjectId }).exec();
    if (existing) return existing;
    return new this.onboardingModel({ userId: userObjectId, currentStep: 'welcome', completedSteps: [] }).save();
  }

  private dto(doc: UserOnboardingStateDocument, extras: Record<string, unknown> = {}) {
    return {
      userId: doc.userId.toString(),
      currentStep: doc.currentStep,
      completedSteps: doc.completedSteps,
      selectedPlanKey: doc.selectedPlanKey,
      selectedBillingInterval: doc.selectedBillingInterval || 'monthly',
      organizationId: doc.organizationId?.toString(),
      productId: doc.productId?.toString(),
      growthGoal: doc.growthGoal,
      completedAt: doc.completedAt,
      tour: {
        version: doc.tourVersion || TOUR_VERSION,
        startedAt: doc.tourStartedAt,
        completedAt: doc.tourCompletedAt,
        skippedAt: doc.tourSkippedAt,
      },
      ...extras,
    };
  }

  async get(userId: string) {
    const doc = await this.state(userId);
    const legalAccepted = await this.legal.hasAcceptedCurrentLegalTerms(userId);
    return this.dto(doc, { legalAccepted, tourVersion: TOUR_VERSION });
  }

  async patch(userId: string, dto: UpdateOnboardingDto) {
    const doc = await this.state(userId);
    if (dto.organizationId) await this.authz.assertPermission(dto.organizationId, userId, PERMISSIONS.ORGANIZATION_VIEW);
    if (dto.productId && dto.organizationId) await this.authz.assertPermission(dto.organizationId, userId, PERMISSIONS.PRODUCT_VIEW, dto.productId);
    if (dto.currentStep) doc.currentStep = dto.currentStep;
    if (dto.completedSteps) doc.completedSteps = [...new Set(dto.completedSteps)];
    if (dto.selectedPlanKey) doc.selectedPlanKey = dto.selectedPlanKey;
    if (dto.selectedBillingInterval) doc.selectedBillingInterval = dto.selectedBillingInterval;
    if (dto.organizationId) doc.organizationId = objectId(dto.organizationId);
    if (dto.productId) doc.productId = objectId(dto.productId);
    if (dto.growthGoal) doc.growthGoal = dto.growthGoal;
    await doc.save();
    return this.get(userId);
  }

  async createOrganization(userId: string, dto: CreateOnboardingOrganizationDto) {
    const org = await this.organizations.create(userId, { name: dto.name });
    const doc = await this.state(userId);
    doc.organizationId = objectId(String(org.id));
    doc.currentStep = 'product';
    doc.completedSteps = [...new Set([...doc.completedSteps, 'organization'])];
    await doc.save();
    await this.usage.record({ organizationId: String(org.id), category: 'launch', metric: 'signup.onboarding.organization_created', quantity: 1, unit: 'count', sourceType: 'onboarding', sourceEntityId: String(org.id), idempotencyKey: `launch.org_created:${org.id}` }).catch(() => null);
    return { organization: org, onboarding: await this.get(userId) };
  }

  async createProduct(userId: string, dto: CreateOnboardingProductDto) {
    await this.authz.assertPermission(dto.organizationId, userId, PERMISSIONS.PRODUCT_CREATE);
    const product = await this.products.create(dto.organizationId, userId, {
      name: dto.name,
      websiteUrl: dto.websiteUrl,
      shortDescription: dto.shortDescription,
      productType: dto.productType,
      primaryGoal: dto.primaryGoal,
      targetMarkets: dto.targetMarket ? [dto.targetMarket] : [],
    });
    const doc = await this.state(userId);
    doc.organizationId = objectId(dto.organizationId);
    doc.productId = objectId(String(product.id));
    doc.currentStep = 'plan';
    doc.completedSteps = [...new Set([...doc.completedSteps, 'product', 'product_basics', 'growth_goal'])];
    if (dto.primaryGoal) doc.growthGoal = dto.primaryGoal;
    await doc.save();
    return { product, onboarding: await this.get(userId) };
  }

  async complete(userId: string, dto: CompleteOnboardingDto) {
    await this.authz.assertPermission(dto.organizationId, userId, PERMISSIONS.PRODUCT_VIEW, dto.productId);
    if (!(await this.legal.hasAcceptedCurrentLegalTerms(userId))) throw new ForbiddenException('legal_acceptance_required');
    const sub = await this.subscriptions.current(dto.organizationId);
    const doc = await this.state(userId);
    doc.organizationId = objectId(dto.organizationId);
    doc.productId = objectId(dto.productId);
    doc.selectedPlanKey = dto.selectedPlanKey || doc.selectedPlanKey || sub.planKey;
    doc.selectedBillingInterval = dto.selectedBillingInterval || doc.selectedBillingInterval || sub.billingInterval;
    doc.currentStep = 'dashboard';
    doc.completedSteps = [...new Set([...doc.completedSteps, 'organization', 'product', 'plan', 'dashboard'])];
    doc.completedAt = doc.completedAt || new Date();
    await doc.save();
    await this.usage.record({ organizationId: dto.organizationId, productId: dto.productId, category: 'launch', metric: 'onboarding.completed', quantity: 1, unit: 'count', sourceType: 'onboarding', sourceEntityId: dto.productId, idempotencyKey: `launch.onboarding_completed:${userId}:${dto.organizationId}` }).catch(() => null);
    const refreshed = await this.subscriptions.current(dto.organizationId);
    return {
      onboarding: await this.get(userId),
      redirectTo: `/organizations/${dto.organizationId}/products/${dto.productId}`,
      subscription: this.subscriptionSummary(refreshed),
    };
  }

  async tour(userId: string, dto: TourStateDto) {
    const doc = await this.state(userId);
    doc.tourVersion = dto.tourVersion;
    const now = new Date();
    if (dto.started) doc.tourStartedAt = doc.tourStartedAt || now;
    if (dto.completed) doc.tourCompletedAt = now;
    if (dto.skipped) doc.tourSkippedAt = now;
    await doc.save();
    return this.get(userId);
  }

  subscriptionSummary(subscription: any) {
    return {
      planKey: subscription.planKey,
      status: subscription.status,
      billingInterval: subscription.billingInterval,
      trialStart: subscription.trialStart,
      trialEnd: subscription.trialEnd,
      daysRemaining: daysRemaining(subscription.trialEnd),
      active: subscription.status === 'trialing' || subscription.status === 'active',
      expired: subscription.status === 'expired' || (subscription.trialEnd && subscription.trialEnd.getTime() < Date.now()),
      planSnapshot: subscription.planSnapshot,
    };
  }
}

export type LaunchReadinessItem = {
  key: string;
  category: string;
  label: string;
  status: 'pass' | 'fail' | 'warning' | 'manual';
  details?: string;
  required: boolean;
};

@Injectable()
export class LaunchReadinessService {
  constructor(
    private readonly config: ConfigService,
    private readonly plans: BillingPlanService,
    private readonly authz: AuthorizationService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  private configured(key: string) {
    return Boolean(this.config.get<string>(key));
  }

  private item(item: LaunchReadinessItem) {
    return item;
  }

  async check(organizationId: string, userId: string) {
    await this.authz.assertPermission(organizationId, userId, PERMISSIONS.BILLING_MANAGE);
    const plans = await this.plans.listPublicPlans() as BillingPlan[];
    const paidPlans = plans.filter((plan) => (plan.prices || []).some((price) => price.amountMinor > 0));
    const frontendUrl = this.config.get<string>('FRONTEND_PUBLIC_URL') || this.config.get<string>('FRONTEND_BASE_URL');
    const backendUrl = this.config.get<string>('BACKEND_PUBLIC_URL');
    const items: LaunchReadinessItem[] = [
      this.item({ key: 'app.production_env', category: 'Application', label: 'Backend runs with NODE_ENV=production', status: process.env.NODE_ENV === 'production' ? 'pass' : 'warning', details: process.env.NODE_ENV || 'development', required: false }),
      this.item({ key: 'app.frontend_url', category: 'Application', label: 'Frontend public URL configured', status: frontendUrl ? 'pass' : 'fail', required: true }),
      this.item({ key: 'app.backend_url', category: 'Application', label: 'Backend public URL configured', status: backendUrl ? 'pass' : 'fail', required: true }),
      this.item({ key: 'db.uri', category: 'Database', label: 'MongoDB URI configured', status: this.configured('MONGODB_URI') ? 'pass' : 'fail', required: true }),
      this.item({ key: 'db.connection', category: 'Database', label: 'Database connection healthy', status: this.connection.readyState === 1 ? 'pass' : 'fail', required: true }),
      this.item({ key: 'storage.provider', category: 'Storage', label: 'Production storage provider configured', status: (this.config.get<string>('STORAGE_PROVIDER') || '').toLowerCase() === 's3' || process.env.NODE_ENV !== 'production' ? 'pass' : 'fail', required: true }),
      this.item({ key: 'security.jwt', category: 'Security', label: 'JWT secret configured', status: this.configured('JWT_SECRET') ? 'pass' : 'fail', required: true }),
      this.item({ key: 'security.cors', category: 'Security', label: 'Production CORS origins configured', status: this.configured('CORS_ORIGINS') ? 'pass' : 'fail', required: true }),
      this.item({ key: 'billing.plans', category: 'Billing', label: 'Public billing plans available', status: plans.length > 0 ? 'pass' : 'fail', details: `${plans.length} public plan(s)`, required: true }),
      this.item({ key: 'billing.provider', category: 'Billing', label: 'Payment provider configured for paid plans', status: paidPlans.length === 0 || this.configured('STRIPE_WEBHOOK_SECRET') ? 'pass' : 'warning', required: false }),
      this.item({ key: 'email.sender', category: 'Email', label: 'System email sender configured', status: this.configured('EMAIL_FROM') || this.configured('RESEND_API_KEY') ? 'pass' : 'warning', required: false }),
      this.item({ key: 'domains.https', category: 'Domains', label: 'Frontend and backend URLs use HTTPS', status: frontendUrl?.startsWith('https://') && backendUrl?.startsWith('https://') ? 'pass' : 'warning', required: false }),
      this.item({ key: 'monitoring.errors', category: 'Monitoring', label: 'Error monitoring configured', status: this.config.get<string>('ERROR_MONITORING_ENABLED') === 'true' && this.configured('SENTRY_DSN') ? 'pass' : 'warning', required: false }),
      this.item({ key: 'legal.versions', category: 'Legal', label: 'Terms and Privacy versions configured', status: this.configured('TERMS_VERSION') && this.configured('PRIVACY_VERSION') ? 'pass' : 'fail', required: true }),
      this.item({ key: 'backup.procedure', category: 'Backup', label: 'Backup and restore procedure reviewed', status: 'manual', required: true }),
      this.item({ key: 'ci.pipeline', category: 'CI/CD', label: 'Production pipeline passes', status: 'manual', required: true }),
      this.item({ key: 'product.smoke', category: 'Product', label: 'Signup, onboarding, product, billing smoke test completed', status: 'manual', required: true }),
      this.item({ key: 'support.inbox', category: 'Support', label: 'Support inbox monitored', status: 'manual', required: true }),
    ];
    return {
      summary: {
        requiredPassed: items.filter((item) => item.required && item.status === 'pass').length,
        failures: items.filter((item) => item.status === 'fail').length,
        warnings: items.filter((item) => item.status === 'warning').length,
        manual: items.filter((item) => item.status === 'manual').length,
      },
      items,
    };
  }
}
