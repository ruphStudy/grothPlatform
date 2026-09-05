import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CampaignReviewService } from '../campaigns/campaign-review.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import type { CampaignAudienceChannelMapping } from '../campaigns/types/campaign-audience-channel.types';
import type { CampaignGoal } from '../campaigns/types/campaign-goal.types';
import type { CampaignActivity, CampaignPlanResult } from '../campaigns/types/campaign-plan.types';
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
import type { BlogCalendarItem, BlogCalendarResult } from './types/blog-calendar.types';
import type { ContentIdea, ContentIdeaResult, ContentIdeaType } from './types/content-idea.types';
import type { CampaignContentPillar, ContentPillarPlanResult } from './types/content-pillar-plan.types';
import type { SocialCalendarItem, SocialCalendarResult, SocialContentType } from './types/social-calendar.types';
import type { ContentTopic, TopicPrioritizationResult } from './types/topic-prioritization.types';
import type { VideoCalendarItem, VideoCalendarResult, VideoContentType, VideoFormatDirection, VideoWeekPlan } from './types/video-calendar.types';
import { TopicPrioritizationService } from './topic-prioritization.service';

const DEFAULT_MAX_ITEMS = 10;
const DEFAULT_MIN_SPACING_DAYS = 3;
const DEFAULT_MAX_KEYWORDS_PER_ITEM = 3;
const DEFAULT_MAX_TOP_PRIORITY = 5;
const DEFAULT_MAX_BLOG_REPURPOSE = 3;
const DEFAULT_MAX_SOCIAL_REPURPOSE = 3;
const MIN_REPURPOSE_PRIORITY = 55;

const DISCLAIMER =
  'Video calendar items are evidence-based planning directions, not final scripts, production assets, platform-specific publishing instructions, or performance predictions.';

const CTA_FALLBACK_BY_TYPE: Partial<Record<VideoContentType, string>> = {
  conversion_support: 'Take the next supported conversion action',
};

const TITLE_TEMPLATES: Record<VideoContentType, (topic: string) => string> = {
  educational: (t) => `A Quick Look at ${t}`,
  explainer: (t) => `Explaining ${t}`,
  problem_solution: (t) => `Solving the ${t} Challenge`,
  use_case: (t) => `${t} In Practice`,
  comparison: (t) => `${t}: Comparing Approaches`,
  differentiation: (t) => `What Sets ${t} Apart`,
  buyer_enablement: (t) => `Evaluating ${t} For Your Team`,
  faq: (t) => `Common Questions About ${t}`,
  conversion_support: (t) => `Getting Started With ${t}`,
  activation: (t) => `Getting the Most From ${t} Early On`,
  thought_leadership: (t) => `A Perspective on ${t}`,
  blog_repurpose: (t) => `Convert "${t}" Into a Video Direction`,
  social_repurpose: (t) => `Convert "${t}" Into a Video Direction`,
};

const ANGLE_FRAGMENTS: Record<VideoContentType, string> = {
  educational: 'Share a concise educational point about',
  explainer: 'Explain the category/product/value clearly around',
  problem_solution: 'Show how the product addresses a real pain point around',
  use_case: 'Walk through a concrete, evidenced use case for',
  comparison: 'Help evaluators reason about approaches to',
  differentiation: 'Explain what genuinely differentiates the product with respect to',
  buyer_enablement: 'Give evaluators a confidence-building point about',
  faq: 'Answer a commonly evidenced question about',
  conversion_support: 'Support the next supported conversion step with clarity around',
  activation: 'Guide new users toward their first-value action around',
  thought_leadership: 'Share a category-level perspective on',
  blog_repurpose: 'Convert the linked blog content into a concise video direction about',
  social_repurpose: 'Convert the linked social direction into a concise video direction about',
};

const SUCCESS_SIGNALS_BY_TYPE: Record<VideoContentType, string[]> = {
  educational: ['View completion', 'Engagement'],
  explainer: ['View completion', 'Engagement'],
  problem_solution: ['View completion'],
  use_case: ['View completion', 'Engagement'],
  comparison: ['Evaluation engagement'],
  differentiation: ['Evaluation engagement'],
  buyer_enablement: ['Evaluation engagement', 'Lead capture completion'],
  faq: ['Reduced evaluation uncertainty'],
  conversion_support: ['Supported conversion action completion'],
  activation: ['Onboarding completion', 'First-value action'],
  thought_leadership: ['Search visibility', 'Engagement'],
  blog_repurpose: ['View completion', 'Click-through to blog'],
  social_repurpose: ['View completion', 'Engagement'],
};

// Only these platform-neutral format directions are ever used — never a
// platform-specific label (e.g. "YouTube Short", "TikTok") since no
// platform-specific evidence exists in this sprint.
const FORMAT_BY_TYPE: Record<VideoContentType, VideoFormatDirection> = {
  educational: 'short_video',
  explainer: 'explainer_video',
  problem_solution: 'short_video',
  use_case: 'tutorial_direction',
  comparison: 'comparison_video',
  differentiation: 'talking_head_direction',
  buyer_enablement: 'talking_head_direction',
  faq: 'faq_video',
  conversion_support: 'talking_head_direction',
  activation: 'screen_walkthrough_direction',
  thought_leadership: 'talking_head_direction',
  blog_repurpose: 'explainer_video',
  social_repurpose: 'short_video',
};

// Idea type -> video content type. 'proof' has no direct video-type
// counterpart so it maps to the closest evidenced fit — buyer confidence.
const VIDEO_TYPE_BY_IDEA_TYPE: Record<ContentIdeaType, VideoContentType> = {
  educational: 'educational',
  problem_solution: 'problem_solution',
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

// Only these social content types are considered genuinely video-suitable —
// promotional/FAQ/proof/conversion social posts are better sourced directly
// from ideas/topics than repurposed a second time from a social post.
const VIDEO_SUITABLE_SOCIAL_TYPES: SocialContentType[] = ['educational', 'problem_insight', 'use_case', 'differentiation', 'comparison', 'thought_leadership'];

type WeekHint = 1 | 2 | 3 | 4;
const WEEK_HINT_BY_TYPE: Record<VideoContentType, WeekHint> = {
  educational: 1,
  explainer: 1,
  thought_leadership: 1,
  use_case: 2,
  problem_solution: 2,
  comparison: 3,
  differentiation: 3,
  buyer_enablement: 3,
  faq: 4,
  conversion_support: 4,
  activation: 4,
  blog_repurpose: 2, // overridden per-item to match its source item's week
  social_repurpose: 2, // overridden per-item to match its source item's week
};

const WEEK_DEFS: Record<WeekHint, { days: number[]; theme: string }> = {
  1: { days: [1, 2, 3, 4, 5, 6, 7], theme: 'Education + Explainers' },
  2: { days: [8, 9, 10, 11, 12, 13, 14], theme: 'Use Cases + Problem/Solution' },
  3: { days: [15, 16, 17, 18, 19, 20, 21], theme: 'Evaluation + Differentiation' },
  4: { days: [22, 23, 24, 25, 26, 27, 28], theme: 'Conversion/Activation + Repurposing' },
};

const FOUNDATION_TYPES: VideoContentType[] = ['educational', 'explainer'];
const DEPENDENT_TYPES: VideoContentType[] = ['comparison', 'buyer_enablement', 'conversion_support', 'faq'];

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
  type: VideoContentType;
  memberIdeas: ContentIdea[];
  sourceBlogItem?: BlogCalendarItem;
  sourceSocialItem?: SocialCalendarItem;
  sourcePriorityScore?: number;
  sourceConfidenceScore?: number;
  minDay?: number;
}

export interface VideoCalendarBuildInput {
  ideas: ContentIdeaResult;
  topics: TopicPrioritizationResult;
  pillars: ContentPillarPlanResult;
  blogCalendar: BlogCalendarResult;
  socialCalendar: SocialCalendarResult;
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
 * Video calendar generation. `build()` is pure — no fetches, no HTTP calls —
 * so it can be unit-tested directly. Consumes the campaign's own 14B topics
 * + 14C pillars + 14D blog calendar + 14E social calendar; never fabricates
 * video work without real evidence, and never assigns a platform.
 */
@Injectable()
export class VideoCalendarService {
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
  ) {}

  /**
   * PURE. Builds a deterministic 30-day video calendar strictly bounded by
   * real video-format/activity evidence and 14B/14C/14D/14E evidence.
   */
  build(input: VideoCalendarBuildInput): VideoCalendarResult {
    const hasVideoSupport =
      input.campaignPlan.activities.some((a) => a.type === 'video') || input.growthStrategy.contentStrategy.formats.some((f) => f.format === 'short_video' || f.format === 'long_video');

    if (!hasVideoSupport) {
      return {
        durationDays: 30,
        weeks: [],
        items: [],
        topPriorityItemIds: [],
        confidenceScore: 0,
        missingEvidence: ['No reliable video calendar was detected from the current campaign channels, formats, and content evidence.'],
        warnings: [DISCLAIMER],
        generatedAt: new Date(),
      };
    }

    const ideaById = new Map(input.ideas.ideas.map((i) => [i.id, i]));
    const activityById = new Map(input.campaignPlan.activities.map((a) => [a.id, a]));
    const topicById = new Map(input.topics.topics.map((t) => [t.id, t]));
    const pillarById = new Map(input.pillars.pillars.map((p) => [p.id, p]));
    const messagingPillarById = new Map(input.growthStrategy.messaging.pillars.map((p) => [p.id, p]));

    const topicItems = this.selectTopicItems(input, topicById, ideaById);
    const coveredTopicIds = new Set(topicItems.map((r) => r.topic?.id).filter((id): id is string => !!id));
    const repurposeItems = this.selectRepurposeItems(input, pillarById, coveredTopicIds);

    const raw = [...topicItems, ...repurposeItems];
    const scored = raw.map((r) => this.scoreItem(r, input, activityById, messagingPillarById));
    const deduped = this.dedupeAndCap(scored);

    const { items, weeks } = this.assignSchedule(deduped);

    const topPriorityItemIds = [...items]
      .sort((a, b) => b.priorityScore - a.priorityScore || a.id.localeCompare(b.id))
      .slice(0, this.getMaxTopPriority())
      .map((i) => i.id);

    const missingEvidence: string[] = [];
    if (items.length === 0) missingEvidence.push('No reliable video calendar was detected from the current campaign channels, formats, and content evidence.');

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
  // Selection — topic-anchored items
  // ---------------------------------------------------------------------

  private selectTopicItems(input: VideoCalendarBuildInput, topicById: Map<string, ContentTopic>, ideaById: Map<string, ContentIdea>): RawItem[] {
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
          const type = this.dominantVideoType(memberIdeas, pillar);
          raw.push({ pillar, topic, type, memberIdeas });
        }
      }
    }
    return raw;
  }

  private dominantVideoType(ideas: ContentIdea[], pillar: CampaignContentPillar): VideoContentType {
    if (ideas.length === 0) return 'educational';
    const counts = new Map<ContentIdeaType, number>();
    for (const idea of ideas) counts.set(idea.type, (counts.get(idea.type) ?? 0) + 1);
    const dominant = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    const mapped = VIDEO_TYPE_BY_IDEA_TYPE[dominant];
    // 'explainer' is a genuinely distinct category-explanation signal —
    // only applied when the parent pillar's own theme (a real 14C signal,
    // not an incidental per-idea hint) confirms category-education framing.
    if (mapped === 'educational' && pillar.theme === 'category_education') return 'explainer';
    return mapped;
  }

  // ---------------------------------------------------------------------
  // Selection — blog/social repurposing (deduped per topic/pillar, prefers
  // the stronger source when both a blog and social item exist for the
  // same underlying topic).
  // ---------------------------------------------------------------------

  private selectRepurposeItems(input: VideoCalendarBuildInput, pillarById: Map<string, CampaignContentPillar>, coveredTopicIds: Set<string>): RawItem[] {
    type Candidate = { key: string; source: 'blog' | 'social'; blogItem?: BlogCalendarItem; socialItem?: SocialCalendarItem; priorityScore: number };

    const strongBlogItems = [...input.blogCalendar.items]
      .filter((b) => b.priorityScore >= MIN_REPURPOSE_PRIORITY && !coveredTopicIds.has(b.topicId))
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, this.getMaxBlogRepurpose());
    const strongSocialItems = [...input.socialCalendar.items]
      .filter((s) => s.priorityScore >= MIN_REPURPOSE_PRIORITY && VIDEO_SUITABLE_SOCIAL_TYPES.includes(s.type) && !(s.topicId && coveredTopicIds.has(s.topicId)))
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, this.getMaxSocialRepurpose());

    const candidates: Candidate[] = [
      ...strongBlogItems.map((b) => ({ key: `${b.pillarId}|${b.topicId}`, source: 'blog' as const, blogItem: b, priorityScore: b.priorityScore })),
      ...strongSocialItems.map((s) => ({ key: `${s.pillarId}|${s.topicId ?? ''}`, source: 'social' as const, socialItem: s, priorityScore: s.priorityScore })),
    ];

    const byKey = new Map<string, Candidate>();
    for (const c of candidates) {
      const existing = byKey.get(c.key);
      if (!existing || c.priorityScore > existing.priorityScore) byKey.set(c.key, c);
    }

    const raw: RawItem[] = [];
    for (const c of byKey.values()) {
      const pillar = pillarById.get(c.blogItem?.pillarId ?? c.socialItem?.pillarId ?? '');
      if (!pillar) continue;
      if (c.source === 'blog' && c.blogItem) {
        raw.push({ pillar, type: 'blog_repurpose', memberIdeas: [], sourceBlogItem: c.blogItem, sourcePriorityScore: c.blogItem.priorityScore, sourceConfidenceScore: c.blogItem.confidenceScore, minDay: c.blogItem.day + 1 });
      } else if (c.socialItem) {
        raw.push({
          pillar,
          type: 'social_repurpose',
          memberIdeas: [],
          sourceSocialItem: c.socialItem,
          sourcePriorityScore: c.socialItem.priorityScore,
          sourceConfidenceScore: c.socialItem.confidenceScore,
          minDay: c.socialItem.day + 1,
        });
      }
    }
    return raw;
  }

  // ---------------------------------------------------------------------
  // Scoring
  // ---------------------------------------------------------------------

  private scoreItem(
    raw: RawItem,
    input: VideoCalendarBuildInput,
    activityById: Map<string, CampaignActivity>,
    messagingPillarById: Map<string, MessagingPillar>,
  ): VideoCalendarItem & { weekHint: WeekHint; minDay?: number } {
    const { pillar, topic, type, memberIdeas, sourceBlogItem, sourceSocialItem, sourcePriorityScore, sourceConfidenceScore } = raw;
    const linkedActivities = dedupeStrings(memberIdeas.flatMap((i) => i.campaignActivityIds))
      .map((id) => activityById.get(id))
      .filter((a): a is CampaignActivity => !!a);
    const videoActivities = input.campaignPlan.activities.filter((a) => a.type === 'video');
    const messagingPillarIds = dedupeStrings(pillar.messagingPillarIds);
    const messagingPillars = messagingPillarIds.map((id) => messagingPillarById.get(id)).filter((p): p is MessagingPillar => !!p);

    const dims: { weight: number; value: number }[] = [];
    if (topic) dims.push({ weight: 0.25, value: topic.priorityScore });
    dims.push({ weight: 0.2, value: pillar.priorityScore });
    const activityOrFormatSupport = [...linkedActivities, ...videoActivities];
    if (activityOrFormatSupport.length > 0) dims.push({ weight: 0.2, value: mean(activityOrFormatSupport.map((a) => a.priorityScore)) });
    if (messagingPillars.length > 0) dims.push({ weight: 0.1, value: mean(messagingPillars.map((p) => p.priorityScore)) });
    const funnelStage = topic?.funnelStages[0] ?? sourceBlogItem?.funnelStage ?? sourceSocialItem?.funnelStage ?? pillar.funnelStages[0] ?? 'awareness';
    const funnelStageScore = input.growthStrategy.funnel.stages.find((s) => s.stage === funnelStage)?.priorityScore;
    if (funnelStageScore !== undefined) dims.push({ weight: 0.1, value: funnelStageScore });
    if (sourcePriorityScore !== undefined) dims.push({ weight: 0.1, value: sourcePriorityScore });
    const audienceSegmentIds = dedupeStrings([...(topic?.audienceSegmentIds ?? []), ...pillar.audienceSegmentIds]).filter((id) => input.campaign.audienceSegmentIds.includes(id));
    if (audienceSegmentIds.length > 0) dims.push({ weight: 0.05, value: 70 });

    const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0);
    const rawPriorityScore = totalWeight > 0 ? clamp(Math.round(dims.reduce((sum, d) => sum + d.weight * d.value, 0) / totalWeight), 0, 100) : 50;
    const priorityScore = activityOrFormatSupport.length > 0 ? rawPriorityScore : Math.round(rawPriorityScore * 0.9);

    const confDims: { weight: number; value: number }[] = [{ weight: 0.25, value: pillar.confidenceScore }];
    if (topic) confDims.push({ weight: 0.25, value: topic.confidenceScore });
    if (linkedActivities.length > 0) confDims.push({ weight: 0.15, value: input.campaignPlan.confidenceScore });
    if (messagingPillars.length > 0) confDims.push({ weight: 0.15, value: mean(messagingPillars.map((p) => p.confidenceScore)) });
    if (sourceConfidenceScore !== undefined) confDims.push({ weight: 0.15, value: sourceConfidenceScore });
    if (audienceSegmentIds.length > 0) confDims.push({ weight: 0.1, value: 65 });
    const confTotalWeight = confDims.reduce((sum, d) => sum + d.weight, 0);
    const sourceCount = [true, !!topic, linkedActivities.length > 0, messagingPillars.length > 0, sourceConfidenceScore !== undefined, audienceSegmentIds.length > 0].filter(Boolean).length;
    const diversityBonus = Math.min((sourceCount - 1) * 3, 9);
    const confidenceScore = confTotalWeight > 0 ? clamp(Math.round(confDims.reduce((sum, d) => sum + d.weight * d.value, 0) / confTotalWeight + diversityBonus), 0, 100) : 40;

    const sourceTitle = sourceBlogItem?.title ?? sourceSocialItem?.title ?? topic?.title ?? pillar.title;
    const title = TITLE_TEMPLATES[type](sourceTitle);
    const angle = `${ANGLE_FRAGMENTS[type]} "${sourceTitle.toLowerCase()}".`;
    const keywords = dedupeStrings([...(topic?.keywords ?? []), ...(sourceBlogItem?.primaryKeyword ? [sourceBlogItem.primaryKeyword] : []), ...(sourceSocialItem?.keywords ?? [])]).slice(
      0,
      this.getMaxKeywordsPerItem(),
    );
    const cta = this.ctaFor(type, memberIdeas);
    const formatDirection = this.formatFor(type, memberIdeas);

    const reasons = dedupeStrings([...(topic?.reasons ?? []), ...pillar.reasons]).slice(0, 5);
    const warnings = audienceSegmentIds.length === 0 ? ['No specific audience segment evidence is available; this item applies broadly.'] : [];

    let weekHint: WeekHint = WEEK_HINT_BY_TYPE[type];
    let minDay = raw.minDay;
    if (sourceBlogItem) weekHint = this.weekHintForDay(sourceBlogItem.day);
    if (sourceSocialItem) weekHint = this.weekHintForDay(sourceSocialItem.day);

    return {
      id: '',
      day: 0,
      week: 0,
      title,
      type,
      formatDirection,
      angle,
      priorityScore,
      confidenceScore,
      pillarId: pillar.id,
      topicId: topic?.id ?? sourceBlogItem?.topicId ?? sourceSocialItem?.topicId,
      funnelStage,
      audienceSegmentIds,
      messagingPillarIds,
      keywords,
      sourceBlogItemId: sourceBlogItem?.id,
      sourceSocialItemId: sourceSocialItem?.id,
      relatedCampaignActivityIds: dedupeStrings(linkedActivities.map((a) => a.id)),
      suggestedCTA: cta,
      dependencies: [],
      successSignals: SUCCESS_SIGNALS_BY_TYPE[type],
      status: 'planned',
      reasons,
      warnings,
      weekHint,
      minDay,
    };
  }

  private weekHintForDay(day: number): WeekHint {
    if (day <= 7) return 1;
    if (day <= 14) return 2;
    if (day <= 21) return 3;
    return 4;
  }

  private ctaFor(type: VideoContentType, ideas: ContentIdea[]): string | undefined {
    const fromIdea = ideas.map((i) => i.suggestedCTA).find((c) => !!c);
    if (fromIdea) return fromIdea;
    return CTA_FALLBACK_BY_TYPE[type];
  }

  private formatFor(type: VideoContentType, ideas: ContentIdea[]): VideoFormatDirection {
    if (type === 'conversion_support') {
      const hasDemoEvidence = ideas.some((i) => i.suggestedCTA === 'Request a demo');
      return hasDemoEvidence ? 'demo_direction' : 'talking_head_direction';
    }
    return FORMAT_BY_TYPE[type];
  }

  // ---------------------------------------------------------------------
  // Dedup + cap
  // ---------------------------------------------------------------------

  private dedupeAndCap(items: (VideoCalendarItem & { weekHint: WeekHint; minDay?: number })[]) {
    const byKey = new Map<string, (typeof items)[number]>();
    for (const item of items) {
      const key = [item.pillarId, item.topicId ?? '', item.type, item.formatDirection, item.funnelStage].join('|');
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

  private assignSchedule(items: (VideoCalendarItem & { weekHint: WeekHint; minDay?: number })[]): { items: VideoCalendarItem[]; weeks: VideoWeekPlan[] } {
    const byWeek = new Map<WeekHint, typeof items>();
    for (const item of items) {
      const list = byWeek.get(item.weekHint) ?? [];
      list.push(item);
      byWeek.set(item.weekHint, list);
    }

    const minSpacing = this.getMinSpacingDays();
    const finalItems: (VideoCalendarItem & { key: string; weekHint: WeekHint })[] = [];
    const idByPillarType = new Map<string, string>();
    const weeks: VideoWeekPlan[] = [];

    for (const weekHint of [1, 2, 3, 4] as WeekHint[]) {
      const weekItems = (byWeek.get(weekHint) ?? []).sort((a, b) => b.priorityScore - a.priorityScore);
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

        const id = `video-${finalItems.length + 1}`;
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
    // same pillar's schedule.
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

    return { items: finalItems.map(({ key: _key, weekHint: _hint, ...rest }) => rest), weeks };
  }

  // ---------------------------------------------------------------------
  // Orchestration
  // ---------------------------------------------------------------------

  async buildVideoCalendarForCampaign(organizationId: string, productId: string, campaignId: string, userId: string): Promise<VideoCalendarResult> {
    // Cheap campaign-approval check first — this is itself the tenant/
    // product/campaign check, and avoids the expensive Growth Strategy
    // rebuild entirely when the campaign isn't even approved yet.
    const campaignApproval = await this.campaignReviewService.isCampaignApprovedForCurrentVersion(organizationId, productId, campaignId, userId);
    if (!campaignApproval.approved) {
      throw new ConflictException(campaignApproval.reason ?? 'Approve this campaign before building a video calendar.');
    }

    const strategyReview = await this.growthStrategyReviewService.getReview(organizationId, productId, userId);
    if (strategyReview.status !== 'approved') {
      throw new ConflictException('Approve the current Growth Strategy before building a video calendar.');
    }
    const product = await this.productsService.findOne(organizationId, productId, userId);
    const productUpdatedAt: Date = (product as { updatedAt?: Date }).updatedAt ?? new Date(0);
    const strategyStillApproved = await this.growthStrategyReviewService.isStrategyApprovedForCurrentVersion(organizationId, productId, userId, productUpdatedAt);
    if (!strategyStillApproved) {
      throw new ConflictException('The product has changed since the Growth Strategy was last approved. Review and approve it again before building a video calendar.');
    }

    const campaign = await this.campaignsService.findOne(organizationId, productId, campaignId, userId);
    if (!campaign.goal) {
      throw new BadRequestException('Define a campaign goal before building a video calendar.');
    }
    if (!campaign.plan) {
      throw new BadRequestException('Generate a 30-day campaign plan before building a video calendar.');
    }

    // Single internal orchestration pass — Growth Strategy is built once,
    // and 14A ideas / 14B topics / 14C pillars / 14D blog calendar / 14E
    // social calendar are each generated exactly once in memory.
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

    return this.build({
      ideas: ideaResult,
      topics: topicResult,
      pillars: pillarResult,
      blogCalendar: blogCalendarResult,
      socialCalendar: socialCalendarResult,
      growthStrategy: { messaging: overview.messaging, contentStrategy: overview.contentStrategy, funnel: overview.funnel },
      campaign: campaignInput,
      campaignPlan: campaign.plan,
    });
  }

  // ---------------------------------------------------------------------
  // Env-configurable limits
  // ---------------------------------------------------------------------

  private getMaxItems(): number {
    return this.getEnvNumber('VIDEO_CALENDAR_MAX_ITEMS', DEFAULT_MAX_ITEMS);
  }

  private getMinSpacingDays(): number {
    return this.getEnvNumber('VIDEO_CALENDAR_MIN_SPACING_DAYS', DEFAULT_MIN_SPACING_DAYS);
  }

  private getMaxKeywordsPerItem(): number {
    return this.getEnvNumber('VIDEO_CALENDAR_MAX_KEYWORDS_PER_ITEM', DEFAULT_MAX_KEYWORDS_PER_ITEM);
  }

  private getMaxTopPriority(): number {
    return this.getEnvNumber('VIDEO_CALENDAR_MAX_TOP_PRIORITY', DEFAULT_MAX_TOP_PRIORITY);
  }

  private getMaxBlogRepurpose(): number {
    return this.getEnvNumber('VIDEO_CALENDAR_MAX_BLOG_REPURPOSE', DEFAULT_MAX_BLOG_REPURPOSE);
  }

  private getMaxSocialRepurpose(): number {
    return this.getEnvNumber('VIDEO_CALENDAR_MAX_SOCIAL_REPURPOSE', DEFAULT_MAX_SOCIAL_REPURPOSE);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
