import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CampaignReviewService } from '../campaigns/campaign-review.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import type { CampaignAudienceChannelMapping } from '../campaigns/types/campaign-audience-channel.types';
import type { CampaignGoal } from '../campaigns/types/campaign-goal.types';
import type { CampaignPlanResult } from '../campaigns/types/campaign-plan.types';
import type { ContentStrategyResult } from '../growth-strategy/types/content-strategy.types';
import type { FunnelStrategyResult } from '../growth-strategy/types/funnel-strategy.types';
import type { MessagingPillar, MessagingStrategyResult } from '../growth-strategy/types/messaging-strategy.types';
import { GrowthStrategyReviewService } from '../growth-strategy/growth-strategy-review.service';
import { GrowthStrategyService } from '../growth-strategy/growth-strategy.service';
import { ProductsService } from '../products/products.service';
import { BlogCalendarService } from './blog-calendar.service';
import { ContentIdeaService } from './content-idea.service';
import { ContentPillarPlanService } from './content-pillar-plan.service';
import { SocialCalendarService } from './social-calendar.service';
import type { BlogCalendarResult } from './types/blog-calendar.types';
import type { ContentIdeaResult } from './types/content-idea.types';
import type { CampaignContentPillar, ContentPillarPlanResult } from './types/content-pillar-plan.types';
import type { RepurposingActionType, RepurposingChain, RepurposingItem, RepurposingPlanResult, RepurposingSourceType, RepurposingTargetType } from './types/repurposing-plan.types';
import type { SocialCalendarResult, SocialContentType } from './types/social-calendar.types';
import type { ContentTopic, TopicPrioritizationResult } from './types/topic-prioritization.types';
import type { VideoCalendarResult, VideoContentType } from './types/video-calendar.types';
import { TopicPrioritizationService } from './topic-prioritization.service';
import { VideoCalendarService } from './video-calendar.service';

const DEFAULT_MAX_ITEMS = 24;
const DEFAULT_MAX_CHAINS = 10;
const DEFAULT_MAX_TARGETS_PER_SOURCE = 3;
const DEFAULT_MAX_TOP_PRIORITY = 8;
const DEFAULT_MIN_SOURCE_PRIORITY = 50;
const SOCIAL_TO_BLOG_MIN_PRIORITY = 70;

const DISCLAIMER = 'Repurposing recommendations are evidence-based planning directions and do not represent final content, publishing instructions, or performance predictions.';

const EXISTING_LINKAGE_BONUS = 5;

// Video content types genuinely suited to a written blog expansion.
const DEEP_EXPLANATION_VIDEO_TYPES: VideoContentType[] = ['explainer', 'use_case', 'comparison', 'differentiation', 'buyer_enablement'];
// Social content types genuinely suited to video adaptation (mirrors 14F's own gate).
const VIDEO_SUITABLE_SOCIAL_TYPES: SocialContentType[] = ['educational', 'problem_insight', 'use_case', 'differentiation', 'comparison', 'thought_leadership'];

const TARGET_DAY_OFFSET: Record<string, number> = {
  'blog->social': 2,
  'blog->video': 4,
  'social->blog': 3,
  'social->video': 3,
  'video->social': 2,
  'video->blog': 5,
};

const ACTION_PHRASES: Record<RepurposingActionType, (topic: string) => string> = {
  summarize: (t) => `Summarize "${t}" into a concise direction`,
  expand: (t) => `Expand "${t}" into deeper coverage`,
  adapt: (t) => `Adapt "${t}" into a new format`,
  extract: (t) => `Extract key points from "${t}"`,
  promote: (t) => `Promote "${t}"`,
  sequence: (t) => `Sequence follow-up content from "${t}"`,
  reframe: (t) => `Reframe "${t}" from a new angle`,
};

type ContentCategory = 'educational' | 'guide' | 'comparison' | 'faq' | 'buyer_enablement';

const CATEGORY_BY_SOURCE_TYPE: Record<string, ContentCategory> = {
  educational: 'educational',
  guide: 'guide',
  explainer: 'guide',
  use_case: 'educational',
  problem_solution: 'educational',
  problem_insight: 'educational',
  comparison: 'comparison',
  differentiation: 'buyer_enablement',
  buyer_enablement: 'buyer_enablement',
  faq: 'faq',
  conversion_support: 'buyer_enablement',
  activation: 'educational',
  thought_leadership: 'educational',
};

const FORMAT_TABLE: Record<RepurposingTargetType, Record<ContentCategory, string>> = {
  blog: { educational: 'educational_blog', guide: 'guide_direction', comparison: 'comparison_article', faq: 'faq_article', buyer_enablement: 'buyer_enablement_article' },
  social: { educational: 'short_post', guide: 'carousel_direction', comparison: 'carousel_direction', faq: 'thread_direction', buyer_enablement: 'image_post_direction' },
  video: { educational: 'short_video', guide: 'explainer_video', comparison: 'comparison_video', faq: 'faq_video', buyer_enablement: 'short_video' },
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

interface SourceAsset {
  sourceType: RepurposingSourceType;
  sourceId: string;
  sourceTitle: string;
  contentCategory: ContentCategory;
  originalType: string;
  pillarId?: string;
  topicId?: string;
  funnelStage: string;
  audienceSegmentIds: string[];
  messagingPillarIds: string[];
  keywords: string[];
  priorityScore: number;
  confidenceScore: number;
  day: number;
  suggestedCTA?: string;
  existingSocialTargetId?: string;
  existingVideoTargetId?: string;
}

export interface RepurposingPlanInput {
  ideas: ContentIdeaResult;
  topics: TopicPrioritizationResult;
  pillars: ContentPillarPlanResult;
  blogCalendar: BlogCalendarResult;
  socialCalendar: SocialCalendarResult;
  videoCalendar: VideoCalendarResult;
  growthStrategy: {
    messaging: MessagingStrategyResult;
    contentStrategy: ContentStrategyResult;
    funnel: FunnelStrategyResult;
  };
  campaign: {
    goal: CampaignGoal;
    audienceChannelMapping: CampaignAudienceChannelMapping;
    channelIds: string[];
    audienceSegmentIds: string[];
  };
  campaignPlan: CampaignPlanResult;
}

/**
 * Cross-channel repurposing plan. `build()` is pure — no fetches, no HTTP
 * calls — so it can be unit-tested directly. Consolidates the campaign's
 * own 14D/14E/14F calendars into explicit source→target relationships,
 * reusing existing calendar linkages rather than duplicating them, and
 * never fabricating a channel, audience, or CTA beyond what's evidenced.
 */
@Injectable()
export class RepurposingPlanService {
  constructor(
    private readonly configService: ConfigService,
    private readonly productsService: ProductsService,
    private readonly campaignsService: CampaignsService,
    private readonly campaignReviewService: CampaignReviewService,
    private readonly growthStrategyService: GrowthStrategyService,
    private readonly growthStrategyReviewService: GrowthStrategyReviewService,
    private readonly contentIdeaService: ContentIdeaService,
    private readonly topicPrioritizationService: TopicPrioritizationService,
    private readonly contentPillarPlanService: ContentPillarPlanService,
    private readonly blogCalendarService: BlogCalendarService,
    private readonly socialCalendarService: SocialCalendarService,
    private readonly videoCalendarService: VideoCalendarService,
  ) {}

  /**
   * PURE. Builds source→target repurposing items and groups them into
   * chains. Never generates a same-channel derivative, never invents a
   * funnel jump beyond what Growth Strategy funnel evidence supports, and
   * always prefers converting an existing 14E/14F linkage over duplicating it.
   */
  build(input: RepurposingPlanInput): RepurposingPlanResult {
    const eligibility = {
      blog: input.campaign.channelIds.includes('seo') || input.campaign.channelIds.includes('content'),
      social: input.campaign.channelIds.includes('organic_social') || input.campaign.channelIds.includes('paid_social'),
      video: input.campaignPlan.activities.some((a) => a.type === 'video') || input.growthStrategy.contentStrategy.formats.some((f) => f.format === 'short_video' || f.format === 'long_video'),
    };
    const eligibleCount = Object.values(eligibility).filter(Boolean).length;

    const pillarById = new Map(input.pillars.pillars.map((p) => [p.id, p]));
    const topicById = new Map(input.topics.topics.map((t) => [t.id, t]));
    const messagingPillarById = new Map(input.growthStrategy.messaging.pillars.map((p) => [p.id, p]));
    const channelFitById = new Map(input.campaign.audienceChannelMapping.channels.map((c) => [c.channel, c]));

    const sources = this.gatherSources(input);

    const items: (RepurposingItem & { sourceOrder: number })[] = [];
    let sourceOrder = 0;
    for (const source of sources) {
      const funnelStageScore = input.growthStrategy.funnel.stages.find((s) => s.stage === source.funnelStage)?.priorityScore;
      const targets = this.targetsForSource(source, eligibility, funnelStageScore !== undefined);
      for (const { targetType, actionType, existing } of targets.slice(0, this.getMaxTargetsPerSource())) {
        const scored = this.scoreItem(source, targetType, actionType, existing, input, pillarById, topicById, messagingPillarById, channelFitById, funnelStageScore);
        items.push({ ...scored, sourceOrder });
      }
      sourceOrder += 1;
    }

    const deduped = this.dedupeAndCap(items);
    const finalItems = deduped.map((item, index) => ({ ...item, id: `repurpose-${index + 1}` }));

    const chains = this.buildChains(finalItems, sources);

    const topPriorityItemIds = [...finalItems]
      .sort((a, b) => b.priorityScore - a.priorityScore || a.id.localeCompare(b.id))
      .slice(0, this.getMaxTopPriority())
      .map((i) => i.id);
    const primaryChainIds = [...chains]
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, Math.ceil(this.getMaxChains() / 2))
      .map((c) => c.id);

    const missingEvidence: string[] = [];
    if (sources.length === 0) missingEvidence.push('No reliable source content was strong enough for repurposing.');
    if (eligibleCount < 2) missingEvidence.push('No reliable cross-channel repurposing opportunities were detected because the campaign currently has insufficient supported channel overlap.');
    if (!eligibility.video) missingEvidence.push('No video support is currently evidenced for this campaign.');
    if (input.campaign.audienceSegmentIds.length === 0) missingEvidence.push('Limited audience mapping is available; some repurposing directions apply broadly.');
    if (sources.length > 0 && eligibleCount >= 2 && finalItems.length === 0) missingEvidence.push('Insufficient cross-channel overlap was found between strong sources and supported target channels.');

    const confidenceScore = finalItems.length ? Math.round(mean(finalItems.map((i) => i.confidenceScore))) : 0;

    return {
      items: finalItems,
      chains,
      topPriorityItemIds,
      primaryChainIds,
      confidenceScore,
      missingEvidence,
      warnings: [DISCLAIMER],
      generatedAt: new Date(),
    };
  }

  // ---------------------------------------------------------------------
  // Source gathering
  // ---------------------------------------------------------------------

  private gatherSources(input: RepurposingPlanInput): SourceAsset[] {
    const minPriority = this.getMinSourcePriority();
    const sources: SourceAsset[] = [];

    for (const b of input.blogCalendar.items) {
      if (b.priorityScore < minPriority) continue;
      sources.push({
        sourceType: 'blog',
        sourceId: b.id,
        sourceTitle: b.title,
        contentCategory: CATEGORY_BY_SOURCE_TYPE[b.type] ?? 'educational',
        originalType: b.type,
        pillarId: b.pillarId,
        topicId: b.topicId,
        funnelStage: b.funnelStage,
        audienceSegmentIds: b.audienceSegmentIds,
        messagingPillarIds: [],
        keywords: dedupeStrings([...(b.primaryKeyword ? [b.primaryKeyword] : []), ...b.supportingKeywords]),
        priorityScore: b.priorityScore,
        confidenceScore: b.confidenceScore,
        day: b.day,
        suggestedCTA: b.suggestedCTA,
        existingSocialTargetId: input.socialCalendar.items.find((s) => s.sourceBlogItemId === b.id)?.id,
        existingVideoTargetId: input.videoCalendar.items.find((v) => v.sourceBlogItemId === b.id)?.id,
      });
    }

    for (const v of input.videoCalendar.items) {
      if (v.type === 'blog_repurpose' || v.type === 'social_repurpose') continue; // never re-repurpose a derivative
      if (v.priorityScore < minPriority) continue;
      sources.push({
        sourceType: 'video',
        sourceId: v.id,
        sourceTitle: v.title,
        contentCategory: CATEGORY_BY_SOURCE_TYPE[v.type] ?? 'educational',
        originalType: v.type,
        pillarId: v.pillarId,
        topicId: v.topicId,
        funnelStage: v.funnelStage,
        audienceSegmentIds: v.audienceSegmentIds,
        messagingPillarIds: v.messagingPillarIds,
        keywords: v.keywords,
        priorityScore: v.priorityScore,
        confidenceScore: v.confidenceScore,
        day: v.day,
        suggestedCTA: v.suggestedCTA,
      });
    }

    for (const s of input.socialCalendar.items) {
      if (s.type === 'blog_promotion') continue; // never re-repurpose a derivative
      if (s.priorityScore < minPriority) continue;
      sources.push({
        sourceType: 'social',
        sourceId: s.id,
        sourceTitle: s.title,
        contentCategory: CATEGORY_BY_SOURCE_TYPE[s.type] ?? 'educational',
        originalType: s.type,
        pillarId: s.pillarId,
        topicId: s.topicId,
        funnelStage: s.funnelStage,
        audienceSegmentIds: s.audienceSegmentIds,
        messagingPillarIds: s.messagingPillarIds,
        keywords: s.keywords,
        priorityScore: s.priorityScore,
        confidenceScore: s.confidenceScore,
        day: s.day,
        suggestedCTA: s.suggestedCTA,
        existingVideoTargetId: input.videoCalendar.items.find((v) => v.sourceSocialItemId === s.id)?.id,
      });
    }

    // Campaign-activity fallback — only when none of the three calendars
    // have any items at all (never a substitute for real calendar sources).
    if (input.blogCalendar.items.length === 0 && input.socialCalendar.items.length === 0 && input.videoCalendar.items.length === 0) {
      for (const a of input.campaignPlan.activities) {
        if (a.priorityScore < minPriority) continue;
        sources.push({
          sourceType: 'campaign_activity',
          sourceId: a.id,
          sourceTitle: a.title,
          contentCategory: 'educational',
          originalType: a.type,
          funnelStage: a.funnelStage,
          audienceSegmentIds: a.audienceSegmentIds,
          messagingPillarIds: a.messagingPillarIds,
          keywords: a.keywordDirections,
          priorityScore: a.priorityScore,
          confidenceScore: a.confidenceScore,
          day: a.day,
          suggestedCTA: undefined,
        });
      }
    }

    const typeOrder: Record<RepurposingSourceType, number> = { blog: 0, video: 1, social: 2, campaign_activity: 3 };
    return sources.sort((a, b) => typeOrder[a.sourceType] - typeOrder[b.sourceType] || b.priorityScore - a.priorityScore);
  }

  // ---------------------------------------------------------------------
  // Target selection
  // ---------------------------------------------------------------------

  private targetsForSource(
    source: SourceAsset,
    eligibility: { blog: boolean; social: boolean; video: boolean },
    funnelSupported: boolean,
  ): { targetType: RepurposingTargetType; actionType: RepurposingActionType; existing?: string }[] {
    const targets: { targetType: RepurposingTargetType; actionType: RepurposingActionType; existing?: string }[] = [];

    if (source.sourceType === 'blog' || source.sourceType === 'campaign_activity') {
      if (eligibility.social) {
        targets.push({ targetType: 'social', actionType: source.existingSocialTargetId ? 'promote' : 'summarize', existing: source.existingSocialTargetId });
      }
      if (eligibility.video && funnelSupported) {
        targets.push({ targetType: 'video', actionType: 'adapt', existing: source.existingVideoTargetId });
      }
    } else if (source.sourceType === 'social') {
      if (eligibility.blog && source.priorityScore >= SOCIAL_TO_BLOG_MIN_PRIORITY && funnelSupported) {
        targets.push({ targetType: 'blog', actionType: 'expand' });
      }
      const isVideoSuitable = VIDEO_SUITABLE_SOCIAL_TYPES.includes(source.originalType as SocialContentType);
      if (eligibility.video && (isVideoSuitable || source.existingVideoTargetId)) {
        targets.push({ targetType: 'video', actionType: 'adapt', existing: source.existingVideoTargetId });
      }
    } else if (source.sourceType === 'video') {
      if (eligibility.social) {
        targets.push({ targetType: 'social', actionType: 'extract' });
      }
      const isDeepExplanation = DEEP_EXPLANATION_VIDEO_TYPES.includes(source.originalType as VideoContentType);
      if (eligibility.blog && isDeepExplanation && funnelSupported) {
        targets.push({ targetType: 'blog', actionType: 'expand' });
      }
    }

    return targets;
  }

  // ---------------------------------------------------------------------
  // Scoring
  // ---------------------------------------------------------------------

  private scoreItem(
    source: SourceAsset,
    targetType: RepurposingTargetType,
    actionType: RepurposingActionType,
    existingTargetId: string | undefined,
    input: RepurposingPlanInput,
    pillarById: Map<string, CampaignContentPillar>,
    topicById: Map<string, ContentTopic>,
    messagingPillarById: Map<string, MessagingPillar>,
    channelFitById: Map<string, { confidenceScore: number }>,
    funnelStageScore: number | undefined,
  ): RepurposingItem {
    const pillar = source.pillarId ? pillarById.get(source.pillarId) : undefined;
    const topic = source.topicId ? topicById.get(source.topicId) : undefined;
    const messagingPillars = dedupeStrings([...source.messagingPillarIds, ...(pillar?.messagingPillarIds ?? [])])
      .map((id) => messagingPillarById.get(id))
      .filter((p): p is MessagingPillar => !!p);

    const targetChannelKeys: Record<RepurposingTargetType, string[]> = { blog: ['seo', 'content'], social: ['organic_social', 'paid_social'], video: [] };
    const channelFitValues = targetChannelKeys[targetType].map((c) => channelFitById.get(c)?.confidenceScore).filter((v): v is number => v !== undefined);

    const dims: { weight: number; value: number }[] = [{ weight: 0.3, value: source.priorityScore }];
    const pillarTopicScores = [pillar?.priorityScore, topic?.priorityScore].filter((v): v is number => v !== undefined);
    if (pillarTopicScores.length > 0) dims.push({ weight: 0.2, value: mean(pillarTopicScores) });
    if (channelFitValues.length > 0) dims.push({ weight: 0.2, value: mean(channelFitValues) });
    const messageFunnelValues = [...(funnelStageScore !== undefined ? [funnelStageScore] : []), ...messagingPillars.map((p) => p.priorityScore)];
    if (messageFunnelValues.length > 0) dims.push({ weight: 0.15, value: mean(messageFunnelValues) });
    if (source.sourceType === 'campaign_activity') dims.push({ weight: 0.1, value: source.priorityScore });
    const audienceSegmentIds = dedupeStrings(source.audienceSegmentIds).filter((id) => input.campaign.audienceSegmentIds.includes(id));
    if (audienceSegmentIds.length > 0) dims.push({ weight: 0.05, value: 70 });

    const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0);
    const priorityScore = totalWeight > 0 ? clamp(Math.round(dims.reduce((sum, d) => sum + d.weight * d.value, 0) / totalWeight), 0, 100) : 50;

    const confDims: { weight: number; value: number }[] = [{ weight: 0.3, value: source.confidenceScore }];
    const pillarTopicConf = [pillar?.confidenceScore, topic?.confidenceScore].filter((v): v is number => v !== undefined);
    if (pillarTopicConf.length > 0) confDims.push({ weight: 0.25, value: mean(pillarTopicConf) });
    if (channelFitValues.length > 0) confDims.push({ weight: 0.15, value: mean(channelFitValues) });
    if (messagingPillars.length > 0) confDims.push({ weight: 0.15, value: mean(messagingPillars.map((p) => p.confidenceScore)) });
    const confTotalWeight = confDims.reduce((sum, d) => sum + d.weight, 0);
    const sourceCount = [true, pillarTopicConf.length > 0, channelFitValues.length > 0, messagingPillars.length > 0].filter(Boolean).length;
    const diversityBonus = Math.min((sourceCount - 1) * 3, 9) + (existingTargetId ? EXISTING_LINKAGE_BONUS : 0);
    const confidenceScore = confTotalWeight > 0 ? clamp(Math.round(confDims.reduce((sum, d) => sum + d.weight * d.value, 0) / confTotalWeight + diversityBonus), 0, 100) : 40;

    const targetTitle = `${ACTION_PHRASES[actionType](source.sourceTitle)} for ${targetType}`;
    const formatDirection = actionType === 'promote' && targetType === 'social' ? 'blog_promotion' : FORMAT_TABLE[targetType][source.contentCategory];
    const offsetKey = `${source.sourceType === 'campaign_activity' ? 'blog' : source.sourceType}->${targetType}`;
    const recommendedTargetDay = clamp(source.day + (TARGET_DAY_OFFSET[offsetKey] ?? 2), source.day, 30);

    const reasons = [`Derived from a strong ${source.sourceType} source ("${source.sourceTitle}").`];
    if (existingTargetId) reasons.push('This relationship already exists in the current calendars — consolidated here, not duplicated.');

    return {
      id: '',
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      sourceTitle: source.sourceTitle,
      targetType,
      actionType,
      targetTitle,
      targetFormatDirection: formatDirection,
      priorityScore,
      confidenceScore,
      pillarId: source.pillarId,
      topicId: source.topicId,
      funnelStage: source.funnelStage,
      audienceSegmentIds,
      messagingPillarIds: dedupeStrings(messagingPillars.map((p) => p.id)),
      keywords: source.keywords.slice(0, 5),
      sourceDay: source.day,
      recommendedTargetDay: existingTargetId ? this.dayOfExisting(existingTargetId, input) : recommendedTargetDay,
      dependencyIds: [],
      suggestedCTA: source.suggestedCTA,
      isExistingLinkage: !!existingTargetId,
      reasons: dedupeStrings(reasons),
      warnings: audienceSegmentIds.length === 0 ? ['No specific audience segment evidence is available; this direction applies broadly.'] : [],
    };
  }

  private dayOfExisting(existingTargetId: string, input: RepurposingPlanInput): number | undefined {
    return (
      input.socialCalendar.items.find((s) => s.id === existingTargetId)?.day ??
      input.videoCalendar.items.find((v) => v.id === existingTargetId)?.day ??
      undefined
    );
  }

  // ---------------------------------------------------------------------
  // Dedup + cap
  // ---------------------------------------------------------------------

  private dedupeAndCap(items: (RepurposingItem & { sourceOrder: number })[]) {
    const byKey = new Map<string, (typeof items)[number]>();
    for (const item of items) {
      const key = [item.sourceId, item.targetType, item.pillarId ?? item.topicId ?? '', item.actionType].join('|');
      const existing = byKey.get(key);
      if (!existing || item.priorityScore > existing.priorityScore) byKey.set(key, item);
    }
    return Array.from(byKey.values())
      .sort((a, b) => a.sourceOrder - b.sourceOrder || b.priorityScore - a.priorityScore)
      .slice(0, this.getMaxItems());
  }

  // ---------------------------------------------------------------------
  // Chains
  // ---------------------------------------------------------------------

  private buildChains(items: RepurposingItem[], sources: SourceAsset[]): RepurposingChain[] {
    const bySource = new Map<string, RepurposingItem[]>();
    for (const item of items) {
      const list = bySource.get(item.sourceId) ?? [];
      list.push(item);
      bySource.set(item.sourceId, list);
    }

    const sourceById = new Map(sources.map((s) => [s.sourceId, s]));
    const chains: RepurposingChain[] = [];
    for (const [sourceId, derivatives] of bySource) {
      if (derivatives.length === 0) continue;
      const source = sourceById.get(sourceId);
      const channels = dedupeStrings([source?.sourceType ?? '', ...derivatives.map((d) => d.targetType)]);
      const funnelStages = dedupeStrings([source?.funnelStage ?? '', ...derivatives.map((d) => d.funnelStage)]);
      chains.push({
        id: `chain-${chains.length + 1}`,
        title: `${source?.sourceTitle ?? 'Source'} — Cross-Channel Direction`,
        sourceItemId: sourceId,
        repurposingItemIds: derivatives.map((d) => d.id),
        channels,
        funnelStages,
        priorityScore: Math.round(mean(derivatives.map((d) => d.priorityScore))),
        confidenceScore: Math.round(mean(derivatives.map((d) => d.confidenceScore))),
        reasons: dedupeStrings(derivatives.flatMap((d) => d.reasons)).slice(0, 5),
      });
    }

    return chains.sort((a, b) => b.priorityScore - a.priorityScore).slice(0, this.getMaxChains());
  }

  // ---------------------------------------------------------------------
  // Orchestration
  // ---------------------------------------------------------------------

  async buildRepurposingPlanForCampaign(organizationId: string, productId: string, campaignId: string, userId: string): Promise<RepurposingPlanResult> {
    // Cheap campaign-approval check first — this is itself the tenant/
    // product/campaign check, and avoids the expensive Growth Strategy
    // rebuild entirely when the campaign isn't even approved yet.
    const campaignApproval = await this.campaignReviewService.isCampaignApprovedForCurrentVersion(organizationId, productId, campaignId, userId);
    if (!campaignApproval.approved) {
      throw new ConflictException(campaignApproval.reason ?? 'Approve this campaign before building a repurposing plan.');
    }

    const strategyReview = await this.growthStrategyReviewService.getReview(organizationId, productId, userId);
    if (strategyReview.status !== 'approved') {
      throw new ConflictException('Approve the current Growth Strategy before building a repurposing plan.');
    }
    const product = await this.productsService.findOne(organizationId, productId, userId);
    const productUpdatedAt: Date = (product as { updatedAt?: Date }).updatedAt ?? new Date(0);
    const strategyStillApproved = await this.growthStrategyReviewService.isStrategyApprovedForCurrentVersion(organizationId, productId, userId, productUpdatedAt);
    if (!strategyStillApproved) {
      throw new ConflictException('The product has changed since the Growth Strategy was last approved. Review and approve it again before building a repurposing plan.');
    }

    const campaign = await this.campaignsService.findOne(organizationId, productId, campaignId, userId);
    if (!campaign.goal) {
      throw new BadRequestException('Define a campaign goal before building a repurposing plan.');
    }
    if (!campaign.plan) {
      throw new BadRequestException('Generate a 30-day campaign plan before building a repurposing plan.');
    }

    // Single internal orchestration pass — Growth Strategy is built once,
    // and every 14A-14F layer is generated exactly once in memory, never
    // over HTTP and never regenerated a second time.
    const overview = await this.growthStrategyService.buildOverviewForProduct(organizationId, productId, userId);
    const campaignInput = {
      goal: campaign.goal,
      audienceChannelMapping: campaign.audienceChannelMapping ?? { audiences: [], channels: [], confidenceScore: 0, missingEvidence: [], warnings: [], source: 'strategy' as const },
      channelIds: campaign.channelIds,
      audienceSegmentIds: campaign.audienceSegmentIds,
    };

    const ideaResult = this.contentIdeaService.generate({
      growthStrategy: { messaging: overview.messaging, contentStrategy: overview.contentStrategy, funnel: overview.funnel, conversionStrategy: overview.conversionStrategy },
      campaign: campaignInput,
      campaignPlan: campaign.plan,
    });

    const topicResult = this.topicPrioritizationService.prioritize({
      ideas: ideaResult,
      growthStrategy: { funnel: overview.funnel, contentStrategy: overview.contentStrategy },
      campaign: campaignInput,
      campaignPlan: campaign.plan,
    });

    const pillarResult = this.contentPillarPlanService.build({
      topics: topicResult,
      ideas: ideaResult,
      growthStrategy: { messaging: overview.messaging, contentStrategy: overview.contentStrategy, funnel: overview.funnel },
      campaign: campaignInput,
      campaignPlan: campaign.plan,
    });

    const blogCalendarResult = this.blogCalendarService.build({
      ideas: ideaResult,
      topics: topicResult,
      pillars: pillarResult,
      growthStrategy: { funnel: overview.funnel, contentStrategy: overview.contentStrategy },
      campaign: campaignInput,
      campaignPlan: campaign.plan,
    });

    const socialCalendarResult = this.socialCalendarService.build({
      ideas: ideaResult,
      topics: topicResult,
      pillars: pillarResult,
      blogCalendar: blogCalendarResult,
      growthStrategy: { messaging: overview.messaging, funnel: overview.funnel },
      campaign: campaignInput,
      campaignPlan: campaign.plan,
    });

    const videoCalendarResult = this.videoCalendarService.build({
      ideas: ideaResult,
      topics: topicResult,
      pillars: pillarResult,
      blogCalendar: blogCalendarResult,
      socialCalendar: socialCalendarResult,
      growthStrategy: { messaging: overview.messaging, contentStrategy: overview.contentStrategy, funnel: overview.funnel },
      campaign: campaignInput,
      campaignPlan: campaign.plan,
    });

    return this.build({
      ideas: ideaResult,
      topics: topicResult,
      pillars: pillarResult,
      blogCalendar: blogCalendarResult,
      socialCalendar: socialCalendarResult,
      videoCalendar: videoCalendarResult,
      growthStrategy: { messaging: overview.messaging, contentStrategy: overview.contentStrategy, funnel: overview.funnel },
      campaign: campaignInput,
      campaignPlan: campaign.plan,
    });
  }

  // ---------------------------------------------------------------------
  // Env-configurable limits
  // ---------------------------------------------------------------------

  private getMaxItems(): number {
    return this.getEnvNumber('REPURPOSING_MAX_ITEMS', DEFAULT_MAX_ITEMS);
  }

  private getMaxChains(): number {
    return this.getEnvNumber('REPURPOSING_MAX_CHAINS', DEFAULT_MAX_CHAINS);
  }

  private getMaxTargetsPerSource(): number {
    return this.getEnvNumber('REPURPOSING_MAX_TARGETS_PER_SOURCE', DEFAULT_MAX_TARGETS_PER_SOURCE);
  }

  private getMaxTopPriority(): number {
    return this.getEnvNumber('REPURPOSING_MAX_TOP_PRIORITY', DEFAULT_MAX_TOP_PRIORITY);
  }

  private getMinSourcePriority(): number {
    return this.getEnvNumber('REPURPOSING_MIN_SOURCE_PRIORITY', DEFAULT_MIN_SOURCE_PRIORITY);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
