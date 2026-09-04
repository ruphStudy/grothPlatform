import { BadRequestException, ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { AcquisitionMotion, AcquisitionStrategyResult } from '../growth-strategy/types/acquisition-strategy.types';
import type { ConversionAction, ConversionActionType, ConversionStrategyResult } from '../growth-strategy/types/conversion-strategy.types';
import type { ContentStrategyResult, ContentTopicDirection } from '../growth-strategy/types/content-strategy.types';
import type { FunnelStage, FunnelStrategyResult } from '../growth-strategy/types/funnel-strategy.types';
import type { GrowthInitiativeType, GrowthPlanResult } from '../growth-strategy/types/growth-plan.types';
import type { MessagingPillar, MessagingStrategyResult } from '../growth-strategy/types/messaging-strategy.types';
import { GrowthStrategyReviewService } from '../growth-strategy/growth-strategy-review.service';
import { GrowthStrategyService } from '../growth-strategy/growth-strategy.service';
import { ProductsService } from '../products/products.service';
import { toCampaignResponse } from './campaigns.mapper';
import { CampaignsService } from './campaigns.service';
import { Campaign, CampaignDocument } from './schemas/campaign.schema';
import type { CampaignGoal, CampaignGoalType } from './types/campaign-goal.types';
import type { CampaignAudienceChannelMapping } from './types/campaign-audience-channel.types';
import type { CampaignActivity, CampaignActivityType, CampaignPlanResult, CampaignWeekPlan } from './types/campaign-plan.types';
import type { CampaignResponse } from './types/campaign.types';

const DEFAULT_MAX_ACTIVITIES = 20;
const DEFAULT_MAX_ACTIVITIES_PER_WEEK = 6;
const DEFAULT_MAX_ACTIONS_PER_ACTIVITY = 4;
const DEFAULT_MAX_KEYWORDS_PER_ACTIVITY = 5;
const DEFAULT_MAX_TOP_PRIORITIES = 6;

const DISCLAIMER = 'This 30-day plan is a strategic activity sequence, not final content, ad copy, or a scheduling/publishing commitment.';

// Only these conversion-action types are ever referenced as an activity's
// conversionDirection — trial/purchase are deliberately excluded, and even
// these are only used when 12G's ConversionStrategy actually evidenced them.
const ALLOWED_CONVERSION_DIRECTIONS: ConversionActionType[] = ['product_exploration', 'signup', 'lead_capture', 'demo', 'activation', 'generic_conversion'];

type WeekHint = 1 | 2 | 3 | 4 | 'review';
const WEEK_HINT_TO_NUMBER: Record<WeekHint, number> = { 1: 1, 2: 2, 3: 3, 4: 4, review: 5 };

const WEEK_DEFS: Record<number, { days: number[]; theme: string; objective: string }> = {
  1: { days: [1, 2, 3, 4, 5, 6, 7], theme: 'Foundation + Setup', objective: 'Prepare core assets, targeting, and messaging before launch.' },
  2: { days: [8, 9, 10, 11, 12, 13, 14], theme: 'Launch + Initial Distribution', objective: 'Launch prepared assets and begin initial distribution.' },
  3: { days: [15, 16, 17, 18, 19, 20, 21], theme: 'Reinforce + Learn', objective: 'Reinforce messaging and incorporate early learnings.' },
  4: { days: [22, 23, 24, 25, 26, 27, 28], theme: 'Optimize + Expand', objective: 'Optimize based on signals and expand supported activity.' },
  5: { days: [29, 30], theme: 'Review + Next-Step Planning', objective: 'Review campaign signals and plan next steps.' },
};

// Maps a campaign activity type onto the closest Sprint 12H growth-plan
// initiative category, so phase-1 (days_1_30) initiative priority can inform
// this campaign's own activity scoring without re-deriving it.
const ACTIVITY_TO_INITIATIVE_TYPE: Partial<Record<CampaignActivityType, GrowthInitiativeType>> = {
  seo: 'seo',
  blog: 'content',
  landing_page: 'content',
  social: 'content',
  video: 'content',
  email: 'acquisition',
  outbound: 'acquisition',
  community: 'acquisition',
  partnership: 'acquisition',
  paid_search: 'acquisition',
  paid_social: 'acquisition',
  conversion: 'conversion',
  activation: 'activation',
  proof: 'proof',
  measurement: 'measurement',
};

const SUCCESS_SIGNALS_BY_TYPE: Record<CampaignActivityType, string[]> = {
  seo: ['Search visibility', 'Organic traffic'],
  blog: ['Content engagement', 'Time on page'],
  landing_page: ['Landing page conversion readiness'],
  social: ['Engagement', 'Reach'],
  video: ['View completion', 'Engagement'],
  email: ['Open rate', 'Click-through engagement'],
  outbound: ['Response rate', 'Qualified replies'],
  community: ['Community engagement'],
  partnership: ['Partner-driven referrals'],
  paid_search: ['Qualified click-through', 'Landing engagement'],
  paid_social: ['Qualified click-through', 'Engagement'],
  conversion: ['Conversion action completion'],
  activation: ['Onboarding completion', 'First-value action'],
  proof: ['Proof material readiness'],
  measurement: ['Tracking readiness confirmed', 'Learnings captured'],
};

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

interface RawActivity {
  key: string;
  type: CampaignActivityType;
  title: string;
  objective: string;
  channel: string;
  audienceSegmentIds: string[];
  funnelStage: FunnelStage;
  messagingPillarIds: string[];
  contentPillarIds: string[];
  keywordDirections: string[];
  contentFormat?: string;
  recommendedActions: string[];
  conversionDirection?: string;
  dependencyKeys: string[];
  weekHint: WeekHint;
  reasons: string[];
  warnings: string[];
  // scoring inputs
  channelFitScore?: number;
  channelConfidence?: number;
  audienceRelevanceScores: number[];
  audienceConfidences: number[];
  supportPriorityScores: number[];
  supportConfidences: number[];
}

export interface CampaignPlanGenerateInput {
  campaign: { channelIds: string[]; audienceSegmentIds: string[] };
  goal: CampaignGoal;
  audienceChannelMapping: CampaignAudienceChannelMapping;
  approvedStrategy: {
    funnel: FunnelStrategyResult;
    messaging: MessagingStrategyResult;
    contentStrategy: ContentStrategyResult;
    acquisitionStrategy: AcquisitionStrategyResult;
    conversionStrategy: ConversionStrategyResult;
    growthPlan: GrowthPlanResult;
  };
}

interface Ctx {
  goalType: CampaignGoalType;
  goal: CampaignGoal;
  allowedChannels: Set<string>;
  allowedAudiences: string[];
  primaryChannel?: string;
  mapping: CampaignAudienceChannelMapping;
  strategy: CampaignPlanGenerateInput['approvedStrategy'];
  mappedStage: FunnelStage;
}

/**
 * 30-day campaign activity generator. `generate()` is pure — no fetches, no
 * HTTP calls — so it can be unit-tested directly. Everything else on this
 * service is the thin, tenant-safe orchestration around it (goal/mapping/
 * approval gating, strategy build reuse, persistence).
 */
@Injectable()
export class CampaignPlanService {
  constructor(
    @InjectModel(Campaign.name) private readonly campaignModel: Model<CampaignDocument>,
    private readonly configService: ConfigService,
    private readonly productsService: ProductsService,
    private readonly campaignsService: CampaignsService,
    private readonly growthStrategyService: GrowthStrategyService,
    private readonly growthStrategyReviewService: GrowthStrategyReviewService,
  ) {}

  /**
   * PURE. Builds a deterministic 30-day activity sequence strictly bounded
   * by the campaign's own selected channels/audiences and its current goal.
   * Returns null when there isn't enough evidence to produce a meaningful
   * plan — never fabricates filler activity.
   */
  generate(input: CampaignPlanGenerateInput): CampaignPlanResult | null {
    const goalType = input.goal.type;
    const ctx: Ctx = {
      goalType,
      goal: input.goal,
      allowedChannels: new Set(input.campaign.channelIds),
      allowedAudiences: input.campaign.audienceSegmentIds,
      primaryChannel: input.audienceChannelMapping.primaryChannel,
      mapping: input.audienceChannelMapping,
      strategy: input.approvedStrategy,
      mappedStage: GOAL_TO_FUNNEL_STAGE[goalType] ?? 'awareness',
    };

    const raw = this.buildRules(ctx).map((rule) => rule(ctx)).filter((r): r is RawActivity => r !== null);
    if (raw.length === 0) return null;

    const deduped = this.dedupeRaw(raw);
    const scored = deduped.map((r) => this.scoreActivity(r, ctx));

    const capped = scored.sort((a, b) => b.priorityScore - a.priorityScore).slice(0, this.getMaxActivities());
    if (capped.length === 0) return null;

    const { activities, weeks } = this.assignSchedule(capped);

    const topPriorityActivityIds = [...activities]
      .sort((a, b) => b.priorityScore - a.priorityScore || a.id.localeCompare(b.id))
      .slice(0, this.getMaxTopPriorities())
      .map((a) => a.id);

    const missingEvidence: string[] = [];
    if (!activities.some((a) => a.type === 'measurement')) {
      missingEvidence.push('No measurement/review activity was added due to insufficient supporting evidence.');
    }

    const confidenceScore = activities.length ? Math.round(mean(activities.map((a) => a.confidenceScore))) : 0;

    return {
      durationDays: 30,
      weeks,
      activities,
      topPriorityActivityIds,
      confidenceScore,
      missingEvidence,
      warnings: [DISCLAIMER],
      generatedAt: new Date(),
    };
  }

  // ---------------------------------------------------------------------
  // Rule table
  // ---------------------------------------------------------------------

  private buildRules(ctx: Ctx): ((ctx: Ctx) => RawActivity | null)[] {
    return [
      this.ruleSeoTopicCoverage,
      this.ruleBlogGuidePrep,
      this.ruleContentDistribution,
      this.ruleComparisonEvaluationContent,
      this.ruleLandingPrep,
      this.rulePaidSearchLaunch,
      this.rulePaidSocialLaunch,
      this.ruleOutboundMessagingPrep,
      this.ruleOutboundSend,
      this.ruleEmailNurture,
      this.ruleProofPrep,
      this.ruleProofConversionSurface,
      this.ruleConversionCtaImprovement,
      this.ruleOnboardingActivation,
      this.ruleCommunityEngagement,
      this.rulePartnershipOutreach,
      this.ruleMeasurementReview,
    ].map((fn) => fn.bind(this));
  }

  private audienceNote(ctx: Ctx): string[] {
    return ctx.allowedAudiences.length === 0 ? ['No specific audience segment evidence is available; this activity applies broadly.'] : [];
  }

  private resolveAudiences(ctx: Ctx, preferred: string[]): string[] {
    if (ctx.allowedAudiences.length === 0) return [];
    const intersected = preferred.filter((id) => ctx.allowedAudiences.includes(id));
    return intersected.length > 0 ? intersected : ctx.allowedAudiences.slice(0, 3);
  }

  private topicDirectionFor(ctx: Ctx, intentHint?: string): ContentTopicDirection | undefined {
    const directions = ctx.strategy.contentStrategy.topicDirections;
    if (directions.length === 0) return undefined;
    const stageMatches = directions.filter((d) => d.funnelStage === ctx.mappedStage);
    const pool = stageMatches.length > 0 ? stageMatches : directions;
    const intentMatches = intentHint ? pool.filter((d) => d.intent === intentHint) : [];
    const finalPool = intentMatches.length > 0 ? intentMatches : pool;
    return [...finalPool].sort((a, b) => b.priorityScore - a.priorityScore)[0];
  }

  private messagingPillarByTheme(ctx: Ctx, themeSubstring: string): MessagingPillar | undefined {
    return ctx.strategy.messaging.pillars.find((p) => p.theme.toLowerCase().includes(themeSubstring));
  }

  private hasInsufficientProofFriction(ctx: Ctx): boolean {
    return ctx.strategy.conversionStrategy.frictions.some((f) => f.type === 'insufficient_proof');
  }

  private hasActionUncertaintyFriction(ctx: Ctx): boolean {
    return ctx.strategy.conversionStrategy.frictions.some((f) => f.type === 'action_uncertainty');
  }

  private findConversionAction(ctx: Ctx): ConversionAction | undefined {
    return ctx.strategy.conversionStrategy.actions.find((a) => ALLOWED_CONVERSION_DIRECTIONS.includes(a.type));
  }

  private findAcquisitionMotion(ctx: Ctx, matchTypes: string[]): AcquisitionMotion | undefined {
    return ctx.strategy.acquisitionStrategy.motions.find((m) => matchTypes.includes(m.type));
  }

  // --- awareness / education / consideration / positioning ---

  private ruleSeoTopicCoverage(ctx: Ctx): RawActivity | null {
    if (!['awareness', 'education', 'consideration', 'positioning', 'differentiation'].includes(ctx.goalType)) return null;
    if (!ctx.allowedChannels.has('seo')) return null;
    const direction = this.topicDirectionFor(ctx);
    if (!direction) return null;

    const channelFit = ctx.mapping.channels.find((c) => c.channel === 'seo');
    return {
      key: 'seo_topic_coverage',
      type: 'seo',
      title: `Establish search coverage for "${direction.title}"`,
      objective: 'Build organic search visibility for a core topic relevant to this goal.',
      channel: 'seo',
      audienceSegmentIds: this.resolveAudiences(ctx, direction.audienceSegmentIds),
      funnelStage: ctx.mappedStage,
      messagingPillarIds: [],
      contentPillarIds: [direction.contentPillarId],
      keywordDirections: direction.keywords.slice(0, this.getMaxKeywords()),
      recommendedActions: ['Map target keywords to page/content structure', 'Identify on-page optimization opportunities'],
      dependencyKeys: [],
      weekHint: 1,
      reasons: [`Topic direction "${direction.title}" is evidenced by Sprint 12 content strategy.`, ...direction.reasons.slice(0, 1)],
      warnings: this.audienceNote(ctx),
      channelFitScore: channelFit?.fitScore,
      channelConfidence: channelFit?.confidenceScore,
      audienceRelevanceScores: [],
      audienceConfidences: [],
      supportPriorityScores: [direction.priorityScore],
      supportConfidences: [direction.confidenceScore],
    };
  }

  private ruleBlogGuidePrep(ctx: Ctx): RawActivity | null {
    if (!['awareness', 'education', 'consideration'].includes(ctx.goalType)) return null;
    if (!ctx.allowedChannels.has('content')) return null;
    const supportsGuideFormat = ctx.strategy.contentStrategy.formats.some((f) => f.format === 'guide' || f.format === 'blog');
    if (!supportsGuideFormat) return null;
    const direction = this.topicDirectionFor(ctx, 'educational');
    if (!direction) return null;

    const formatRec = ctx.strategy.contentStrategy.formats.find((f) => f.format === 'guide') ?? ctx.strategy.contentStrategy.formats.find((f) => f.format === 'blog');
    const channelFit = ctx.mapping.channels.find((c) => c.channel === 'content');
    return {
      key: 'blog_guide_prep',
      type: 'blog',
      title: `Create an educational guide around "${direction.title}"`,
      objective: 'Establish educational content that supports this goal.',
      channel: 'content',
      audienceSegmentIds: this.resolveAudiences(ctx, direction.audienceSegmentIds),
      funnelStage: ctx.mappedStage,
      messagingPillarIds: [],
      contentPillarIds: [direction.contentPillarId],
      keywordDirections: direction.keywords.slice(0, this.getMaxKeywords()),
      contentFormat: formatRec?.format,
      recommendedActions: ['Outline core sections and learning objectives', 'Reference identified pain points/JTBD in framing'],
      dependencyKeys: [],
      weekHint: 1,
      reasons: [`Content pillar/topic direction "${direction.title}" is evidenced upstream.`],
      warnings: this.audienceNote(ctx),
      channelFitScore: channelFit?.fitScore,
      channelConfidence: channelFit?.confidenceScore,
      audienceRelevanceScores: [],
      audienceConfidences: [],
      supportPriorityScores: [direction.priorityScore, formatRec?.priorityScore ?? direction.priorityScore],
      supportConfidences: [direction.confidenceScore, formatRec?.confidenceScore ?? direction.confidenceScore],
    };
  }

  private ruleContentDistribution(ctx: Ctx): RawActivity | null {
    if (!['awareness', 'education'].includes(ctx.goalType)) return null;
    if (!ctx.allowedChannels.has('organic_social')) return null;
    const direction = this.topicDirectionFor(ctx, 'educational');
    if (!direction) return null;

    const channelFit = ctx.mapping.channels.find((c) => c.channel === 'organic_social');
    return {
      key: 'content_distribution',
      type: 'social',
      title: `Distribute "${direction.title}" guide via organic social`,
      objective: 'Extend reach of prepared educational content through organic distribution.',
      channel: 'organic_social',
      audienceSegmentIds: this.resolveAudiences(ctx, direction.audienceSegmentIds),
      funnelStage: ctx.mappedStage,
      messagingPillarIds: [],
      contentPillarIds: [direction.contentPillarId],
      keywordDirections: [],
      recommendedActions: ['Adapt guide into shareable social snippets', 'Schedule distribution across primary social profile(s)'],
      dependencyKeys: ['blog_guide_prep'],
      weekHint: 2,
      reasons: ['Distribution follows prepared educational content.'],
      warnings: this.audienceNote(ctx),
      channelFitScore: channelFit?.fitScore,
      channelConfidence: channelFit?.confidenceScore,
      audienceRelevanceScores: [],
      audienceConfidences: [],
      supportPriorityScores: [direction.priorityScore],
      supportConfidences: [direction.confidenceScore],
    };
  }

  private ruleComparisonEvaluationContent(ctx: Ctx): RawActivity | null {
    if (!['consideration', 'positioning', 'differentiation'].includes(ctx.goalType)) return null;
    if (!ctx.allowedChannels.has('content')) return null;
    const supportsComparison = ctx.strategy.contentStrategy.formats.some((f) => f.format === 'comparison_page');
    if (!supportsComparison) return null;
    const pillar = ctx.strategy.contentStrategy.pillars.find((p) => p.theme.toLowerCase().includes('differentiation')) ?? ctx.strategy.contentStrategy.pillars[0];
    if (!pillar) return null;

    const messagingPillar = this.messagingPillarByTheme(ctx, 'differentiation');
    const channelFit = ctx.mapping.channels.find((c) => c.channel === 'content');
    return {
      key: 'comparison_evaluation_content',
      type: 'landing_page',
      title: `Build a comparison/evaluation page highlighting "${pillar.title}"`,
      objective: 'Support buyer evaluation with a comparison/differentiation asset.',
      channel: 'content',
      audienceSegmentIds: this.resolveAudiences(ctx, pillar.targetAudienceSegmentIds),
      funnelStage: ctx.mappedStage,
      messagingPillarIds: messagingPillar ? [messagingPillar.id] : [],
      contentPillarIds: [pillar.id],
      keywordDirections: pillar.supportingKeywords.slice(0, this.getMaxKeywords()),
      contentFormat: 'comparison_page',
      recommendedActions: ['Identify the comparison dimensions buyers care about most', 'Frame differentiation around evidenced product differentiators'],
      dependencyKeys: [],
      weekHint: 2,
      reasons: [`Content pillar "${pillar.title}" supports evaluation-stage differentiation.`],
      warnings: this.audienceNote(ctx),
      channelFitScore: channelFit?.fitScore,
      channelConfidence: channelFit?.confidenceScore,
      audienceRelevanceScores: [],
      audienceConfidences: [],
      supportPriorityScores: [pillar.priorityScore, ...(messagingPillar ? [messagingPillar.priorityScore] : [])],
      supportConfidences: [pillar.confidenceScore, ...(messagingPillar ? [messagingPillar.confidenceScore] : [])],
    };
  }

  // --- lead generation / conversion ---

  private ruleLandingPrep(ctx: Ctx): RawActivity | null {
    if (!['lead_generation', 'conversion'].includes(ctx.goalType)) return null;
    const channel = ctx.allowedChannels.has('paid_search') ? 'paid_search' : ctx.allowedChannels.has('paid_social') ? 'paid_social' : undefined;
    if (!channel) return null;

    const conversionAction = this.findConversionAction(ctx);
    const channelFit = ctx.mapping.channels.find((c) => c.channel === channel);
    return {
      key: 'landing_prep',
      type: 'landing_page',
      title: 'Prepare a lead-capture landing page aligned to the campaign goal',
      objective: 'Ready a conversion-supporting landing experience before launching paid distribution.',
      channel,
      audienceSegmentIds: this.resolveAudiences(ctx, ctx.allowedAudiences),
      funnelStage: ctx.mappedStage,
      messagingPillarIds: [],
      contentPillarIds: [],
      keywordDirections: [],
      recommendedActions: ['Align landing page messaging to the campaign goal', 'Ensure a single clear supported conversion action'],
      conversionDirection: conversionAction?.type,
      dependencyKeys: [],
      weekHint: 1,
      reasons: ['A supported conversion path exists to justify landing-page investment.'],
      warnings: this.audienceNote(ctx),
      channelFitScore: channelFit?.fitScore,
      channelConfidence: channelFit?.confidenceScore,
      audienceRelevanceScores: [],
      audienceConfidences: [],
      supportPriorityScores: conversionAction ? [conversionAction.priorityScore] : [],
      supportConfidences: conversionAction ? [conversionAction.confidenceScore] : [],
    };
  }

  private rulePaidSearchLaunch(ctx: Ctx): RawActivity | null {
    if (!['lead_generation', 'conversion'].includes(ctx.goalType)) return null;
    if (!ctx.allowedChannels.has('paid_search')) return null;
    const motion = this.findAcquisitionMotion(ctx, ['paid_search']);
    if (!motion) return null;

    const channelFit = ctx.mapping.channels.find((c) => c.channel === 'paid_search');
    return {
      key: 'paid_search_launch',
      type: 'paid_search',
      title: 'Launch paid search targeting high-intent keywords',
      objective: 'Drive qualified traffic through supported paid search targeting.',
      channel: 'paid_search',
      audienceSegmentIds: this.resolveAudiences(ctx, motion.targetAudienceSegmentIds),
      funnelStage: ctx.mappedStage,
      messagingPillarIds: [],
      contentPillarIds: [],
      keywordDirections: motion.supportingKeywords.slice(0, this.getMaxKeywords()),
      recommendedActions: motion.recommendedActions.slice(0, this.getMaxActionsPerActivity()),
      dependencyKeys: ['landing_prep'],
      weekHint: 2,
      reasons: [`Acquisition motion "${motion.title}" supports paid search.`],
      warnings: this.audienceNote(ctx),
      channelFitScore: channelFit?.fitScore,
      channelConfidence: channelFit?.confidenceScore,
      audienceRelevanceScores: [],
      audienceConfidences: [],
      supportPriorityScores: [motion.priorityScore],
      supportConfidences: [motion.confidenceScore],
    };
  }

  private rulePaidSocialLaunch(ctx: Ctx): RawActivity | null {
    if (!['awareness', 'lead_generation'].includes(ctx.goalType)) return null;
    if (!ctx.allowedChannels.has('paid_social')) return null;
    const motion = this.findAcquisitionMotion(ctx, ['paid_social']);
    if (!motion) return null;

    const channelFit = ctx.mapping.channels.find((c) => c.channel === 'paid_social');
    return {
      key: 'paid_social_launch',
      type: 'paid_social',
      title: 'Launch paid social targeting the defined audience',
      objective: 'Extend reach and qualified engagement through supported paid social targeting.',
      channel: 'paid_social',
      audienceSegmentIds: this.resolveAudiences(ctx, motion.targetAudienceSegmentIds),
      funnelStage: ctx.mappedStage,
      messagingPillarIds: [],
      contentPillarIds: [],
      keywordDirections: [],
      recommendedActions: motion.recommendedActions.slice(0, this.getMaxActionsPerActivity()),
      dependencyKeys: [],
      weekHint: 2,
      reasons: [`Acquisition motion "${motion.title}" supports paid social.`],
      warnings: this.audienceNote(ctx),
      channelFitScore: channelFit?.fitScore,
      channelConfidence: channelFit?.confidenceScore,
      audienceRelevanceScores: [],
      audienceConfidences: [],
      supportPriorityScores: [motion.priorityScore],
      supportConfidences: [motion.confidenceScore],
    };
  }

  private ruleOutboundMessagingPrep(ctx: Ctx): RawActivity | null {
    if (!['lead_generation', 'conversion'].includes(ctx.goalType)) return null;
    if (!ctx.allowedChannels.has('outbound')) return null;
    const buyerPillar = this.messagingPillarByTheme(ctx, 'buyer');
    const motion = this.findAcquisitionMotion(ctx, ['outbound']);
    if (!buyerPillar && !motion) return null;

    const channelFit = ctx.mapping.channels.find((c) => c.channel === 'outbound');
    return {
      key: 'outbound_messaging_prep',
      type: 'outbound',
      title: 'Prepare buyer-focused outbound messaging and target list',
      objective: 'Ready outbound targeting and messaging before initiating outreach.',
      channel: 'outbound',
      audienceSegmentIds: this.resolveAudiences(ctx, buyerPillar?.targetAudienceSegmentIds ?? motion?.targetAudienceSegmentIds ?? []),
      funnelStage: ctx.mappedStage,
      messagingPillarIds: buyerPillar ? [buyerPillar.id] : [],
      contentPillarIds: [],
      keywordDirections: [],
      recommendedActions: ['Build a target account/contact list matching the buyer profile', 'Draft outbound messaging around the buyer-confidence theme'],
      dependencyKeys: [],
      weekHint: 1,
      reasons: dedupeStrings([buyerPillar ? `Messaging pillar "${buyerPillar.title}" supports buyer-focused outbound.` : '', motion ? `Acquisition motion "${motion.title}" supports outbound.` : '']),
      warnings: this.audienceNote(ctx),
      channelFitScore: channelFit?.fitScore,
      channelConfidence: channelFit?.confidenceScore,
      audienceRelevanceScores: [],
      audienceConfidences: [],
      supportPriorityScores: [buyerPillar?.priorityScore, motion?.priorityScore].filter((v): v is number => v !== undefined),
      supportConfidences: [buyerPillar?.confidenceScore, motion?.confidenceScore].filter((v): v is number => v !== undefined),
    };
  }

  private ruleOutboundSend(ctx: Ctx): RawActivity | null {
    if (!['lead_generation'].includes(ctx.goalType)) return null;
    if (!ctx.allowedChannels.has('outbound')) return null;

    const channelFit = ctx.mapping.channels.find((c) => c.channel === 'outbound');
    return {
      key: 'outbound_send',
      type: 'outbound',
      title: 'Begin outbound outreach using prepared buyer messaging',
      objective: 'Initiate direct outreach toward qualified buyer contacts.',
      channel: 'outbound',
      audienceSegmentIds: this.resolveAudiences(ctx, ctx.allowedAudiences),
      funnelStage: ctx.mappedStage,
      messagingPillarIds: [],
      contentPillarIds: [],
      keywordDirections: [],
      recommendedActions: ['Send initial outreach sequence', 'Track response and qualification rate'],
      dependencyKeys: ['outbound_messaging_prep', 'proof_prep'],
      weekHint: 2,
      reasons: ['Outreach follows prepared buyer messaging and (where available) proof material.'],
      warnings: this.audienceNote(ctx),
      channelFitScore: channelFit?.fitScore,
      channelConfidence: channelFit?.confidenceScore,
      audienceRelevanceScores: [],
      audienceConfidences: [],
      supportPriorityScores: [],
      supportConfidences: [],
    };
  }

  private ruleEmailNurture(ctx: Ctx): RawActivity | null {
    if (!['lead_generation', 'conversion'].includes(ctx.goalType)) return null;
    if (!ctx.allowedChannels.has('email')) return null;
    const motion = this.findAcquisitionMotion(ctx, ['email_nurture']);
    const buyerPillar = this.messagingPillarByTheme(ctx, 'buyer');
    if (!motion && !buyerPillar) return null;

    const channelFit = ctx.mapping.channels.find((c) => c.channel === 'email');
    return {
      key: 'email_nurture',
      type: 'email',
      title: 'Launch an email nurture sequence for captured leads',
      objective: 'Nurture captured leads toward the supported conversion action.',
      channel: 'email',
      audienceSegmentIds: this.resolveAudiences(ctx, motion?.targetAudienceSegmentIds ?? ctx.allowedAudiences),
      funnelStage: ctx.mappedStage,
      messagingPillarIds: buyerPillar ? [buyerPillar.id] : [],
      contentPillarIds: [],
      keywordDirections: [],
      recommendedActions: ['Draft a short nurture sequence tied to the campaign goal', 'Segment by lead source where possible'],
      dependencyKeys: ['landing_prep'],
      weekHint: 3,
      reasons: dedupeStrings([motion ? `Acquisition motion "${motion.title}" supports email nurture.` : '', buyerPillar ? `Messaging pillar "${buyerPillar.title}" supports nurture messaging.` : '']),
      warnings: this.audienceNote(ctx),
      channelFitScore: channelFit?.fitScore,
      channelConfidence: channelFit?.confidenceScore,
      audienceRelevanceScores: [],
      audienceConfidences: [],
      supportPriorityScores: [motion?.priorityScore, buyerPillar?.priorityScore].filter((v): v is number => v !== undefined),
      supportConfidences: [motion?.confidenceScore, buyerPillar?.confidenceScore].filter((v): v is number => v !== undefined),
    };
  }

  // --- proof / conversion ---

  private ruleProofPrep(ctx: Ctx): RawActivity | null {
    if (!this.hasInsufficientProofFriction(ctx)) return null;
    if (!ctx.primaryChannel) return null;

    const friction = ctx.strategy.conversionStrategy.frictions.find((f) => f.type === 'insufficient_proof');
    const channelFit = ctx.mapping.channels.find((c) => c.channel === ctx.primaryChannel);
    return {
      key: 'proof_prep',
      type: 'proof',
      title: 'Prepare validated product proof/evaluation material',
      objective: 'Close the identified proof gap before it is used in conversion messaging.',
      channel: ctx.primaryChannel,
      audienceSegmentIds: this.resolveAudiences(ctx, ctx.allowedAudiences),
      funnelStage: ctx.mappedStage,
      messagingPillarIds: [],
      contentPillarIds: [],
      keywordDirections: [],
      recommendedActions: (friction?.recommendedResponses ?? ['Collect and validate real customer proof before using it in conversion messaging.']).slice(0, this.getMaxActionsPerActivity()),
      dependencyKeys: [],
      weekHint: 1,
      reasons: ['Conversion strategy identified an insufficient-proof friction with no fabricated substitute.'],
      warnings: this.audienceNote(ctx),
      channelFitScore: channelFit?.fitScore,
      channelConfidence: channelFit?.confidenceScore,
      audienceRelevanceScores: [],
      audienceConfidences: [],
      supportPriorityScores: friction ? [friction.severityScore] : [],
      supportConfidences: friction ? [friction.confidenceScore] : [],
    };
  }

  private ruleProofConversionSurface(ctx: Ctx): RawActivity | null {
    if (!['conversion', 'lead_generation'].includes(ctx.goalType)) return null;
    if (!ctx.primaryChannel) return null;
    const conversionAction = this.findConversionAction(ctx);
    if (!conversionAction) return null;

    const channelFit = ctx.mapping.channels.find((c) => c.channel === ctx.primaryChannel);
    return {
      key: 'proof_conversion_surface',
      type: 'conversion',
      title: 'Apply proof material to consideration/conversion surfaces',
      objective: 'Use validated proof to support the supported conversion action.',
      channel: ctx.primaryChannel,
      audienceSegmentIds: this.resolveAudiences(ctx, conversionAction.targetAudienceSegmentIds),
      funnelStage: ctx.mappedStage,
      messagingPillarIds: [],
      contentPillarIds: [],
      keywordDirections: [],
      recommendedActions: ['Place validated proof near the conversion action', 'Confirm proof aligns with the target audience’s stated concerns'],
      conversionDirection: conversionAction.type,
      dependencyKeys: ['proof_prep'],
      weekHint: 3,
      reasons: [`Supported conversion action "${conversionAction.label}" benefits from validated proof.`],
      warnings: this.audienceNote(ctx),
      channelFitScore: channelFit?.fitScore,
      channelConfidence: channelFit?.confidenceScore,
      audienceRelevanceScores: [],
      audienceConfidences: [],
      supportPriorityScores: [conversionAction.priorityScore],
      supportConfidences: [conversionAction.confidenceScore],
    };
  }

  private ruleConversionCtaImprovement(ctx: Ctx): RawActivity | null {
    if (ctx.goalType !== 'conversion') return null;
    if (!ctx.primaryChannel) return null;
    if (!this.hasActionUncertaintyFriction(ctx)) return null;
    const conversionAction = this.findConversionAction(ctx);
    if (!conversionAction) return null;

    const channelFit = ctx.mapping.channels.find((c) => c.channel === ctx.primaryChannel);
    return {
      key: 'conversion_cta_improvement',
      type: 'conversion',
      title: 'Improve CTA clarity and reduce action uncertainty on the conversion path',
      objective: 'Reduce the identified action-uncertainty friction on the supported conversion path.',
      channel: ctx.primaryChannel,
      audienceSegmentIds: this.resolveAudiences(ctx, conversionAction.targetAudienceSegmentIds),
      funnelStage: ctx.mappedStage,
      messagingPillarIds: [],
      contentPillarIds: [],
      keywordDirections: [],
      recommendedActions: ['Clarify the single next action expected of the visitor', 'Remove or resolve ambiguous choices near the CTA'],
      conversionDirection: conversionAction.type,
      dependencyKeys: ['landing_prep'],
      weekHint: 3,
      reasons: ['Conversion strategy identified an action-uncertainty friction on this path.'],
      warnings: this.audienceNote(ctx),
      channelFitScore: channelFit?.fitScore,
      channelConfidence: channelFit?.confidenceScore,
      audienceRelevanceScores: [],
      audienceConfidences: [],
      supportPriorityScores: [conversionAction.priorityScore],
      supportConfidences: [conversionAction.confidenceScore],
    };
  }

  // --- activation ---

  private ruleOnboardingActivation(ctx: Ctx): RawActivity | null {
    if (ctx.goalType !== 'activation') return null;
    if (!ctx.allowedChannels.has('product_led')) return null;
    const conversionAction = ctx.strategy.conversionStrategy.actions.find((a) => a.type === 'activation');

    const channelFit = ctx.mapping.channels.find((c) => c.channel === 'product_led');
    return {
      key: 'onboarding_activation',
      type: 'activation',
      title: 'Improve first-run onboarding toward the first-value action',
      objective: 'Guide new users to their first-value action through the product experience.',
      channel: 'product_led',
      audienceSegmentIds: this.resolveAudiences(ctx, conversionAction?.targetAudienceSegmentIds ?? ctx.allowedAudiences),
      funnelStage: ctx.mappedStage,
      messagingPillarIds: [],
      contentPillarIds: [],
      keywordDirections: [],
      recommendedActions: ['Map the shortest path to the first-value action', 'Identify and remove onboarding friction points'],
      conversionDirection: conversionAction?.type,
      dependencyKeys: [],
      weekHint: 2,
      reasons: ['Product-led channel evidence supports self-serve onboarding improvement.'],
      warnings: this.audienceNote(ctx),
      channelFitScore: channelFit?.fitScore,
      channelConfidence: channelFit?.confidenceScore,
      audienceRelevanceScores: [],
      audienceConfidences: [],
      supportPriorityScores: conversionAction ? [conversionAction.priorityScore] : [],
      supportConfidences: conversionAction ? [conversionAction.confidenceScore] : [],
    };
  }

  // --- community / partnerships ---

  private ruleCommunityEngagement(ctx: Ctx): RawActivity | null {
    if (!['awareness', 'education', 'positioning'].includes(ctx.goalType)) return null;
    if (!ctx.allowedChannels.has('community')) return null;

    const channelFit = ctx.mapping.channels.find((c) => c.channel === 'community');
    return {
      key: 'community_engagement',
      type: 'community',
      title: 'Engage target community spaces with educational/positioning content',
      objective: 'Build presence and credibility in spaces the target audience already participates in.',
      channel: 'community',
      audienceSegmentIds: this.resolveAudiences(ctx, ctx.allowedAudiences),
      funnelStage: ctx.mappedStage,
      messagingPillarIds: [],
      contentPillarIds: [],
      keywordDirections: [],
      recommendedActions: ['Identify 2-3 relevant community spaces', 'Share educational value before any promotional mention'],
      dependencyKeys: [],
      weekHint: 2,
      reasons: ['Community channel evidence supports this goal.'],
      warnings: this.audienceNote(ctx),
      channelFitScore: channelFit?.fitScore,
      channelConfidence: channelFit?.confidenceScore,
      audienceRelevanceScores: [],
      audienceConfidences: [],
      supportPriorityScores: [],
      supportConfidences: [],
    };
  }

  private rulePartnershipOutreach(ctx: Ctx): RawActivity | null {
    if (!['buyer_enablement', 'consideration'].includes(ctx.goalType)) return null;
    if (!ctx.allowedChannels.has('partnerships')) return null;

    const channelFit = ctx.mapping.channels.find((c) => c.channel === 'partnerships');
    return {
      key: 'partnership_outreach',
      type: 'partnership',
      title: 'Identify and reach out to complementary partnership opportunities',
      objective: 'Extend evaluation-stage reach through complementary partnerships.',
      channel: 'partnerships',
      audienceSegmentIds: this.resolveAudiences(ctx, ctx.allowedAudiences),
      funnelStage: ctx.mappedStage,
      messagingPillarIds: [],
      contentPillarIds: [],
      keywordDirections: [],
      recommendedActions: ['Shortlist complementary partners', 'Propose a mutually beneficial collaboration'],
      dependencyKeys: [],
      weekHint: 3,
      reasons: ['Partnerships channel evidence supports this goal.'],
      warnings: this.audienceNote(ctx),
      channelFitScore: channelFit?.fitScore,
      channelConfidence: channelFit?.confidenceScore,
      audienceRelevanceScores: [],
      audienceConfidences: [],
      supportPriorityScores: [],
      supportConfidences: [],
    };
  }

  // --- measurement ---

  private ruleMeasurementReview(ctx: Ctx): RawActivity | null {
    // Gated implicitly: only meaningful once at least one other activity
    // exists — enforced after generation by dropping it if it ends up alone.
    return {
      key: 'measurement_review',
      type: 'measurement',
      title: 'Review campaign tracking readiness and early signals',
      objective: 'Confirm measurement readiness and capture learnings for the next planning cycle.',
      channel: 'measurement',
      audienceSegmentIds: [],
      funnelStage: ctx.mappedStage,
      messagingPillarIds: [],
      contentPillarIds: [],
      keywordDirections: [],
      recommendedActions: [
        'Verify UTM/tracking parameters are in place for each active channel',
        'Review engagement and conversion signals against expected success signals',
        'Capture learnings for the next planning cycle',
      ],
      dependencyKeys: [],
      weekHint: 'review',
      reasons: ['A review checkpoint is included whenever the campaign has active generated activity.'],
      warnings: [],
      audienceRelevanceScores: [],
      audienceConfidences: [],
      supportPriorityScores: [],
      supportConfidences: [],
    };
  }

  // ---------------------------------------------------------------------
  // Dedup
  // ---------------------------------------------------------------------

  private dedupeRaw(items: RawActivity[]): RawActivity[] {
    const byKey = new Map<string, RawActivity>();
    for (const item of items) {
      if (!byKey.has(item.key)) byKey.set(item.key, item);
    }
    // Drop the measurement checkpoint if it would be the only activity —
    // reviewing nothing is not a meaningful activity.
    const withoutMeasurement = Array.from(byKey.values()).filter((a) => a.type !== 'measurement');
    if (withoutMeasurement.length === 0) return [];
    const measurement = byKey.get('measurement_review');
    return measurement ? [...withoutMeasurement, measurement] : withoutMeasurement;
  }

  // ---------------------------------------------------------------------
  // Scoring
  // ---------------------------------------------------------------------

  private scoreActivity(raw: RawActivity, ctx: Ctx): CampaignActivity & { key: string; dependencyKeys: string[]; weekHint: WeekHint } {
    const isPrimaryChannel = raw.channel === ctx.primaryChannel;
    const alignmentScore = raw.type === 'measurement' ? 85 : isPrimaryChannel ? 100 : 80;

    const dims: { weight: number; value: number }[] = [
      { weight: 0.3, value: alignmentScore },
      { weight: 0.05, value: raw.dependencyKeys.length === 0 ? 100 : 60 },
    ];
    if (raw.channelFitScore !== undefined || raw.audienceRelevanceScores.length > 0) {
      const values = [...(raw.channelFitScore !== undefined ? [raw.channelFitScore] : []), ...raw.audienceRelevanceScores];
      dims.push({ weight: 0.25, value: mean(values) });
    }
    const funnelStageStrategy = ctx.strategy.funnel.stages.find((s) => s.stage === raw.funnelStage);
    if (funnelStageStrategy) dims.push({ weight: 0.15, value: funnelStageStrategy.priorityScore });
    if (raw.supportPriorityScores.length > 0) {
      dims.push({ weight: 0.15, value: mean(raw.supportPriorityScores) });
    }
    const initiativeType = ACTIVITY_TO_INITIATIVE_TYPE[raw.type];
    const phase1Initiative = initiativeType
      ? ctx.strategy.growthPlan.initiatives.find((i) => i.phase === 'days_1_30' && i.type === initiativeType)
      : undefined;
    if (phase1Initiative) dims.push({ weight: 0.1, value: phase1Initiative.priorityScore });

    const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0);
    const priorityScore = clamp(Math.round(dims.reduce((sum, d) => sum + d.weight * d.value, 0) / totalWeight), 0, 100);

    const confDims: { weight: number; value: number }[] = [{ weight: 0.4, value: ctx.goal.confidenceScore ?? 50 }];
    if (raw.channelConfidence !== undefined) confDims.push({ weight: 0.25, value: raw.channelConfidence });
    if (raw.audienceConfidences.length > 0) confDims.push({ weight: 0.15, value: mean(raw.audienceConfidences) });
    if (raw.supportConfidences.length > 0) confDims.push({ weight: 0.2, value: mean(raw.supportConfidences) });
    const confTotalWeight = confDims.reduce((sum, d) => sum + d.weight, 0);
    const sourceCount = [true, raw.channelConfidence !== undefined, raw.audienceConfidences.length > 0, raw.supportConfidences.length > 0].filter(Boolean).length;
    const diversityBonus = Math.min((sourceCount - 1) * 3, 9);
    const confidenceScore = clamp(Math.round(confDims.reduce((sum, d) => sum + d.weight * d.value, 0) / confTotalWeight + diversityBonus), 0, 100);

    return {
      id: `act-${raw.key}`,
      day: 0,
      week: 0,
      type: raw.type,
      title: raw.title,
      objective: raw.objective,
      channel: raw.channel,
      audienceSegmentIds: raw.audienceSegmentIds,
      funnelStage: raw.funnelStage,
      messagingPillarIds: raw.messagingPillarIds,
      contentPillarIds: raw.contentPillarIds,
      keywordDirections: raw.keywordDirections.slice(0, this.getMaxKeywords()),
      contentFormat: raw.contentFormat,
      recommendedActions: dedupeStrings(raw.recommendedActions).slice(0, this.getMaxActionsPerActivity()),
      conversionDirection: raw.conversionDirection,
      priorityScore,
      confidenceScore,
      dependencies: [],
      successSignals: SUCCESS_SIGNALS_BY_TYPE[raw.type],
      status: 'planned',
      reasons: dedupeStrings(raw.reasons),
      warnings: dedupeStrings(raw.warnings),
      key: raw.key,
      dependencyKeys: raw.dependencyKeys,
      weekHint: raw.weekHint,
    };
  }

  // ---------------------------------------------------------------------
  // Scheduling
  // ---------------------------------------------------------------------

  private assignSchedule(
    scored: (CampaignActivity & { key: string; dependencyKeys: string[]; weekHint: WeekHint })[],
  ): { activities: CampaignActivity[]; weeks: CampaignWeekPlan[] } {
    const byWeek = new Map<number, typeof scored>();
    for (const activity of scored) {
      const week = WEEK_HINT_TO_NUMBER[activity.weekHint];
      const list = byWeek.get(week) ?? [];
      list.push(activity);
      byWeek.set(week, list);
    }

    const maxPerWeek = this.getMaxActivitiesPerWeek();
    const keyToId = new Map(scored.map((a) => [a.key, a.id]));
    const finalActivities: CampaignActivity[] = [];
    const weeks: CampaignWeekPlan[] = [];

    for (const week of [1, 2, 3, 4, 5]) {
      const weekActivities = (byWeek.get(week) ?? []).sort((a, b) => b.priorityScore - a.priorityScore || a.key.localeCompare(b.key)).slice(0, maxPerWeek);
      if (weekActivities.length === 0) continue;

      const def = WEEK_DEFS[week];
      const activityIds: string[] = [];
      weekActivities.forEach((activity, index) => {
        const day = def.days[Math.floor((index * def.days.length) / weekActivities.length)];
        const resolvedDependencies = dedupeStrings(activity.dependencyKeys.map((k) => keyToId.get(k) ?? '').filter((v) => v.length > 0));
        finalActivities.push({ ...activity, day, week, dependencies: resolvedDependencies });
        activityIds.push(activity.id);
      });

      weeks.push({
        week,
        days: def.days,
        theme: def.theme,
        objective: def.objective,
        activityIds,
        confidenceScore: Math.round(mean(weekActivities.map((a) => a.confidenceScore))),
      });
    }

    return { activities: finalActivities, weeks };
  }

  // ---------------------------------------------------------------------
  // Manual accessors used by orchestration
  // ---------------------------------------------------------------------

  async generatePlanForCampaign(organizationId: string, productId: string, campaignId: string, userId: string): Promise<CampaignResponse> {
    const product = await this.productsService.findOne(organizationId, productId, userId);
    const campaign = await this.campaignsService.findCampaignDoc(organizationId, productId, campaignId);

    if (!campaign.goal) {
      throw new BadRequestException('Define a campaign goal before generating a 30-day plan.');
    }
    if (!campaign.audienceChannelMapping || (campaign.audienceChannelMapping.audiences.length === 0 && campaign.audienceChannelMapping.channels.length === 0)) {
      throw new BadRequestException('Define an audience/channel mapping before generating a 30-day plan.');
    }

    // Cheap pre-check first — avoids the expensive strategy rebuild entirely
    // when nothing has ever been approved. Same current-version semantics as
    // 13B/13C: staleness is judged against the underlying product's own
    // updatedAt, never against a freshly rebuilt (always "now") timestamp.
    const review = await this.growthStrategyReviewService.getReview(organizationId, productId, userId);
    if (review.status !== 'approved') {
      throw new ConflictException('Approve the current Growth Strategy before generating a 30-day campaign plan.');
    }

    const productUpdatedAt: Date = (product as { updatedAt?: Date }).updatedAt ?? new Date(0);
    const stillApproved = await this.growthStrategyReviewService.isStrategyApprovedForCurrentVersion(organizationId, productId, userId, productUpdatedAt);
    if (!stillApproved) {
      throw new ConflictException('The product has changed since the Growth Strategy was last approved. Review and approve it again before generating a 30-day campaign plan.');
    }

    // Single internal orchestration pass — never multiple preview endpoints.
    const overview = await this.growthStrategyService.buildOverviewForProduct(organizationId, productId, userId);

    // Mongoose subdocuments don't reliably survive a plain object spread
    // (nested array fields can come back undefined) — round-trip through
    // JSON for a guaranteed plain object; neither type carries Date fields
    // that generate() reads, so the string round-trip is safe here.
    const mappingPlain: CampaignAudienceChannelMapping = JSON.parse(JSON.stringify(campaign.audienceChannelMapping));
    const goalPlain: CampaignGoal = JSON.parse(JSON.stringify(campaign.goal));
    const plan = this.generate({
      campaign: { channelIds: campaign.channelIds, audienceSegmentIds: campaign.audienceSegmentIds },
      goal: goalPlain,
      audienceChannelMapping: { ...mappingPlain, confidenceScore: mappingPlain.confidenceScore ?? 0 },
      approvedStrategy: {
        funnel: overview.funnel,
        messaging: overview.messaging,
        contentStrategy: overview.contentStrategy,
        acquisitionStrategy: overview.acquisitionStrategy,
        conversionStrategy: overview.conversionStrategy,
        growthPlan: overview.growthPlan,
      },
    });

    if (!plan) {
      throw new UnprocessableEntityException('Current campaign goal and strategy evidence are insufficient to generate a reliable 30-day campaign plan.');
    }

    campaign.plan = plan;
    if (campaign.status === 'draft') campaign.status = 'planned';
    campaign.planningMetadata.version += 1;
    campaign.strategyReference = {
      reviewedStrategyGeneratedAt: new Date(overview.generatedAt),
      strategyReviewId: review.id ? new Types.ObjectId(review.id) : undefined,
    };
    campaign.updatedBy = new Types.ObjectId(userId);
    await campaign.save();
    return toCampaignResponse(campaign);
  }

  // ---------------------------------------------------------------------
  // Env-configurable limits
  // ---------------------------------------------------------------------

  private getMaxActivities(): number {
    return this.getEnvNumber('CAMPAIGN_PLAN_MAX_ACTIVITIES', DEFAULT_MAX_ACTIVITIES);
  }

  private getMaxActivitiesPerWeek(): number {
    return this.getEnvNumber('CAMPAIGN_PLAN_MAX_ACTIVITIES_PER_WEEK', DEFAULT_MAX_ACTIVITIES_PER_WEEK);
  }

  private getMaxActionsPerActivity(): number {
    return this.getEnvNumber('CAMPAIGN_PLAN_MAX_ACTIONS_PER_ACTIVITY', DEFAULT_MAX_ACTIONS_PER_ACTIVITY);
  }

  private getMaxKeywords(): number {
    return this.getEnvNumber('CAMPAIGN_PLAN_MAX_KEYWORDS_PER_ACTIVITY', DEFAULT_MAX_KEYWORDS_PER_ACTIVITY);
  }

  private getMaxTopPriorities(): number {
    return this.getEnvNumber('CAMPAIGN_PLAN_MAX_TOP_PRIORITIES', DEFAULT_MAX_TOP_PRIORITIES);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
