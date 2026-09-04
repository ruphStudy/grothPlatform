import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { AcquisitionMotion, AcquisitionStrategyResult } from '../growth-strategy/types/acquisition-strategy.types';
import type { FunnelStage, FunnelStageStrategy, FunnelStrategyResult } from '../growth-strategy/types/funnel-strategy.types';
import type { GrowthObjectiveResult } from '../growth-strategy/types/growth-objective.types';
import type { ChannelFit, GrowthChannel, GrowthChannelFitResult } from '../growth-strategy/types/growth-channel-fit.types';
import type { StrategySignal, StrategySignalResult } from '../growth-strategy/types/strategy-signal.types';
import { GrowthStrategyReviewService } from '../growth-strategy/growth-strategy-review.service';
import { GrowthStrategyService } from '../growth-strategy/growth-strategy.service';
import { ProductsService } from '../products/products.service';
import { toCampaignResponse } from './campaigns.mapper';
import { CampaignsService } from './campaigns.service';
import { SetCampaignAudienceChannelDto } from './dto/set-campaign-audience-channel.dto';
import { Campaign, CampaignDocument } from './schemas/campaign.schema';
import type { CampaignGoalType } from './types/campaign-goal.types';
import type { CampaignAudienceChannelMapping, CampaignAudienceRecommendation, CampaignChannelRecommendation } from './types/campaign-audience-channel.types';
import type { CampaignResponse } from './types/campaign.types';

const DEFAULT_MAX_AUDIENCES = 5;
const DEFAULT_MAX_CHANNELS = 5;
const DEFAULT_MIN_SCORE = 40;

const DISCLAIMER = 'Audience/channel recommendations are evidence-based strategy heuristics and do not estimate spend, CAC, or ROI.';

// Titles carried on StrategySignal (category 'audience', plus 'commercial' for
// Buyer Role) that can each anchor one campaign-audience candidate.
const AUDIENCE_TITLES = new Set(['Primary Audience', 'Secondary Audience', 'Ideal Customer Profile', 'Primary Use Case', 'Buyer Role']);

// Only goal types listed here constrain audience selection. A goal type
// mapped to an empty object hard-excludes every audience (retention: no
// lifecycle evidence source exists anywhere upstream — never fabricated). A
// goal type omitted entirely (e.g. 'custom') is unrestricted: any recognized
// audience title is allowed at a flat default alignment score.
const GOAL_AUDIENCE_ALIGNMENT: Partial<Record<CampaignGoalType, Record<string, number>>> = {
  awareness: { 'Primary Audience': 100, 'Secondary Audience': 70 },
  education: { 'Primary Audience': 85, 'Secondary Audience': 80 },
  consideration: { 'Ideal Customer Profile': 85, 'Primary Audience': 75, 'Secondary Audience': 60 },
  lead_generation: { 'Ideal Customer Profile': 100, 'Buyer Role': 90, 'Secondary Audience': 55, 'Primary Audience': 50 },
  conversion: { 'Ideal Customer Profile': 85, 'Buyer Role': 80, 'Primary Audience': 75 },
  activation: { 'Primary Use Case': 100 },
  positioning: { 'Primary Audience': 80, 'Ideal Customer Profile': 70 },
  differentiation: { 'Primary Audience': 75, 'Ideal Customer Profile': 75 },
  buyer_enablement: { 'Ideal Customer Profile': 100, 'Buyer Role': 95 },
  retention: {},
  product_launch: { 'Primary Audience': 90, 'Secondary Audience': 70 },
};
const DEFAULT_AUDIENCE_ALIGNMENT_SCORE = 60;

// Ordered allowlist per goal type — position implies preference (see
// scoreChannel's alignment scoring). A channel never appears here unless
// Sprint 12 channel-fit evidence already supports it; this list only ever
// narrows strategyChannels.channels, never adds to it. Empty array = hard
// exclude (retention). Omitted goal type (e.g. 'custom') = unrestricted.
const GOAL_CHANNEL_PRIORITY: Partial<Record<CampaignGoalType, GrowthChannel[]>> = {
  awareness: ['seo', 'content', 'organic_social', 'paid_social'],
  education: ['seo', 'content', 'community'],
  consideration: ['seo', 'content', 'paid_search', 'community'],
  lead_generation: ['outbound', 'email', 'paid_search', 'paid_social'],
  conversion: ['paid_search', 'email', 'outbound', 'product_led'],
  activation: ['product_led'],
  positioning: ['content', 'community', 'seo'],
  differentiation: ['content', 'community', 'paid_search'],
  buyer_enablement: ['email', 'content', 'partnerships'],
  retention: [],
  product_launch: ['seo', 'content', 'organic_social', 'paid_social', 'email'],
};

// Same funnel-stage mapping convention as 13B's CampaignGoalService — only
// used to pull an existing FunnelStageStrategy's own priority/confidence,
// never to invent a stage that isn't already evidenced.
const GOAL_TO_FUNNEL_STAGE: Partial<Record<CampaignGoalType, FunnelStage>> = {
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
  product_launch: 'awareness',
};

interface AudienceCandidate {
  audienceSegmentId: string;
  label: string;
  title: string;
  signal: StrategySignal;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function dedupeStrings(items: string[]): string[] {
  return Array.from(new Set(items.map((i) => i.trim()).filter((i) => i.length > 0)));
}

export interface CampaignAudienceChannelMapInput {
  campaignGoal: { type: CampaignGoalType; relatedStrategyObjectiveIds: string[] };
  strategySignals: StrategySignalResult;
  strategyObjectives: GrowthObjectiveResult;
  strategyChannels: GrowthChannelFitResult;
  funnel: FunnelStrategyResult;
  acquisitionStrategy: AcquisitionStrategyResult;
}

/**
 * Campaign audience/channel mapping. `map()` is pure — no fetches, no HTTP
 * calls — so it can be unit-tested directly. Everything else on this
 * service is the thin, tenant-safe orchestration around it (goal/approval
 * gating, strategy build reuse, persistence).
 */
@Injectable()
export class CampaignAudienceChannelService {
  constructor(
    @InjectModel(Campaign.name) private readonly campaignModel: Model<CampaignDocument>,
    private readonly configService: ConfigService,
    private readonly productsService: ProductsService,
    private readonly campaignsService: CampaignsService,
    private readonly growthStrategyService: GrowthStrategyService,
    private readonly growthStrategyReviewService: GrowthStrategyReviewService,
  ) {}

  /**
   * PURE. Maps the campaign's current goal onto the approved strategy's
   * audience signals and channel-fit evidence. Never invents an audience
   * segment or channel that isn't already evidenced upstream.
   */
  map(input: CampaignAudienceChannelMapInput): CampaignAudienceChannelMapping {
    const goalType = input.campaignGoal.type;
    const mappedStage = GOAL_TO_FUNNEL_STAGE[goalType];
    const funnelStageStrategy = mappedStage ? input.funnel.stages.find((s) => s.stage === mappedStage) : undefined;
    const objective = input.strategyObjectives.objectives.find((o) => input.campaignGoal.relatedStrategyObjectiveIds.includes(o.id));

    const audiences = this.buildAudienceRecommendations(input, goalType, funnelStageStrategy, objective?.relatedAudienceSegmentIds ?? [], objective?.priorityScore);
    const channels = this.buildChannelRecommendations(input, goalType, funnelStageStrategy, audiences);

    const missingEvidence: string[] = [];
    if (audiences.length === 0) missingEvidence.push('No reliable audience segment evidence is available for this campaign goal.');
    if (channels.length === 0) missingEvidence.push('No reliable channel evidence is available for this campaign goal.');

    const allConfidences = [...audiences.map((a) => a.confidenceScore), ...channels.map((c) => c.confidenceScore)];
    const confidenceScore = allConfidences.length ? Math.round(mean(allConfidences)) : 0;

    return {
      audiences,
      channels,
      primaryAudienceSegmentId: audiences[0]?.audienceSegmentId,
      primaryChannel: channels[0]?.channel,
      confidenceScore,
      missingEvidence,
      warnings: [DISCLAIMER],
      source: 'strategy',
      generatedAt: new Date(),
    };
  }

  // ---------------------------------------------------------------------
  // Audience
  // ---------------------------------------------------------------------

  private buildAudienceRecommendations(
    input: CampaignAudienceChannelMapInput,
    goalType: CampaignGoalType,
    funnelStageStrategy: FunnelStageStrategy | undefined,
    objectiveRelatedSegmentIds: string[],
    objectivePriorityScore: number | undefined,
  ): CampaignAudienceRecommendation[] {
    const alignmentTable = GOAL_AUDIENCE_ALIGNMENT[goalType];
    const candidates: AudienceCandidate[] = input.strategySignals.signals
      .filter((s) => AUDIENCE_TITLES.has(s.title) && (s.category === 'audience' || s.category === 'commercial'))
      .map((s) => ({
        audienceSegmentId: s.relatedSegmentIds?.[0] ?? s.id,
        label: s.value,
        title: s.title,
        signal: s,
      }));

    const scored: CampaignAudienceRecommendation[] = [];
    for (const candidate of candidates) {
      const alignmentScore = alignmentTable === undefined ? DEFAULT_AUDIENCE_ALIGNMENT_SCORE : alignmentTable[candidate.title];
      if (alignmentScore === undefined) continue; // goal doesn't call for this audience role at all

      const supportingMotions = input.acquisitionStrategy.motions.filter((m) => m.targetAudienceSegmentIds.includes(candidate.audienceSegmentId));
      const objectiveSupportsThis = objectiveRelatedSegmentIds.includes(candidate.audienceSegmentId);
      const supportingChannels = input.strategyChannels.channels.filter((c) => c.relatedAudienceSegmentIds.includes(candidate.audienceSegmentId));

      const { relevanceScore, confidenceScore, reasons } = this.scoreAudienceCandidate(
        candidate,
        alignmentScore,
        funnelStageStrategy,
        supportingMotions,
        objectiveSupportsThis ? objectivePriorityScore : undefined,
        supportingChannels,
      );

      scored.push({
        audienceSegmentId: candidate.audienceSegmentId,
        label: candidate.label,
        relevanceScore,
        confidenceScore,
        relatedGoalTypes: [goalType],
        relatedFunnelStages: mappedStageArray(funnelStageStrategy),
        relatedChannelIds: dedupeStrings(supportingChannels.map((c) => c.channel)),
        reasons,
        warnings: [],
      });
    }

    return this.dedupeAndRank(scored, this.getMinScore(), this.getMaxAudiences());
  }

  private scoreAudienceCandidate(
    candidate: AudienceCandidate,
    alignmentScore: number,
    funnelStageStrategy: FunnelStageStrategy | undefined,
    supportingMotions: AcquisitionMotion[],
    objectivePriorityIfMatched: number | undefined,
    supportingChannels: ChannelFit[],
  ): { relevanceScore: number; confidenceScore: number; reasons: string[] } {
    const dims: { weight: number; value: number }[] = [
      { weight: 0.35, value: alignmentScore },
      { weight: 0.25, value: candidate.signal.strengthScore },
    ];
    if (funnelStageStrategy) dims.push({ weight: 0.15, value: funnelStageStrategy.priorityScore });

    const supportValues = [...supportingMotions.map((m) => m.priorityScore), ...(objectivePriorityIfMatched !== undefined ? [objectivePriorityIfMatched] : [])];
    if (supportValues.length > 0) dims.push({ weight: 0.15, value: mean(supportValues) });
    if (supportingChannels.length > 0) dims.push({ weight: 0.1, value: mean(supportingChannels.map((c) => c.fitScore)) });

    const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0);
    const relevanceScore = clamp(Math.round(dims.reduce((sum, d) => sum + d.weight * d.value, 0) / totalWeight), 0, 100);

    const confDims: { weight: number; value: number }[] = [{ weight: 0.6, value: candidate.signal.confidenceScore }];
    if (funnelStageStrategy) confDims.push({ weight: 0.25, value: funnelStageStrategy.confidenceScore });
    if (supportingMotions.length > 0) confDims.push({ weight: 0.15, value: mean(supportingMotions.map((m) => m.confidenceScore)) });
    const confTotalWeight = confDims.reduce((sum, d) => sum + d.weight, 0);
    const sourceCount = [true, !!funnelStageStrategy, supportValues.length > 0, supportingChannels.length > 0].filter(Boolean).length;
    const diversityBonus = Math.min((sourceCount - 1) * 3, 9);
    const confidenceScore = clamp(Math.round(confDims.reduce((sum, d) => sum + d.weight * d.value, 0) / confTotalWeight + diversityBonus), 0, 100);

    const reasons = [`"${candidate.title}" (${candidate.label}) aligns with this campaign's goal.`, ...candidate.signal.evidence.slice(0, 2)];
    return { relevanceScore, confidenceScore, reasons: dedupeStrings(reasons) };
  }

  // ---------------------------------------------------------------------
  // Channels
  // ---------------------------------------------------------------------

  private buildChannelRecommendations(
    input: CampaignAudienceChannelMapInput,
    goalType: CampaignGoalType,
    funnelStageStrategy: FunnelStageStrategy | undefined,
    audiences: CampaignAudienceRecommendation[],
  ): CampaignChannelRecommendation[] {
    const priorityList = GOAL_CHANNEL_PRIORITY[goalType];
    const allowedChannels = priorityList === undefined ? input.strategyChannels.channels : input.strategyChannels.channels.filter((c) => priorityList.includes(c.channel));

    const scored: CampaignChannelRecommendation[] = [];
    for (const channelFit of allowedChannels) {
      const position = priorityList ? priorityList.indexOf(channelFit.channel) : 0;
      const alignmentScore = priorityList ? clamp(100 - position * 15, 40, 100) : 70;

      const supportingAudiences = audiences.filter((a) => channelFit.relatedAudienceSegmentIds.includes(a.audienceSegmentId));

      const { fitScore, confidenceScore, reasons } = this.scoreChannelCandidate(channelFit, alignmentScore, funnelStageStrategy, supportingAudiences);

      scored.push({
        channel: channelFit.channel,
        fitScore,
        confidenceScore,
        audienceSegmentIds: dedupeStrings(supportingAudiences.map((a) => a.audienceSegmentId)),
        relatedGoalTypes: [goalType],
        relatedFunnelStages: mappedStageArray(funnelStageStrategy),
        reasons,
        weaknesses: dedupeStrings(channelFit.weaknesses),
        warnings: [],
      });
    }

    return this.dedupeAndRank(scored, this.getMinScore(), this.getMaxChannels(), (c) => c.channel);
  }

  private scoreChannelCandidate(
    channelFit: ChannelFit,
    alignmentScore: number,
    funnelStageStrategy: FunnelStageStrategy | undefined,
    supportingAudiences: CampaignAudienceRecommendation[],
  ): { fitScore: number; confidenceScore: number; reasons: string[] } {
    const dims: { weight: number; value: number }[] = [
      { weight: 0.45, value: channelFit.fitScore },
      { weight: 0.25, value: alignmentScore },
    ];
    if (supportingAudiences.length > 0) dims.push({ weight: 0.15, value: mean(supportingAudiences.map((a) => a.relevanceScore)) });
    if (funnelStageStrategy) dims.push({ weight: 0.15, value: funnelStageStrategy.priorityScore });

    const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0);
    const fitScore = clamp(Math.round(dims.reduce((sum, d) => sum + d.weight * d.value, 0) / totalWeight), 0, 100);

    const confDims: { weight: number; value: number }[] = [{ weight: 0.6, value: channelFit.confidenceScore }];
    if (funnelStageStrategy) confDims.push({ weight: 0.25, value: funnelStageStrategy.confidenceScore });
    if (supportingAudiences.length > 0) confDims.push({ weight: 0.15, value: mean(supportingAudiences.map((a) => a.confidenceScore)) });
    const confTotalWeight = confDims.reduce((sum, d) => sum + d.weight, 0);
    const sourceCount = [true, !!funnelStageStrategy, supportingAudiences.length > 0].filter(Boolean).length;
    const diversityBonus = Math.min((sourceCount - 1) * 4, 8);
    const confidenceScore = clamp(Math.round(confDims.reduce((sum, d) => sum + d.weight * d.value, 0) / confTotalWeight + diversityBonus), 0, 100);

    const reasons = dedupeStrings(channelFit.reasons);
    return { fitScore, confidenceScore, reasons };
  }

  // ---------------------------------------------------------------------
  // Shared dedup/rank/limit helper
  // ---------------------------------------------------------------------

  private dedupeAndRank<T extends { reasons: string[]; warnings: string[]; confidenceScore: number }>(
    items: (T & { audienceSegmentId?: string; channel?: string })[],
    minScore: number,
    maxItems: number,
    keyOf: (item: T) => string = (item) => (item as { audienceSegmentId?: string }).audienceSegmentId ?? '',
  ): T[] {
    const scoreOf = (item: T): number => (item as unknown as { relevanceScore?: number; fitScore?: number }).relevanceScore ?? (item as unknown as { fitScore?: number }).fitScore ?? 0;

    const byKey = new Map<string, T>();
    for (const item of items) {
      const key = keyOf(item);
      const existing = byKey.get(key);
      if (!existing || scoreOf(item) > scoreOf(existing)) {
        byKey.set(key, {
          ...item,
          reasons: dedupeStrings([...(existing?.reasons ?? []), ...item.reasons]),
          warnings: dedupeStrings([...(existing?.warnings ?? []), ...item.warnings]),
        });
      }
    }

    return Array.from(byKey.values())
      .filter((item) => scoreOf(item) >= minScore)
      .sort((a, b) => scoreOf(b) - scoreOf(a) || b.confidenceScore - a.confidenceScore || keyOf(a).localeCompare(keyOf(b)))
      .slice(0, maxItems);
  }

  // ---------------------------------------------------------------------
  // Manual mapping
  // ---------------------------------------------------------------------

  async setManualMapping(
    organizationId: string,
    productId: string,
    campaignId: string,
    userId: string,
    dto: SetCampaignAudienceChannelDto,
  ): Promise<CampaignResponse> {
    await this.productsService.findOne(organizationId, productId, userId);
    const campaign = await this.campaignsService.findCampaignDoc(organizationId, productId, campaignId);

    const audienceSegmentIds = dedupeStrings(dto.audienceSegmentIds ?? []);
    const channelIds = dedupeStrings(dto.channelIds ?? []);

    if (dto.primaryAudienceSegmentId && !audienceSegmentIds.includes(dto.primaryAudienceSegmentId)) {
      throw new BadRequestException('primaryAudienceSegmentId must be one of the selected audienceSegmentIds.');
    }
    if (dto.primaryChannel && !channelIds.includes(dto.primaryChannel)) {
      throw new BadRequestException('primaryChannel must be one of the selected channelIds.');
    }

    const mapping: CampaignAudienceChannelMapping = {
      audiences: audienceSegmentIds.map((id) => ({
        audienceSegmentId: id,
        relevanceScore: 0,
        confidenceScore: 0,
        relatedGoalTypes: [],
        relatedFunnelStages: [],
        relatedChannelIds: [],
        reasons: [],
        warnings: [],
      })),
      channels: channelIds.map((channel) => ({
        channel,
        fitScore: 0,
        confidenceScore: 0,
        audienceSegmentIds: [],
        relatedGoalTypes: [],
        relatedFunnelStages: [],
        reasons: [],
        weaknesses: [],
        warnings: [],
      })),
      primaryAudienceSegmentId: dto.primaryAudienceSegmentId,
      primaryChannel: dto.primaryChannel,
      confidenceScore: 0,
      missingEvidence: [],
      warnings: [],
      source: 'manual',
      generatedAt: new Date(),
    };

    const hadMapping = !!campaign.audienceChannelMapping;
    campaign.audienceChannelMapping = mapping;
    campaign.audienceSegmentIds = audienceSegmentIds;
    campaign.channelIds = channelIds;
    if (hadMapping) campaign.planningMetadata.version += 1;
    campaign.updatedBy = new Types.ObjectId(userId);
    await campaign.save();
    return toCampaignResponse(campaign);
  }

  // ---------------------------------------------------------------------
  // Strategy-derived mapping
  // ---------------------------------------------------------------------

  async deriveMappingForCampaign(organizationId: string, productId: string, campaignId: string, userId: string): Promise<CampaignResponse> {
    const product = await this.productsService.findOne(organizationId, productId, userId);
    const campaign = await this.campaignsService.findCampaignDoc(organizationId, productId, campaignId);

    if (!campaign.goal) {
      throw new BadRequestException('Define a campaign goal before deriving an audience/channel mapping.');
    }

    // Cheap pre-check first — avoids the expensive strategy rebuild entirely
    // when nothing has ever been approved. Same current-version semantics as
    // 13B: staleness is judged against the underlying product's own
    // updatedAt, never against a freshly rebuilt (always "now") timestamp.
    const review = await this.growthStrategyReviewService.getReview(organizationId, productId, userId);
    if (review.status !== 'approved') {
      throw new ConflictException('Approve the current Growth Strategy before deriving an audience/channel mapping.');
    }

    const productUpdatedAt: Date = (product as { updatedAt?: Date }).updatedAt ?? new Date(0);
    const stillApproved = await this.growthStrategyReviewService.isStrategyApprovedForCurrentVersion(organizationId, productId, userId, productUpdatedAt);
    if (!stillApproved) {
      throw new ConflictException('The product has changed since the Growth Strategy was last approved. Review and approve it again before deriving an audience/channel mapping.');
    }

    // Single internal orchestration pass — never multiple preview endpoints.
    const overview = await this.growthStrategyService.buildOverviewForProduct(organizationId, productId, userId);

    const mapping = this.map({
      campaignGoal: campaign.goal,
      strategySignals: overview.signals,
      strategyObjectives: overview.objectives,
      strategyChannels: overview.channels,
      funnel: overview.funnel,
      acquisitionStrategy: overview.acquisitionStrategy,
    });

    const hadMapping = !!campaign.audienceChannelMapping;
    campaign.audienceChannelMapping = mapping;
    campaign.audienceSegmentIds = dedupeStrings(mapping.audiences.map((a) => a.audienceSegmentId));
    campaign.channelIds = dedupeStrings(mapping.channels.map((c) => c.channel));
    campaign.strategyReference = {
      reviewedStrategyGeneratedAt: new Date(overview.generatedAt),
      strategyReviewId: review.id ? new Types.ObjectId(review.id) : undefined,
    };
    if (hadMapping) campaign.planningMetadata.version += 1;
    campaign.updatedBy = new Types.ObjectId(userId);
    await campaign.save();
    return toCampaignResponse(campaign);
  }

  // ---------------------------------------------------------------------
  // Env-configurable limits
  // ---------------------------------------------------------------------

  private getMaxAudiences(): number {
    return this.getEnvNumber('CAMPAIGN_MAX_AUDIENCES', DEFAULT_MAX_AUDIENCES);
  }

  private getMaxChannels(): number {
    return this.getEnvNumber('CAMPAIGN_MAX_CHANNELS', DEFAULT_MAX_CHANNELS);
  }

  private getMinScore(): number {
    return this.getEnvNumber('CAMPAIGN_MAPPING_MIN_SCORE', DEFAULT_MIN_SCORE);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}

function mappedStageArray(funnelStageStrategy: FunnelStageStrategy | undefined): string[] {
  return funnelStageStrategy ? [funnelStageStrategy.stage] : [];
}
