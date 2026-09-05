import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CampaignReviewService } from '../campaigns/campaign-review.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import type { CampaignAudienceChannelMapping } from '../campaigns/types/campaign-audience-channel.types';
import type { CampaignGoal } from '../campaigns/types/campaign-goal.types';
import type { CampaignActivity, CampaignPlanResult } from '../campaigns/types/campaign-plan.types';
import type { FunnelStrategyResult } from '../growth-strategy/types/funnel-strategy.types';
import type { MessagingPillar, MessagingStrategyResult } from '../growth-strategy/types/messaging-strategy.types';
import { GrowthStrategyReviewService } from '../growth-strategy/growth-strategy-review.service';
import { GrowthStrategyService } from '../growth-strategy/growth-strategy.service';
import { ProductsService } from '../products/products.service';
import { BlogCalendarService } from './blog-calendar.service';
import { ContentIdeaService } from './content-idea.service';
import { ContentPillarPlanService } from './content-pillar-plan.service';
import type { BlogCalendarItem, BlogCalendarResult } from './types/blog-calendar.types';
import type { ContentIdea, ContentIdeaResult, ContentIdeaType } from './types/content-idea.types';
import type { CampaignContentPillar, ContentPillarPlanResult } from './types/content-pillar-plan.types';
import type { SocialCalendarItem, SocialCalendarResult, SocialContentType, SocialWeekPlan } from './types/social-calendar.types';
import type { ContentTopic, TopicPrioritizationResult } from './types/topic-prioritization.types';
import { TopicPrioritizationService } from './topic-prioritization.service';

const DEFAULT_MAX_ITEMS = 16;
const DEFAULT_MAX_ITEMS_PER_WEEK = 4;
const DEFAULT_MIN_SPACING_DAYS = 1;
const DEFAULT_MAX_KEYWORDS_PER_ITEM = 3;
const DEFAULT_MAX_TOP_PRIORITY = 6;
const DEFAULT_MAX_BLOG_PROMOTIONS = 4;
const MIN_BLOG_PROMOTION_PRIORITY = 50;

const DISCLAIMER = 'Social calendar items are evidence-based planning directions, not final posts, platform-specific performance predictions, or publishing instructions.';

const CTA_FALLBACK_BY_TYPE: Partial<Record<SocialContentType, string>> = {
  conversion_support: 'Take the next supported conversion action',
};

const TITLE_TEMPLATES: Record<SocialContentType, (topic: string) => string> = {
  educational: (t) => `A Quick Look at ${t}`,
  problem_insight: (t) => `The Real Challenge Behind ${t}`,
  use_case: (t) => `${t} In Practice`,
  differentiation: (t) => `What Sets ${t} Apart`,
  comparison: (t) => `${t}: Comparing Approaches`,
  buyer_enablement: (t) => `Evaluating ${t} For Your Team`,
  proof: (t) => `Building the Case for ${t}`,
  faq: (t) => `Common Questions About ${t}`,
  conversion_support: (t) => `Getting Started With ${t}`,
  activation: (t) => `Getting the Most From ${t} Early On`,
  thought_leadership: (t) => `A Perspective on ${t}`,
  blog_promotion: (t) => `Promote: ${t}`,
  engagement: (t) => `${t}`,
};

const ANGLE_FRAGMENTS: Record<SocialContentType, string> = {
  educational: 'Share a concise educational point about',
  problem_insight: 'Highlight the underlying problem behind',
  use_case: 'Show a brief, evidenced use case for',
  differentiation: 'Explain what genuinely differentiates the product with respect to',
  comparison: 'Prompt evaluators to compare approaches around',
  buyer_enablement: 'Give evaluators a confidence-building point about',
  proof: 'Direction to reference validated, collected proof around',
  faq: 'Answer a commonly evidenced question about',
  conversion_support: 'Support the next supported conversion step with clarity around',
  activation: 'Guide new users toward their first-value action around',
  thought_leadership: 'Share a category-level perspective on',
  blog_promotion: 'Repurpose and promote the linked blog content into a concise social direction about',
  engagement: 'Prompt engagement around',
};

const SUCCESS_SIGNALS_BY_TYPE: Record<SocialContentType, string[]> = {
  educational: ['Engagement', 'Reach'],
  problem_insight: ['Engagement'],
  use_case: ['Engagement', 'Return visits'],
  differentiation: ['Evaluation engagement'],
  comparison: ['Evaluation engagement'],
  buyer_enablement: ['Evaluation engagement', 'Lead capture completion'],
  proof: ['Reduced evaluation uncertainty'],
  faq: ['Reduced evaluation uncertainty'],
  conversion_support: ['Supported conversion action completion'],
  activation: ['Onboarding completion', 'First-value action'],
  thought_leadership: ['Search visibility', 'Engagement'],
  blog_promotion: ['Click-through to blog', 'Engagement'],
  engagement: ['Engagement'],
};

// Only these generic, platform-agnostic format directions are ever used —
// never a platform-specific label (e.g. "Instagram Reel", "LinkedIn
// Carousel") since no platform-specific evidence exists in this sprint.
const FORMAT_BY_TYPE: Record<SocialContentType, string> = {
  educational: 'short_post',
  problem_insight: 'text_post',
  use_case: 'carousel_direction',
  differentiation: 'image_post_direction',
  comparison: 'carousel_direction',
  buyer_enablement: 'text_post',
  proof: 'image_post_direction',
  faq: 'thread_direction',
  conversion_support: 'short_post',
  activation: 'short_post',
  thought_leadership: 'thread_direction',
  blog_promotion: 'blog_promotion',
  engagement: 'poll_direction',
};

// Idea type -> social content type. 'repurpose' has no direct counterpart
// so it maps to the closest evidenced fit — general education.
const SOCIAL_TYPE_BY_IDEA_TYPE: Record<ContentIdeaType, SocialContentType> = {
  educational: 'educational',
  problem_solution: 'problem_insight',
  use_case: 'use_case',
  comparison: 'comparison',
  differentiation: 'differentiation',
  buyer_enablement: 'buyer_enablement',
  conversion_support: 'conversion_support',
  activation: 'activation',
  thought_leadership: 'thought_leadership',
  faq: 'faq',
  proof: 'proof',
  repurpose: 'educational',
};

type WeekHint = 1 | 2 | 3 | 4;
const WEEK_HINT_BY_TYPE: Record<SocialContentType, WeekHint> = {
  educational: 1,
  problem_insight: 1,
  thought_leadership: 1,
  use_case: 2,
  differentiation: 2,
  comparison: 3,
  buyer_enablement: 3,
  proof: 3,
  faq: 3,
  conversion_support: 4,
  activation: 4,
  blog_promotion: 2, // overridden per-item to match its source blog item's week
  engagement: 1,
};

const WEEK_DEFS: Record<WeekHint, { days: number[]; theme: string }> = {
  1: { days: [1, 2, 3, 4, 5, 6, 7], theme: 'Education + Problem Awareness' },
  2: { days: [8, 9, 10, 11, 12, 13, 14], theme: 'Use Cases + Value' },
  3: { days: [15, 16, 17, 18, 19, 20, 21], theme: 'Differentiation + Evaluation' },
  4: { days: [22, 23, 24, 25, 26, 27, 28], theme: 'Conversion Support + Reinforcement' },
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

interface RawItem {
  pillar: CampaignContentPillar;
  topic?: ContentTopic;
  type: SocialContentType;
  memberIdeas: ContentIdea[];
  sourceBlogItem?: BlogCalendarItem;
  minDay?: number;
}

export interface SocialCalendarBuildInput {
  ideas: ContentIdeaResult;
  topics: TopicPrioritizationResult;
  pillars: ContentPillarPlanResult;
  blogCalendar: BlogCalendarResult;
  growthStrategy: {
    messaging: MessagingStrategyResult;
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
 * Social calendar generation. `build()` is pure — no fetches, no HTTP calls
 * — so it can be unit-tested directly. Consumes the campaign's own 14B
 * topics + 14C pillars + 14D blog calendar; never fabricates social work
 * when the campaign has no organic_social/paid_social channel, and never
 * assigns a platform-specific format/platform without explicit evidence.
 */
@Injectable()
export class SocialCalendarService {
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
  ) {}

  /**
   * PURE. Builds a deterministic 30-day social calendar strictly bounded by
   * the campaign's own selected social channels and 14B/14C/14D evidence.
   */
  build(input: SocialCalendarBuildInput): SocialCalendarResult {
    const hasSocialSupport = input.campaign.channelIds.includes('organic_social') || input.campaign.channelIds.includes('paid_social');
    if (!hasSocialSupport) {
      return {
        durationDays: 30,
        weeks: [],
        items: [],
        topPriorityItemIds: [],
        confidenceScore: 0,
        missingEvidence: ['No reliable social calendar was detected because this campaign does not currently use a supported social channel.'],
        warnings: [DISCLAIMER],
        generatedAt: new Date(),
      };
    }

    const ideaById = new Map(input.ideas.ideas.map((i) => [i.id, i]));
    const activityById = new Map(input.campaignPlan.activities.map((a) => [a.id, a]));
    const topicById = new Map(input.topics.topics.map((t) => [t.id, t]));
    const messagingPillarById = new Map(input.growthStrategy.messaging.pillars.map((p) => [p.id, p]));
    const isPaidOnly = !input.campaign.channelIds.includes('organic_social') && input.campaign.channelIds.includes('paid_social');

    const raw = [...this.selectTopicItems(input, topicById, ideaById), ...this.selectBlogPromotionItems(input)];
    const scored = raw.map((r) => this.scoreItem(r, input, activityById, messagingPillarById, isPaidOnly));
    const deduped = this.dedupeAndCap(scored);

    const { items, weeks } = this.assignSchedule(deduped);

    const topPriorityItemIds = [...items]
      .sort((a, b) => b.priorityScore - a.priorityScore || a.id.localeCompare(b.id))
      .slice(0, this.getMaxTopPriority())
      .map((i) => i.id);

    const missingEvidence: string[] = [];
    if (items.length === 0) missingEvidence.push('No reliable social content directions were detected from the approved campaign and strategy evidence.');

    const confidenceScore = items.length ? Math.round(mean(items.map((i) => i.confidenceScore))) : 0;

    return {
      durationDays: 30,
      weeks,
      items,
      topPriorityItemIds,
      confidenceScore,
      missingEvidence,
      warnings: [DISCLAIMER],
      generatedAt: new Date(),
    };
  }

  // ---------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------

  private selectTopicItems(input: SocialCalendarBuildInput, topicById: Map<string, ContentTopic>, ideaById: Map<string, ContentIdea>): RawItem[] {
    const tierOrder: CampaignContentPillar['tier'][] = ['primary', 'supporting', 'experimental'];
    const pillarsByTier = tierOrder.map((tier) => input.pillars.pillars.filter((p) => p.tier === tier).sort((a, b) => b.priorityScore - a.priorityScore));

    const raw: RawItem[] = [];
    for (const tierPillars of pillarsByTier) {
      for (const pillar of tierPillars) {
        const memberTopics = pillar.topicIds
          .map((id) => topicById.get(id))
          .filter((t): t is ContentTopic => !!t && t.tier !== 'deferred')
          .sort((a, b) => b.priorityScore - a.priorityScore);

        for (const topic of memberTopics) {
          const memberIdeas = dedupeStrings(topic.relatedIdeaIds)
            .map((id) => ideaById.get(id))
            .filter((i): i is ContentIdea => !!i);
          const type = this.dominantSocialType(memberIdeas);
          raw.push({ pillar, topic, type, memberIdeas });
        }
      }
    }
    return raw;
  }

  private dominantSocialType(ideas: ContentIdea[]): SocialContentType {
    if (ideas.length === 0) return 'educational';
    const counts = new Map<ContentIdeaType, number>();
    for (const idea of ideas) counts.set(idea.type, (counts.get(idea.type) ?? 0) + 1);
    const dominant = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    return SOCIAL_TYPE_BY_IDEA_TYPE[dominant];
  }

  // Blog repurposing — at most SOCIAL_CALENDAR_MAX_BLOG_PROMOTIONS
  // promotions, only for genuinely strong blog items, never repeated per
  // blog item (one promotion each at most).
  private selectBlogPromotionItems(input: SocialCalendarBuildInput): RawItem[] {
    if (!input.pillars.pillars.length) return [];
    const pillarById = new Map(input.pillars.pillars.map((p) => [p.id, p]));
    const strongBlogItems = [...input.blogCalendar.items]
      .filter((b) => b.priorityScore >= MIN_BLOG_PROMOTION_PRIORITY)
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, this.getMaxBlogPromotions());

    const raw: RawItem[] = [];
    for (const blogItem of strongBlogItems) {
      const pillar = pillarById.get(blogItem.pillarId);
      if (!pillar) continue;
      raw.push({ pillar, type: 'blog_promotion', memberIdeas: [], sourceBlogItem: blogItem, minDay: blogItem.day + 1 });
    }
    return raw;
  }

  // ---------------------------------------------------------------------
  // Scoring
  // ---------------------------------------------------------------------

  private scoreItem(
    raw: RawItem,
    input: SocialCalendarBuildInput,
    activityById: Map<string, CampaignActivity>,
    messagingPillarById: Map<string, MessagingPillar>,
    isPaidOnly: boolean,
  ): SocialCalendarItem & { weekHint: WeekHint; minDay?: number } {
    const { pillar, topic, type, memberIdeas, sourceBlogItem } = raw;
    const linkedActivities = dedupeStrings(memberIdeas.flatMap((i) => i.campaignActivityIds))
      .map((id) => activityById.get(id))
      .filter((a): a is CampaignActivity => !!a);
    const messagingPillarIds = dedupeStrings(pillar.messagingPillarIds);
    const messagingPillars = messagingPillarIds.map((id) => messagingPillarById.get(id)).filter((p): p is MessagingPillar => !!p);

    const dims: { weight: number; value: number }[] = [];
    if (topic) dims.push({ weight: 0.25, value: topic.priorityScore });
    dims.push({ weight: 0.2, value: pillar.priorityScore });
    if (linkedActivities.length > 0) dims.push({ weight: 0.2, value: mean(linkedActivities.map((a) => a.priorityScore)) });
    if (messagingPillars.length > 0) dims.push({ weight: 0.15, value: mean(messagingPillars.map((p) => p.priorityScore)) });
    const funnelStage = topic?.funnelStages[0] ?? sourceBlogItem?.funnelStage ?? pillar.funnelStages[0] ?? 'awareness';
    const funnelStageScore = input.growthStrategy.funnel.stages.find((s) => s.stage === funnelStage)?.priorityScore;
    if (funnelStageScore !== undefined) dims.push({ weight: 0.1, value: funnelStageScore });
    const audienceSegmentIds = dedupeStrings([...(topic?.audienceSegmentIds ?? []), ...pillar.audienceSegmentIds]).filter((id) => input.campaign.audienceSegmentIds.includes(id));
    const channelFitValues = ['organic_social', 'paid_social']
      .map((c) => input.campaign.audienceChannelMapping.channels.find((cf) => cf.channel === c)?.confidenceScore)
      .filter((v): v is number => v !== undefined);
    if (audienceSegmentIds.length > 0 || channelFitValues.length > 0) {
      dims.push({ weight: 0.1, value: mean([...(audienceSegmentIds.length > 0 ? [70] : []), ...channelFitValues]) });
    }

    const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0);
    const rawPriorityScore = totalWeight > 0 ? clamp(Math.round(dims.reduce((sum, d) => sum + d.weight * d.value, 0) / totalWeight), 0, 100) : 50;
    const priorityScore = linkedActivities.length > 0 ? rawPriorityScore : Math.round(rawPriorityScore * 0.9);

    const confDims: { weight: number; value: number }[] = [{ weight: 0.25, value: pillar.confidenceScore }];
    if (topic) confDims.push({ weight: 0.25, value: topic.confidenceScore });
    if (linkedActivities.length > 0) confDims.push({ weight: 0.2, value: input.campaignPlan.confidenceScore });
    if (messagingPillars.length > 0) confDims.push({ weight: 0.15, value: mean(messagingPillars.map((p) => p.confidenceScore)) });
    if (audienceSegmentIds.length > 0) confDims.push({ weight: 0.15, value: 65 });
    const confTotalWeight = confDims.reduce((sum, d) => sum + d.weight, 0);
    const sourceCount = [true, !!topic, linkedActivities.length > 0, messagingPillars.length > 0, audienceSegmentIds.length > 0].filter(Boolean).length;
    const diversityBonus = Math.min((sourceCount - 1) * 3, 9);
    const confidenceScore = confTotalWeight > 0 ? clamp(Math.round(confDims.reduce((sum, d) => sum + d.weight * d.value, 0) / confTotalWeight + diversityBonus), 0, 100) : 40;

    const topicTitle = sourceBlogItem?.title ?? topic?.title ?? pillar.title;
    const title = TITLE_TEMPLATES[type](topicTitle);
    const angle = `${ANGLE_FRAGMENTS[type]} "${topicTitle.toLowerCase()}".`;
    const keywords = dedupeStrings([...(topic?.keywords ?? []), ...(sourceBlogItem?.primaryKeyword ? [sourceBlogItem.primaryKeyword] : [])]).slice(0, this.getMaxKeywordsPerItem());
    const cta = this.ctaFor(type, memberIdeas);

    const reasons = dedupeStrings([...(topic?.reasons ?? []), ...pillar.reasons, ...(isPaidOnly ? ['This is a paid-social planning direction (no organic_social channel selected).'] : [])]).slice(0, 5);
    const warnings = audienceSegmentIds.length === 0 ? ['No specific audience segment evidence is available; this item applies broadly.'] : [];

    return {
      id: '',
      day: 0,
      week: 0,
      platform: 'generic_social',
      type,
      title,
      angle,
      priorityScore,
      confidenceScore,
      pillarId: pillar.id,
      topicId: topic?.id,
      funnelStage,
      audienceSegmentIds,
      messagingPillarIds,
      keywords,
      sourceBlogItemId: sourceBlogItem?.id,
      relatedCampaignActivityIds: dedupeStrings(linkedActivities.map((a) => a.id)),
      suggestedCTA: cta,
      recommendedFormat: FORMAT_BY_TYPE[type],
      dependencies: [],
      successSignals: SUCCESS_SIGNALS_BY_TYPE[type],
      status: 'planned',
      reasons,
      warnings,
      weekHint: sourceBlogItem ? this.weekHintForDay(sourceBlogItem.day) : WEEK_HINT_BY_TYPE[type],
      minDay: raw.minDay,
    };
  }

  private weekHintForDay(day: number): WeekHint {
    if (day <= 7) return 1;
    if (day <= 14) return 2;
    if (day <= 21) return 3;
    return 4;
  }

  private ctaFor(type: SocialContentType, ideas: ContentIdea[]): string | undefined {
    const fromIdea = ideas.map((i) => i.suggestedCTA).find((c) => !!c);
    if (fromIdea) return fromIdea;
    return CTA_FALLBACK_BY_TYPE[type];
  }

  // ---------------------------------------------------------------------
  // Dedup + cap
  // ---------------------------------------------------------------------

  private dedupeAndCap(items: (SocialCalendarItem & { weekHint: WeekHint; minDay?: number })[]) {
    const byKey = new Map<string, (typeof items)[number]>();
    for (const item of items) {
      const key = [item.pillarId, item.topicId ?? '', item.type, item.funnelStage, item.platform].join('|');
      const existing = byKey.get(key);
      if (!existing || item.priorityScore > existing.priorityScore) byKey.set(key, item);
    }
    return Array.from(byKey.values())
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, this.getMaxItems());
  }

  // ---------------------------------------------------------------------
  // Scheduling
  // ---------------------------------------------------------------------

  private assignSchedule(items: (SocialCalendarItem & { weekHint: WeekHint; minDay?: number })[]): { items: SocialCalendarItem[]; weeks: SocialWeekPlan[] } {
    const byWeek = new Map<WeekHint, typeof items>();
    for (const item of items) {
      const list = byWeek.get(item.weekHint) ?? [];
      list.push(item);
      byWeek.set(item.weekHint, list);
    }

    const minSpacing = this.getMinSpacingDays();
    const maxPerWeek = this.getMaxItemsPerWeek();
    const finalItems: (SocialCalendarItem & { weekHint: WeekHint; minDay?: number })[] = [];
    const weeks: SocialWeekPlan[] = [];

    for (const weekHint of [1, 2, 3, 4] as WeekHint[]) {
      const weekItems = (byWeek.get(weekHint) ?? []).sort((a, b) => b.priorityScore - a.priorityScore).slice(0, maxPerWeek);
      if (weekItems.length === 0) continue;

      const def = WEEK_DEFS[weekHint];
      const itemIds: string[] = [];
      let lastDay = 0;
      weekItems.forEach((item, index) => {
        const evenDay = def.days[Math.floor((index * def.days.length) / weekItems.length)];
        let day = Math.max(evenDay, lastDay > 0 ? lastDay + minSpacing : evenDay);
        if (item.minDay !== undefined) day = Math.max(day, item.minDay);
        const boundedDay = Math.min(day, def.days[def.days.length - 1]);
        lastDay = boundedDay;

        const id = `social-${finalItems.length + 1}`;
        finalItems.push({ ...item, id, day: boundedDay, week: weekHint });
        itemIds.push(id);
      });

      weeks.push({
        week: weekHint,
        days: def.days,
        theme: def.theme,
        itemIds,
        confidenceScore: Math.round(mean(weekItems.map((i) => i.confidenceScore))),
      });
    }

    return { items: finalItems.map(({ weekHint: _hint, minDay: _minDay, ...rest }) => rest), weeks };
  }

  // ---------------------------------------------------------------------
  // Orchestration
  // ---------------------------------------------------------------------

  async buildSocialCalendarForCampaign(organizationId: string, productId: string, campaignId: string, userId: string): Promise<SocialCalendarResult> {
    // Cheap campaign-approval check first — this is itself the tenant/
    // product/campaign check, and avoids the expensive Growth Strategy
    // rebuild entirely when the campaign isn't even approved yet.
    const campaignApproval = await this.campaignReviewService.isCampaignApprovedForCurrentVersion(organizationId, productId, campaignId, userId);
    if (!campaignApproval.approved) {
      throw new ConflictException(campaignApproval.reason ?? 'Approve this campaign before building a social calendar.');
    }

    const strategyReview = await this.growthStrategyReviewService.getReview(organizationId, productId, userId);
    if (strategyReview.status !== 'approved') {
      throw new ConflictException('Approve the current Growth Strategy before building a social calendar.');
    }
    const product = await this.productsService.findOne(organizationId, productId, userId);
    const productUpdatedAt: Date = (product as { updatedAt?: Date }).updatedAt ?? new Date(0);
    const strategyStillApproved = await this.growthStrategyReviewService.isStrategyApprovedForCurrentVersion(organizationId, productId, userId, productUpdatedAt);
    if (!strategyStillApproved) {
      throw new ConflictException('The product has changed since the Growth Strategy was last approved. Review and approve it again before building a social calendar.');
    }

    const campaign = await this.campaignsService.findOne(organizationId, productId, campaignId, userId);
    if (!campaign.goal) {
      throw new BadRequestException('Define a campaign goal before building a social calendar.');
    }
    if (!campaign.plan) {
      throw new BadRequestException('Generate a 30-day campaign plan before building a social calendar.');
    }

    // Single internal orchestration pass — Growth Strategy is built once,
    // and 14A ideas / 14B topics / 14C pillars / 14D blog calendar are each
    // generated exactly once in memory, never over HTTP.
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

    return this.build({
      ideas: ideaResult,
      topics: topicResult,
      pillars: pillarResult,
      blogCalendar: blogCalendarResult,
      growthStrategy: { messaging: overview.messaging, funnel: overview.funnel },
      campaign: campaignInput,
      campaignPlan: campaign.plan,
    });
  }

  // ---------------------------------------------------------------------
  // Env-configurable limits
  // ---------------------------------------------------------------------

  private getMaxItems(): number {
    return this.getEnvNumber('SOCIAL_CALENDAR_MAX_ITEMS', DEFAULT_MAX_ITEMS);
  }

  private getMaxItemsPerWeek(): number {
    return this.getEnvNumber('SOCIAL_CALENDAR_MAX_ITEMS_PER_WEEK', DEFAULT_MAX_ITEMS_PER_WEEK);
  }

  private getMinSpacingDays(): number {
    return this.getEnvNumber('SOCIAL_CALENDAR_MIN_SPACING_DAYS', DEFAULT_MIN_SPACING_DAYS);
  }

  private getMaxKeywordsPerItem(): number {
    return this.getEnvNumber('SOCIAL_CALENDAR_MAX_KEYWORDS_PER_ITEM', DEFAULT_MAX_KEYWORDS_PER_ITEM);
  }

  private getMaxTopPriority(): number {
    return this.getEnvNumber('SOCIAL_CALENDAR_MAX_TOP_PRIORITY', DEFAULT_MAX_TOP_PRIORITY);
  }

  private getMaxBlogPromotions(): number {
    return this.getEnvNumber('SOCIAL_CALENDAR_MAX_BLOG_PROMOTIONS', DEFAULT_MAX_BLOG_PROMOTIONS);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
