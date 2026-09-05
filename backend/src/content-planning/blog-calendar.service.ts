import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CampaignReviewService } from '../campaigns/campaign-review.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import type { CampaignAudienceChannelMapping } from '../campaigns/types/campaign-audience-channel.types';
import type { CampaignGoal } from '../campaigns/types/campaign-goal.types';
import type { CampaignActivity, CampaignPlanResult } from '../campaigns/types/campaign-plan.types';
import type { ContentStrategyResult } from '../growth-strategy/types/content-strategy.types';
import type { FunnelStrategyResult } from '../growth-strategy/types/funnel-strategy.types';
import { GrowthStrategyReviewService } from '../growth-strategy/growth-strategy-review.service';
import { GrowthStrategyService } from '../growth-strategy/growth-strategy.service';
import { ProductsService } from '../products/products.service';
import { ContentIdeaService } from './content-idea.service';
import { ContentPillarPlanService } from './content-pillar-plan.service';
import type { ContentIdea, ContentIdeaResult, ContentIdeaType } from './types/content-idea.types';
import type { CampaignContentPillar, ContentPillarPlanResult } from './types/content-pillar-plan.types';
import type { BlogCalendarItem, BlogCalendarItemType, BlogCalendarResult, BlogWeekPlan } from './types/blog-calendar.types';
import type { ContentTopic, TopicPrioritizationResult } from './types/topic-prioritization.types';
import { TopicPrioritizationService } from './topic-prioritization.service';

const DEFAULT_MAX_ITEMS = 10;
const DEFAULT_MIN_SPACING_DAYS = 2;
const DEFAULT_MAX_KEYWORDS_PER_ITEM = 5;
const DEFAULT_MAX_TOP_PRIORITY = 5;

const DISCLAIMER = 'Blog calendar items are evidence-based planning directions and do not represent verified search demand, ranking potential, or expected content performance.';

const CTA_FALLBACK_BY_TYPE: Partial<Record<BlogCalendarItemType, string>> = {
  conversion_support: 'Take the next supported conversion action',
};

const TITLE_TEMPLATES: Record<BlogCalendarItemType, (topic: string) => string> = {
  educational: (t) => `Understanding ${t}`,
  guide: (t) => `A Practical Guide to ${t}`,
  use_case: (t) => `${t}: A Practical Use Case`,
  comparison: (t) => `${t}: Comparing Approaches`,
  differentiation: (t) => `What Sets ${t} Apart`,
  buyer_enablement: (t) => `Evaluating ${t} For Your Team`,
  faq: (t) => `Frequently Asked Questions About ${t}`,
  conversion_support: (t) => `Getting Started With ${t}`,
  activation: (t) => `Getting the Most From ${t} Early On`,
  thought_leadership: (t) => `The Future of ${t}`,
};

const ANGLE_FRAGMENTS: Record<BlogCalendarItemType, string> = {
  educational: 'Help the target audience understand',
  guide: 'Walk the target audience step-by-step through',
  use_case: 'Show a concrete, evidenced use case for',
  comparison: 'Help evaluators reason about approaches to',
  differentiation: 'Explain what genuinely differentiates the product with respect to',
  buyer_enablement: 'Give evaluators what they need to build a confident case for',
  faq: 'Answer the most common evidenced questions/uncertainties about',
  conversion_support: 'Support the next supported conversion step with clarity around',
  activation: 'Guide new users toward their first-value action around',
  thought_leadership: 'Share a category-level perspective on',
};

const SUCCESS_SIGNALS_BY_TYPE: Record<BlogCalendarItemType, string[]> = {
  educational: ['Content engagement', 'Time on page'],
  guide: ['Content engagement', 'Scroll depth'],
  use_case: ['Content engagement', 'Return visits'],
  comparison: ['Evaluation engagement'],
  differentiation: ['Evaluation engagement'],
  buyer_enablement: ['Evaluation engagement', 'Lead capture completion'],
  faq: ['Reduced evaluation uncertainty'],
  conversion_support: ['Supported conversion action completion'],
  activation: ['Onboarding completion', 'First-value action'],
  thought_leadership: ['Search visibility', 'Engagement'],
};

// Idea type -> blog item type. 'proof' has no direct blog-item counterpart
// (never treated as a standalone blog format) so it maps to the closest
// evidenced fit — buyer confidence/evaluation support.
const BLOG_TYPE_BY_IDEA_TYPE: Record<ContentIdeaType, BlogCalendarItemType> = {
  educational: 'educational',
  problem_solution: 'educational',
  use_case: 'use_case',
  comparison: 'comparison',
  differentiation: 'differentiation',
  buyer_enablement: 'buyer_enablement',
  conversion_support: 'conversion_support',
  activation: 'activation',
  thought_leadership: 'thought_leadership',
  faq: 'faq',
  proof: 'buyer_enablement',
  repurpose: 'educational',
};

type WeekHint = 1 | 2 | 3 | 4;
const WEEK_HINT_BY_TYPE: Record<BlogCalendarItemType, WeekHint> = {
  educational: 1,
  guide: 1,
  use_case: 2,
  thought_leadership: 2,
  comparison: 3,
  differentiation: 3,
  buyer_enablement: 3,
  faq: 3,
  conversion_support: 4,
  activation: 4,
};

// Foundation types that lower-funnel item types depend on, when a
// foundation item actually exists earlier in the same pillar's calendar.
const FOUNDATION_TYPES: BlogCalendarItemType[] = ['educational', 'guide', 'use_case'];
const DEPENDENT_TYPES: BlogCalendarItemType[] = ['comparison', 'buyer_enablement', 'conversion_support', 'faq'];

const WEEK_DEFS: Record<WeekHint, { days: number[]; theme: string }> = {
  1: { days: [1, 2, 3, 4, 5, 6, 7], theme: 'Foundation / Educational Coverage' },
  2: { days: [8, 9, 10, 11, 12, 13, 14], theme: 'Use-Case / Consideration Content' },
  3: { days: [15, 16, 17, 18, 19, 20, 21], theme: 'Comparison / Proof / Buyer-Support Content' },
  4: { days: [22, 23, 24, 25, 26, 27, 28], theme: 'Conversion-Support / Deeper Coverage' },
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

function stem(word: string): string {
  return word.replace(/(ment|ing|ed|s)$/, '');
}

function normalizeTitleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map(stem)
    .sort()
    .join(' ');
}

interface RawItem {
  pillar: CampaignContentPillar;
  topic: ContentTopic;
  type: BlogCalendarItemType;
  memberIdeas: ContentIdea[];
}

export interface BlogCalendarBuildInput {
  ideas: ContentIdeaResult;
  topics: TopicPrioritizationResult;
  pillars: ContentPillarPlanResult;
  growthStrategy: {
    funnel: FunnelStrategyResult;
    contentStrategy: ContentStrategyResult;
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
 * Blog calendar generation. `build()` is pure — no fetches, no HTTP calls —
 * so it can be unit-tested directly. Consumes the campaign's own 14B
 * topics + 14C pillars; never fabricates blog work when the campaign has no
 * SEO/content channel or blog-relevant activity evidence.
 */
@Injectable()
export class BlogCalendarService {
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
  ) {}

  /**
   * PURE. Builds a deterministic 30-day blog calendar strictly bounded by
   * the campaign's own selected channels/activities and 14B/14C evidence.
   */
  build(input: BlogCalendarBuildInput): BlogCalendarResult {
    const hasBlogSupport =
      input.campaign.channelIds.includes('seo') ||
      input.campaign.channelIds.includes('content') ||
      input.campaignPlan.activities.some((a) => ['blog', 'landing_page'].includes(a.type));

    if (!hasBlogSupport) {
      return {
        durationDays: 30,
        weeks: [],
        items: [],
        topPriorityItemIds: [],
        confidenceScore: 0,
        missingEvidence: ['No reliable blog calendar was detected for the current campaign channels and content strategy.'],
        warnings: [DISCLAIMER],
        generatedAt: new Date(),
      };
    }

    const ideaById = new Map(input.ideas.ideas.map((i) => [i.id, i]));
    const activityById = new Map(input.campaignPlan.activities.map((a) => [a.id, a]));
    const topicById = new Map(input.topics.topics.map((t) => [t.id, t]));

    const raw = this.selectRawItems(input, topicById, ideaById);
    const scored = raw.map((r) => this.scoreItem(r, input, activityById));
    const deduped = this.dedupeAndCap(scored);

    const { items, weeks } = this.assignSchedule(deduped);

    const topPriorityItemIds = [...items]
      .sort((a, b) => b.priorityScore - a.priorityScore || a.id.localeCompare(b.id))
      .slice(0, this.getMaxTopPriority())
      .map((i) => i.id);

    const missingEvidence: string[] = [];
    if (items.length === 0) missingEvidence.push('No reliable blog calendar was detected for the current campaign channels and content strategy.');

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
  // Selection — prefer primary pillars/topics, then supporting, then
  // experimental only while calendar capacity remains.
  // ---------------------------------------------------------------------

  private selectRawItems(input: BlogCalendarBuildInput, topicById: Map<string, ContentTopic>, ideaById: Map<string, ContentIdea>): RawItem[] {
    const tierOrder: CampaignContentPillar['tier'][] = ['primary', 'supporting', 'experimental'];
    const pillarsByTier = tierOrder.map((tier) => input.pillars.pillars.filter((p) => p.tier === tier).sort((a, b) => b.priorityScore - a.priorityScore));

    const raw: RawItem[] = [];
    const maxItems = this.getMaxItems();
    for (const tierPillars of pillarsByTier) {
      for (const pillar of tierPillars) {
        const memberTopics = pillar.topicIds
          .map((id) => topicById.get(id))
          .filter((t): t is ContentTopic => !!t && t.tier !== 'deferred')
          .sort((a, b) => b.priorityScore - a.priorityScore);

        for (const topic of memberTopics) {
          if (raw.length >= maxItems) break;
          const memberIdeas = dedupeStrings(topic.relatedIdeaIds)
            .map((id) => ideaById.get(id))
            .filter((i): i is ContentIdea => !!i);
          const type = this.dominantBlogType(memberIdeas);
          raw.push({ pillar, topic, type, memberIdeas });
        }
      }
    }
    return raw;
  }

  private dominantBlogType(ideas: ContentIdea[]): BlogCalendarItemType {
    if (ideas.length === 0) return 'educational';
    const counts = new Map<ContentIdeaType, number>();
    for (const idea of ideas) counts.set(idea.type, (counts.get(idea.type) ?? 0) + 1);
    const dominant = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    // 'guide' is reserved for a genuinely distinct how-to/deep-dive signal
    // that isn't evidenced at the idea-type level today — an incidental
    // formatDirection of 'guide' is not strong enough evidence to recategorize
    // an educational topic, so no such override is applied here.
    return BLOG_TYPE_BY_IDEA_TYPE[dominant];
  }

  // ---------------------------------------------------------------------
  // Scoring
  // ---------------------------------------------------------------------

  private scoreItem(
    raw: RawItem,
    input: BlogCalendarBuildInput,
    activityById: Map<string, CampaignActivity>,
  ): BlogCalendarItem & { pillarTier: CampaignContentPillar['tier']; weekHint: WeekHint } {
    const { pillar, topic, type, memberIdeas } = raw;
    const linkedActivities = dedupeStrings(memberIdeas.flatMap((i) => i.campaignActivityIds))
      .map((id) => activityById.get(id))
      .filter((a): a is CampaignActivity => !!a);

    const dims: { weight: number; value: number }[] = [
      { weight: 0.35, value: topic.priorityScore },
      { weight: 0.2, value: pillar.priorityScore },
    ];
    if (linkedActivities.length > 0) dims.push({ weight: 0.15, value: mean(linkedActivities.map((a) => a.priorityScore)) });
    const keywords = dedupeStrings(topic.keywords).slice(0, this.getMaxKeywordsPerItem());
    if (keywords.length > 0) dims.push({ weight: 0.15, value: Math.min(100, keywords.length * 15) });
    const funnelStageScore = input.growthStrategy.funnel.stages.find((s) => s.stage === topic.funnelStages[0])?.priorityScore;
    if (funnelStageScore !== undefined) dims.push({ weight: 0.1, value: funnelStageScore });
    const audienceSegmentIds = dedupeStrings(topic.audienceSegmentIds).filter((id) => input.campaign.audienceSegmentIds.includes(id));
    if (audienceSegmentIds.length > 0) dims.push({ weight: 0.05, value: 70 });

    const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0);
    const rawPriorityScore = totalWeight > 0 ? clamp(Math.round(dims.reduce((sum, d) => sum + d.weight * d.value, 0) / totalWeight), 0, 100) : 50;
    // An item with no linked campaign activity has weaker priority/
    // confidence than one grounded in an actual scheduled activity.
    const priorityScore = linkedActivities.length > 0 ? rawPriorityScore : Math.round(rawPriorityScore * 0.9);

    const confDims: { weight: number; value: number }[] = [
      { weight: 0.3, value: topic.confidenceScore },
      { weight: 0.25, value: pillar.confidenceScore },
    ];
    if (linkedActivities.length > 0) confDims.push({ weight: 0.2, value: input.campaignPlan.confidenceScore });
    if (keywords.length > 0) confDims.push({ weight: 0.15, value: 55 });
    if (audienceSegmentIds.length > 0) confDims.push({ weight: 0.1, value: 65 });
    const confTotalWeight = confDims.reduce((sum, d) => sum + d.weight, 0);
    const sourceCount = [true, true, linkedActivities.length > 0, keywords.length > 0, audienceSegmentIds.length > 0].filter(Boolean).length;
    const diversityBonus = Math.min((sourceCount - 1) * 3, 9);
    const confidenceScore = confTotalWeight > 0 ? clamp(Math.round(confDims.reduce((sum, d) => sum + d.weight * d.value, 0) / confTotalWeight + diversityBonus), 0, 100) : 40;

    const cta = this.ctaFor(type, memberIdeas);
    const title = TITLE_TEMPLATES[type](pillar.title);
    const angle = `${ANGLE_FRAGMENTS[type]} "${pillar.title.toLowerCase()}".`;

    return {
      id: '',
      day: 0,
      week: 0,
      title,
      type,
      pillarId: pillar.id,
      topicId: topic.id,
      priorityScore,
      confidenceScore,
      funnelStage: topic.funnelStages[0] ?? 'awareness',
      audienceSegmentIds,
      primaryKeyword: keywords[0],
      supportingKeywords: keywords.slice(1, this.getMaxKeywordsPerItem()),
      intentTypes: dedupeStrings(topic.intentTypes),
      objective: `Advance the "${pillar.title}" pillar with a ${type.replace(/_/g, ' ')} direction.`,
      angle,
      suggestedCTA: cta,
      relatedCampaignActivityIds: dedupeStrings(linkedActivities.map((a) => a.id)),
      dependencies: [],
      successSignals: SUCCESS_SIGNALS_BY_TYPE[type],
      status: 'planned',
      reasons: dedupeStrings([...topic.reasons, ...pillar.reasons]).slice(0, 5),
      warnings: audienceSegmentIds.length === 0 ? ['No specific audience segment evidence is available; this item applies broadly.'] : [],
      pillarTier: pillar.tier,
      weekHint: WEEK_HINT_BY_TYPE[type],
    };
  }

  private ctaFor(type: BlogCalendarItemType, ideas: ContentIdea[]): string | undefined {
    const fromIdea = ideas.map((i) => i.suggestedCTA).find((c) => !!c);
    if (fromIdea) return fromIdea;
    return CTA_FALLBACK_BY_TYPE[type];
  }

  // ---------------------------------------------------------------------
  // Dedup + cap
  // ---------------------------------------------------------------------

  private dedupeAndCap(items: (BlogCalendarItem & { pillarTier: CampaignContentPillar['tier']; weekHint: WeekHint })[]) {
    const byKey = new Map<string, (typeof items)[number]>();
    for (const item of items) {
      const key = [item.pillarId, item.topicId, item.type, normalizeTitleKey(item.title)].join('|');
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

  private assignSchedule(items: (BlogCalendarItem & { pillarTier: CampaignContentPillar['tier']; weekHint: WeekHint })[]): { items: BlogCalendarItem[]; weeks: BlogWeekPlan[] } {
    const byWeek = new Map<WeekHint, typeof items>();
    for (const item of items) {
      const list = byWeek.get(item.weekHint) ?? [];
      list.push(item);
      byWeek.set(item.weekHint, list);
    }

    const minSpacing = this.getMinSpacingDays();
    const finalItems: (BlogCalendarItem & { key: string; pillarTier: CampaignContentPillar['tier']; weekHint: WeekHint })[] = [];
    const idByPillarType = new Map<string, string>(); // pillarId -> earliest foundation item id in that pillar
    const weeks: BlogWeekPlan[] = [];

    for (const weekHint of [1, 2, 3, 4] as WeekHint[]) {
      const weekItems = (byWeek.get(weekHint) ?? []).sort((a, b) => b.priorityScore - a.priorityScore);
      if (weekItems.length === 0) continue;

      const def = WEEK_DEFS[weekHint];
      const itemIds: string[] = [];
      let lastDay = 0;
      weekItems.forEach((item, index) => {
        const evenDay = def.days[Math.floor((index * def.days.length) / weekItems.length)];
        const day = Math.max(evenDay, lastDay > 0 ? lastDay + minSpacing : evenDay);
        const boundedDay = Math.min(day, def.days[def.days.length - 1]);
        lastDay = boundedDay;

        const id = `blog-${finalItems.length + 1}`;
        const key = `${item.pillarId}|${item.type}`;
        if (FOUNDATION_TYPES.includes(item.type) && !idByPillarType.has(item.pillarId)) {
          idByPillarType.set(item.pillarId, id);
        }
        finalItems.push({ ...item, id, day: boundedDay, week: weekHint, key });
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

    // Second pass: attach foundation dependencies for lower-funnel item
    // types, only when a foundation item actually exists earlier in the
    // same pillar's schedule (never invents a prerequisite that isn't
    // itself part of this calendar).
    for (const item of finalItems) {
      if (!DEPENDENT_TYPES.includes(item.type)) continue;
      const foundationId = idByPillarType.get(item.pillarId);
      if (foundationId && foundationId !== item.id) {
        const foundationItem = finalItems.find((f) => f.id === foundationId);
        if (foundationItem && foundationItem.day < item.day) {
          item.dependencies = [foundationId];
        }
      }
    }

    return { items: finalItems.map(({ key: _key, pillarTier: _tier, weekHint: _hint, ...rest }) => rest), weeks };
  }

  // ---------------------------------------------------------------------
  // Orchestration
  // ---------------------------------------------------------------------

  async buildBlogCalendarForCampaign(organizationId: string, productId: string, campaignId: string, userId: string): Promise<BlogCalendarResult> {
    // Cheap campaign-approval check first — this is itself the tenant/
    // product/campaign check, and avoids the expensive Growth Strategy
    // rebuild entirely when the campaign isn't even approved yet.
    const campaignApproval = await this.campaignReviewService.isCampaignApprovedForCurrentVersion(organizationId, productId, campaignId, userId);
    if (!campaignApproval.approved) {
      throw new ConflictException(campaignApproval.reason ?? 'Approve this campaign before building a blog calendar.');
    }

    const strategyReview = await this.growthStrategyReviewService.getReview(organizationId, productId, userId);
    if (strategyReview.status !== 'approved') {
      throw new ConflictException('Approve the current Growth Strategy before building a blog calendar.');
    }
    const product = await this.productsService.findOne(organizationId, productId, userId);
    const productUpdatedAt: Date = (product as { updatedAt?: Date }).updatedAt ?? new Date(0);
    const strategyStillApproved = await this.growthStrategyReviewService.isStrategyApprovedForCurrentVersion(organizationId, productId, userId, productUpdatedAt);
    if (!strategyStillApproved) {
      throw new ConflictException('The product has changed since the Growth Strategy was last approved. Review and approve it again before building a blog calendar.');
    }

    const campaign = await this.campaignsService.findOne(organizationId, productId, campaignId, userId);
    if (!campaign.goal) {
      throw new BadRequestException('Define a campaign goal before building a blog calendar.');
    }
    if (!campaign.plan) {
      throw new BadRequestException('Generate a 30-day campaign plan before building a blog calendar.');
    }

    // Single internal orchestration pass — Growth Strategy is built once,
    // and 14A ideas / 14B topics / 14C pillars are each generated exactly
    // once in memory, never over HTTP and never regenerated a second time.
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

    return this.build({
      ideas: ideaResult,
      topics: topicResult,
      pillars: pillarResult,
      growthStrategy: { funnel: overview.funnel, contentStrategy: overview.contentStrategy },
      campaign: campaignInput,
      campaignPlan: campaign.plan,
    });
  }

  // ---------------------------------------------------------------------
  // Env-configurable limits
  // ---------------------------------------------------------------------

  private getMaxItems(): number {
    return this.getEnvNumber('BLOG_CALENDAR_MAX_ITEMS', DEFAULT_MAX_ITEMS);
  }

  private getMinSpacingDays(): number {
    return this.getEnvNumber('BLOG_CALENDAR_MIN_SPACING_DAYS', DEFAULT_MIN_SPACING_DAYS);
  }

  private getMaxKeywordsPerItem(): number {
    return this.getEnvNumber('BLOG_CALENDAR_MAX_KEYWORDS_PER_ITEM', DEFAULT_MAX_KEYWORDS_PER_ITEM);
  }

  private getMaxTopPriority(): number {
    return this.getEnvNumber('BLOG_CALENDAR_MAX_TOP_PRIORITY', DEFAULT_MAX_TOP_PRIORITY);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
