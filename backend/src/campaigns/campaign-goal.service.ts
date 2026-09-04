import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { GrowthStrategyReviewService } from '../growth-strategy/growth-strategy-review.service';
import { GrowthStrategyService } from '../growth-strategy/growth-strategy.service';
import type { AcquisitionStrategyResult } from '../growth-strategy/types/acquisition-strategy.types';
import type { ConversionStrategyResult } from '../growth-strategy/types/conversion-strategy.types';
import type { FunnelStage, FunnelStrategyResult } from '../growth-strategy/types/funnel-strategy.types';
import type { GrowthObjective, GrowthObjectiveResult, GrowthObjectiveType } from '../growth-strategy/types/growth-objective.types';
import { ProductsService } from '../products/products.service';
import { toCampaignResponse } from './campaigns.mapper';
import { CampaignsService } from './campaigns.service';
import { SetCampaignGoalDto } from './dto/set-campaign-goal.dto';
import { Campaign, CampaignDocument } from './schemas/campaign.schema';
import type { CampaignGoal, CampaignGoalType } from './types/campaign-goal.types';
import type { CampaignResponse, CampaignType } from './types/campaign.types';

const MAX_SUCCESS_SIGNALS = 20;

// Only campaign types with a non-empty list here constrain goal selection —
// 'evergreen' and 'custom' (and any type omitted here) fall back to the
// strongest overall objective, never forcing an exact type match.
const CAMPAIGN_TYPE_COMPATIBLE_OBJECTIVES: Partial<Record<CampaignType, GrowthObjectiveType[]>> = {
  awareness: ['awareness', 'education', 'positioning'],
  education: ['education', 'awareness'],
  consideration: ['consideration', 'positioning', 'differentiation'],
  lead_generation: ['lead_generation', 'buyer_enablement', 'consideration'],
  conversion: ['conversion', 'lead_generation'],
  activation: ['activation'],
  retention: ['retention'],
  product_launch: ['awareness', 'consideration', 'positioning'],
  promotion: ['conversion', 'consideration'],
};

// Only objective types that also exist as CampaignGoalType values ever reach
// selection — GrowthObjectiveService never emits 'retention' (no
// lifecycle/repeat-usage evidence source), so that branch is unreachable by
// construction rather than special-cased here.
const OBJECTIVE_TO_FUNNEL_STAGE: Partial<Record<GrowthObjectiveType, FunnelStage>> = {
  awareness: 'awareness',
  education: 'awareness',
  consideration: 'consideration',
  positioning: 'consideration',
  differentiation: 'consideration',
  lead_generation: 'conversion',
  conversion: 'conversion',
  buyer_enablement: 'conversion',
  activation: 'activation',
  retention: 'retention',
};

const GOAL_TITLES: Record<CampaignGoalType, string> = {
  awareness: 'Increase Qualified Awareness',
  education: 'Educate Target Audiences',
  consideration: 'Drive Product Consideration',
  lead_generation: 'Generate Qualified Leads',
  conversion: 'Improve Conversion',
  activation: 'Drive Product Activation',
  retention: 'Improve Retention',
  positioning: 'Strengthen Category Positioning',
  differentiation: 'Differentiate From Competitors',
  buyer_enablement: 'Support Buyer Evaluation',
  product_launch: 'Launch Product',
  custom: 'Custom Campaign Goal',
};

const GOAL_SUCCESS_SIGNALS: Record<CampaignGoalType, string[]> = {
  awareness: ['Qualified traffic', 'Search visibility', 'Engagement'],
  education: ['Engagement', 'Content completion'],
  consideration: ['Product exploration', 'Returning visitors', 'Evaluation engagement'],
  lead_generation: ['Qualified leads', 'Lead capture completion'],
  conversion: ['Supported conversion action completion'],
  activation: ['Onboarding completion', 'First-value action'],
  retention: ['Repeat usage', 'Returning active users'],
  positioning: ['Audience response', 'Engagement'],
  differentiation: ['Audience response', 'Evaluation engagement'],
  buyer_enablement: ['Evaluation engagement', 'Lead capture completion'],
  product_launch: ['Qualified traffic', 'Engagement', 'Product exploration'],
  custom: [],
};

export interface DeriveCampaignGoalInput {
  strategyObjectives: GrowthObjectiveResult;
  funnel: FunnelStrategyResult;
  acquisitionStrategy: AcquisitionStrategyResult;
  conversionStrategy: ConversionStrategyResult;
  campaignType?: CampaignType;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function dedupeStrings(items: string[]): string[] {
  const cleaned = items.map((i) => i.trim()).filter((i) => i.length > 0);
  return Array.from(new Set(cleaned)).slice(0, MAX_SUCCESS_SIGNALS);
}

/**
 * Campaign goal definition. `derive()` is pure — no fetches, no HTTP calls —
 * so it can be unit-tested directly. Everything else on this service is the
 * thin, tenant-safe orchestration around it (approval gating, strategy
 * build reuse, persistence).
 */
@Injectable()
export class CampaignGoalService {
  constructor(
    @InjectModel(Campaign.name) private readonly campaignModel: Model<CampaignDocument>,
    private readonly productsService: ProductsService,
    private readonly campaignsService: CampaignsService,
    private readonly growthStrategyService: GrowthStrategyService,
    private readonly growthStrategyReviewService: GrowthStrategyReviewService,
  ) {}

  /**
   * PURE. Selects the strongest compatible strategy objective for the
   * campaign, scores it, and produces a CampaignGoal — or null when no
   * objective exists at all (never fabricates one).
   */
  derive(input: DeriveCampaignGoalInput): CampaignGoal | null {
    const objectives = input.strategyObjectives.objectives;
    if (objectives.length === 0) return null;

    const compatibleTypes = input.campaignType ? CAMPAIGN_TYPE_COMPATIBLE_OBJECTIVES[input.campaignType] : undefined;
    let pool = objectives;
    let usedFallback = false;
    if (compatibleTypes && compatibleTypes.length > 0) {
      const filtered = objectives.filter((o) => compatibleTypes.includes(o.type));
      if (filtered.length > 0) {
        pool = filtered;
      } else {
        usedFallback = true;
      }
    }

    const chosen = [...pool].sort(
      (a, b) => b.priorityScore - a.priorityScore || b.confidenceScore - a.confidenceScore || a.id.localeCompare(b.id),
    )[0];
    if (!chosen) return null;

    const goalType = chosen.type as CampaignGoalType;
    const mappedStage = OBJECTIVE_TO_FUNNEL_STAGE[chosen.type];
    const funnelStageStrategy = mappedStage ? input.funnel.stages.find((s) => s.stage === mappedStage) : undefined;

    const matchingMotions = input.acquisitionStrategy.motions.filter((m) => m.relatedObjectiveIds.includes(chosen.id));
    const matchingActions = input.conversionStrategy.actions.filter((a) => a.relatedObjectiveIds.includes(chosen.id));

    const priorityScore = this.scorePriority(chosen, funnelStageStrategy, matchingMotions, matchingActions);
    const confidenceScore = this.scoreConfidence(chosen, funnelStageStrategy, matchingMotions, matchingActions);

    const warnings: string[] = [];
    if (usedFallback) {
      warnings.push('No strategy objective was directly compatible with the campaign type; the strongest available objective was used instead.');
    }
    warnings.push('This goal is derived from evidence-based strategy objectives and does not guarantee campaign performance.');

    return {
      type: goalType,
      title: GOAL_TITLES[goalType],
      description: chosen.reasons[0] ?? `Derived from the "${chosen.title}" growth objective.`,
      priorityScore,
      confidenceScore,
      source: 'strategy',
      relatedStrategyObjectiveIds: [chosen.id],
      relatedFunnelStages: mappedStage ? [mappedStage] : [],
      relatedConversionActionIds: matchingActions.map((a) => a.id),
      successSignals: GOAL_SUCCESS_SIGNALS[goalType],
      warnings,
    };
  }

  async setManualGoal(organizationId: string, productId: string, campaignId: string, userId: string, dto: SetCampaignGoalDto): Promise<CampaignResponse> {
    await this.productsService.findOne(organizationId, productId, userId);
    const campaign = await this.campaignsService.findCampaignDoc(organizationId, productId, campaignId);

    const goal: CampaignGoal = {
      type: dto.type,
      title: dto.title,
      description: dto.description ?? '',
      source: 'manual',
      relatedStrategyObjectiveIds: [],
      relatedFunnelStages: [],
      relatedConversionActionIds: [],
      successSignals: dedupeStrings(dto.successSignals ?? []),
      warnings: [],
    };

    const hadGoal = !!campaign.goal;
    campaign.goal = goal;
    if (hadGoal) campaign.planningMetadata.version += 1;
    campaign.updatedBy = new Types.ObjectId(userId);
    await campaign.save();
    return toCampaignResponse(campaign);
  }

  async deriveGoalForCampaign(
    organizationId: string,
    productId: string,
    campaignId: string,
    userId: string,
    campaignTypeOverride?: CampaignType,
  ): Promise<CampaignResponse> {
    const product = await this.productsService.findOne(organizationId, productId, userId);
    const campaign = await this.campaignsService.findCampaignDoc(organizationId, productId, campaignId);

    // Cheap pre-check first — avoids the expensive strategy rebuild entirely
    // when nothing has ever been approved. The strategy pipeline has no
    // content hash, only a build timestamp, so "current version" is judged
    // against the underlying product's own updatedAt rather than a freshly
    // rebuilt generatedAt (which is always "now" and would make every
    // approval look instantly stale).
    const review = await this.growthStrategyReviewService.getReview(organizationId, productId, userId);
    if (review.status !== 'approved') {
      throw new ConflictException('Approve the current Growth Strategy before deriving a campaign goal.');
    }

    const productUpdatedAt: Date = (product as { updatedAt?: Date }).updatedAt ?? new Date(0);
    const stillApproved = await this.growthStrategyReviewService.isStrategyApprovedForCurrentVersion(
      organizationId,
      productId,
      userId,
      productUpdatedAt,
    );
    if (!stillApproved) {
      throw new ConflictException('The product has changed since the Growth Strategy was last approved. Review and approve it again before deriving a campaign goal.');
    }

    // Single internal orchestration pass — never multiple preview endpoints.
    const overview = await this.growthStrategyService.buildOverviewForProduct(organizationId, productId, userId);

    const derived = this.derive({
      strategyObjectives: overview.objectives,
      funnel: overview.funnel,
      acquisitionStrategy: overview.acquisitionStrategy,
      conversionStrategy: overview.conversionStrategy,
      campaignType: campaignTypeOverride ?? campaign.type,
    });

    if (!derived) {
      throw new BadRequestException('Current approved strategy does not contain a reliable objective for this campaign.');
    }

    const hadGoal = !!campaign.goal;
    campaign.goal = derived;
    campaign.objectiveIds = dedupeStrings(derived.relatedStrategyObjectiveIds);
    campaign.strategyReference = {
      reviewedStrategyGeneratedAt: new Date(overview.generatedAt),
      strategyReviewId: review.id ? new Types.ObjectId(review.id) : undefined,
    };
    if (hadGoal) campaign.planningMetadata.version += 1;
    campaign.planningMetadata.source = 'strategy_generated';
    campaign.updatedBy = new Types.ObjectId(userId);
    await campaign.save();
    return toCampaignResponse(campaign);
  }

  // ---------------------------------------------------------------------
  // Internal scoring helpers (pure)
  // ---------------------------------------------------------------------

  private scorePriority(
    objective: GrowthObjective,
    funnelStageStrategy: { priorityScore: number } | undefined,
    motions: { priorityScore: number }[],
    actions: { priorityScore: number }[],
  ): number {
    const dims: { weight: number; value: number }[] = [{ weight: 0.5, value: objective.priorityScore }];
    if (funnelStageStrategy) dims.push({ weight: 0.2, value: funnelStageStrategy.priorityScore });
    if (motions.length > 0) dims.push({ weight: 0.15, value: mean(motions.map((m) => m.priorityScore)) });
    if (actions.length > 0) dims.push({ weight: 0.15, value: mean(actions.map((a) => a.priorityScore)) });

    const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0);
    const score = dims.reduce((sum, d) => sum + d.weight * d.value, 0) / totalWeight;
    return Math.round(score);
  }

  private scoreConfidence(
    objective: GrowthObjective,
    funnelStageStrategy: { confidenceScore: number } | undefined,
    motions: { confidenceScore: number }[],
    actions: { confidenceScore: number }[],
  ): number {
    const dims: { weight: number; value: number }[] = [{ weight: 0.5, value: objective.confidenceScore }];
    if (funnelStageStrategy) dims.push({ weight: 0.25, value: funnelStageStrategy.confidenceScore });
    const evidenceConfidences = [...motions.map((m) => m.confidenceScore), ...actions.map((a) => a.confidenceScore)];
    if (evidenceConfidences.length > 0) dims.push({ weight: 0.25, value: mean(evidenceConfidences) });

    // Source-diversity bonus: reward a goal backed by more than one
    // independent evidence layer, capped so it never dominates the score.
    const sourceCount = [funnelStageStrategy, motions.length > 0, actions.length > 0].filter(Boolean).length;
    const diversityBonus = Math.min(sourceCount * 3, 9);

    const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0);
    const score = dims.reduce((sum, d) => sum + d.weight * d.value, 0) / totalWeight;
    return Math.round(Math.min(100, score + diversityBonus));
  }
}
