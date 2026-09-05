import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CampaignReviewService } from '../campaigns/campaign-review.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import type { CampaignActivity, CampaignActivityType, CampaignPlanResult } from '../campaigns/types/campaign-plan.types';
import type { CampaignAudienceChannelMapping } from '../campaigns/types/campaign-audience-channel.types';
import type { CampaignGoal, CampaignGoalType } from '../campaigns/types/campaign-goal.types';
import type { ConversionActionType, ConversionStrategyResult } from '../growth-strategy/types/conversion-strategy.types';
import type { ContentFormat, ContentPillar, ContentStrategyResult } from '../growth-strategy/types/content-strategy.types';
import type { FunnelStrategyResult } from '../growth-strategy/types/funnel-strategy.types';
import type { MessagingPillar, MessagingStrategyResult } from '../growth-strategy/types/messaging-strategy.types';
import { GrowthStrategyReviewService } from '../growth-strategy/growth-strategy-review.service';
import { GrowthStrategyService } from '../growth-strategy/growth-strategy.service';
import { ProductsService } from '../products/products.service';
import type { ContentIdea, ContentIdeaResult, ContentIdeaType } from './types/content-idea.types';

const DEFAULT_MAX_TOTAL = 30;
const DEFAULT_MAX_PRIMARY = 8;
const DEFAULT_MAX_PER_ACTIVITY = 3;
const DEFAULT_MAX_KEYWORDS = 5;

const DISCLAIMER = 'Content ideas are evidence-based planning directions, not final content or verified performance predictions.';

// Only these conversion-action types are ever mapped to a suggested CTA —
// trial/purchase are deliberately excluded, and even these are only used
// when 12G actually evidenced them on the source activity.
const CTA_BY_CONVERSION_TYPE: Partial<Record<ConversionActionType, string>> = {
  product_exploration: 'Explore the product',
  signup: 'Sign up',
  lead_capture: 'Contact',
  demo: 'Request a demo',
  activation: 'Start onboarding',
  generic_conversion: 'Learn more',
};

const CTA_ELIGIBLE_TYPES: ContentIdeaType[] = ['conversion_support', 'buyer_enablement', 'activation'];

const TITLE_TEMPLATES: Record<ContentIdeaType, (topic: string) => string> = {
  educational: (t) => `Understanding ${t}`,
  problem_solution: (t) => `Solving ${t} Challenges`,
  use_case: (t) => `${t}: A Practical Use Case`,
  comparison: (t) => `${t}: Comparing Approaches`,
  differentiation: (t) => `What Sets ${t} Apart`,
  buyer_enablement: (t) => `Evaluating ${t} For Your Team`,
  conversion_support: (t) => `Getting Started With ${t}`,
  activation: (t) => `Getting the Most From ${t} Early On`,
  thought_leadership: (t) => `The Future of ${t}`,
  faq: (t) => `Frequently Asked Questions About ${t}`,
  proof: (t) => `Building the Case for ${t}`,
  repurpose: (t) => `${t}: Adapted for a New Channel`,
};

const ANGLE_FRAGMENTS: Record<ContentIdeaType, string> = {
  educational: 'Help the target audience understand',
  problem_solution: 'Show how the product addresses a real pain point around',
  use_case: 'Walk through a concrete, evidenced use case for',
  comparison: 'Compare approaches to help evaluators reason about',
  differentiation: 'Explain what genuinely differentiates the product with respect to',
  buyer_enablement: 'Give evaluators what they need to build a confident case for',
  conversion_support: 'Support the next supported conversion step with proof and clarity around',
  activation: 'Guide new users toward their first-value action around',
  thought_leadership: 'Share a category-level perspective on',
  faq: 'Answer the most common evidenced questions/uncertainties about',
  proof: 'Direction to collect and document validated proof around',
  repurpose: 'Adapt an already-evidenced idea into a new channel/format around',
};

const ACTIVITY_TO_FORMAT_PREFERENCE: Partial<Record<CampaignActivityType, ContentFormat[]>> = {
  seo: ['guide', 'blog'],
  blog: ['guide', 'blog'],
  social: ['social_post'],
  landing_page: ['landing_page'],
  email: ['email'],
  video: ['short_video', 'long_video', 'webinar'],
  outbound: ['documentation'],
  community: ['social_post'],
  partnership: ['documentation'],
  paid_search: ['landing_page'],
  paid_social: ['social_post', 'landing_page'],
  conversion: ['faq', 'landing_page'],
  activation: ['guide', 'documentation'],
  proof: ['documentation'],
};

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function labelize(value: string): string {
  return value
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
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

interface RawIdea {
  type: ContentIdeaType;
  topic: string;
  funnelStage: string;
  channel: string;
  formatDirection: string;
  audienceSegmentIds: string[];
  messagingPillarIds: string[];
  contentPillarIds: string[];
  campaignActivityIds: string[];
  keywords: string[];
  objective: string;
  suggestedCTA?: string;
  reasons: string[];
  warnings: string[];
  activityPriorityScore?: number;
  activityConfidenceScore?: number;
  supportPriorityScores: number[];
  supportConfidenceScores: number[];
}

export interface ContentIdeaGenerateInput {
  growthStrategy: {
    messaging: MessagingStrategyResult;
    contentStrategy: ContentStrategyResult;
    funnel: FunnelStrategyResult;
    conversionStrategy: ConversionStrategyResult;
  };
  campaign: {
    goal: CampaignGoal;
    audienceChannelMapping: CampaignAudienceChannelMapping;
    channelIds: string[];
    audienceSegmentIds: string[];
  };
  campaignPlan: CampaignPlanResult;
}

interface Ctx {
  goal: CampaignGoal;
  goalType: CampaignGoalType;
  allowedChannels: Set<string>;
  allowedAudiences: string[];
  messaging: MessagingStrategyResult;
  contentStrategy: ContentStrategyResult;
  funnel: FunnelStrategyResult;
  conversionStrategy: ConversionStrategyResult;
  supportedFormats: Set<ContentFormat>;
  contentPillarById: Map<string, ContentPillar>;
  messagingPillarById: Map<string, MessagingPillar>;
}

/**
 * Content idea generation. `generate()` is pure — no fetches, no HTTP calls —
 * so it can be unit-tested directly. Everything else on this service is the
 * thin, tenant-safe orchestration around it (campaign/strategy approval
 * gating, strategy build reuse, reusing the already-persisted campaign plan
 * rather than rebuilding it).
 */
@Injectable()
export class ContentIdeaService {
  constructor(
    private readonly configService: ConfigService,
    private readonly productsService: ProductsService,
    private readonly campaignsService: CampaignsService,
    private readonly campaignReviewService: CampaignReviewService,
    private readonly growthStrategyService: GrowthStrategyService,
    private readonly growthStrategyReviewService: GrowthStrategyReviewService,
  ) {}

  /**
   * PURE. Derives content ideas primarily from the campaign's own persisted
   * 30-day plan activities, cross-referenced against Sprint 12 content/
   * messaging/funnel/conversion evidence. Never invents a channel, audience,
   * format, or CTA beyond what's already evidenced.
   */
  generate(input: ContentIdeaGenerateInput): ContentIdeaResult {
    const ctx: Ctx = {
      goal: input.campaign.goal,
      goalType: input.campaign.goal.type,
      allowedChannels: new Set(input.campaign.channelIds),
      allowedAudiences: input.campaign.audienceSegmentIds,
      messaging: input.growthStrategy.messaging,
      contentStrategy: input.growthStrategy.contentStrategy,
      funnel: input.growthStrategy.funnel,
      conversionStrategy: input.growthStrategy.conversionStrategy,
      supportedFormats: new Set(input.growthStrategy.contentStrategy.formats.map((f) => f.format)),
      contentPillarById: new Map(input.growthStrategy.contentStrategy.pillars.map((p) => [p.id, p])),
      messagingPillarById: new Map(input.growthStrategy.messaging.pillars.map((p) => [p.id, p])),
    };

    const rawByActivity = new Map<string, RawIdea[]>();
    for (const activity of input.campaignPlan.activities) {
      const ideas = this.ideasForActivity(activity, ctx);
      if (ideas.length > 0) rawByActivity.set(activity.id, ideas.slice(0, this.getMaxPerActivity()));
    }
    const raw = Array.from(rawByActivity.values()).flat();

    const thoughtLeadership = this.thoughtLeadershipIdea(ctx);
    if (thoughtLeadership) raw.push(thoughtLeadership);

    const faqIdea = this.faqIdea(ctx, input.campaignPlan.activities);
    if (faqIdea) raw.push(faqIdea);

    const scored = raw.map((r) => this.scoreIdea(r, ctx));
    const repurposed = this.repurposeIdeas(scored, ctx);
    const allScored = [...scored, ...repurposed];

    const deduped = this.dedupeAndRank(allScored);

    const ideas: ContentIdea[] = deduped.map((idea, index) => ({ ...idea, id: `idea-${index + 1}-${normalizeTitleKey(idea.title).replace(/\s+/g, '-').slice(0, 40)}` }));

    const primaryIdeaIds = [...ideas]
      .sort((a, b) => b.priorityScore - a.priorityScore || a.id.localeCompare(b.id))
      .slice(0, this.getMaxPrimary())
      .map((i) => i.id);

    const missingEvidence: string[] = [];
    if (ideas.length === 0) missingEvidence.push('No reliable content ideas were detected from the current approved strategy and campaign plan.');
    if (ctx.allowedAudiences.length === 0) missingEvidence.push('No specific audience segment evidence is available; some ideas apply broadly.');

    const confidenceScore = ideas.length ? Math.round(mean(ideas.map((i) => i.confidenceScore))) : 0;

    return {
      ideas,
      primaryIdeaIds,
      confidenceScore,
      missingEvidence,
      warnings: [DISCLAIMER],
      generatedAt: new Date(),
    };
  }

  // ---------------------------------------------------------------------
  // Activity-driven idea rules
  // ---------------------------------------------------------------------

  private ideasForActivity(activity: CampaignActivity, ctx: Ctx): RawIdea[] {
    if (!ctx.allowedChannels.has(activity.channel)) return [];

    const contentPillar = activity.contentPillarIds[0] ? ctx.contentPillarById.get(activity.contentPillarIds[0]) : undefined;
    const messagingPillar = activity.messagingPillarIds[0] ? ctx.messagingPillarById.get(activity.messagingPillarIds[0]) : undefined;
    const topic = contentPillar?.title ?? messagingPillar?.title ?? `${labelize(activity.type)} at the ${labelize(activity.funnelStage)} Stage`;

    const base = (type: ContentIdeaType, formatDirection: string | undefined, extraReasons: string[] = []): RawIdea | null => {
      if (!formatDirection) return null;
      const audienceSegmentIds = this.resolveAudiences(ctx, activity.audienceSegmentIds);
      return {
        type,
        topic,
        funnelStage: activity.funnelStage,
        channel: activity.channel,
        formatDirection,
        audienceSegmentIds,
        messagingPillarIds: messagingPillar ? [messagingPillar.id] : [],
        contentPillarIds: contentPillar ? [contentPillar.id] : [],
        campaignActivityIds: [activity.id],
        keywords: activity.keywordDirections.slice(0, this.getMaxKeywords()),
        objective: `Support "${activity.title}" with a strategic content direction.`,
        suggestedCTA: this.ctaFor(type, activity),
        reasons: dedupeStrings([`Derived from campaign activity "${activity.title}".`, ...extraReasons]),
        warnings: ctx.allowedAudiences.length === 0 ? ['No specific audience segment evidence is available; this idea applies broadly.'] : [],
        activityPriorityScore: activity.priorityScore,
        activityConfidenceScore: activity.confidenceScore,
        supportPriorityScores: [contentPillar?.priorityScore, messagingPillar?.priorityScore].filter((v): v is number => v !== undefined),
        supportConfidenceScores: [contentPillar?.confidenceScore, messagingPillar?.confidenceScore].filter((v): v is number => v !== undefined),
      };
    };

    switch (activity.type) {
      case 'seo':
      case 'blog': {
        if (contentPillar?.theme === 'differentiation' && ctx.supportedFormats.has('comparison_page')) {
          return [base('comparison', 'comparison_page', [`Content pillar "${contentPillar.title}" evidences differentiation.`])].filter((v): v is RawIdea => !!v);
        }
        if (contentPillar?.theme.includes('use_case')) {
          return [base('use_case', this.pickFormat(ctx, ['guide', 'blog']), [`Content pillar "${contentPillar.title}" evidences use-case effectiveness.`])].filter((v): v is RawIdea => !!v);
        }
        return [base('educational', this.pickFormat(ctx, ['guide', 'blog']))].filter((v): v is RawIdea => !!v);
      }
      case 'social':
        return [base('educational', 'social_post')].filter((v): v is RawIdea => !!v);
      case 'landing_page': {
        if (activity.conversionDirection) {
          return [base('conversion_support', 'landing_page', [`Activity carries a supported conversion direction ("${labelize(activity.conversionDirection)}").`])].filter((v): v is RawIdea => !!v);
        }
        if (messagingPillar?.theme === 'differentiation') {
          return [base('differentiation', 'landing_page', [`Messaging pillar "${messagingPillar.title}" evidences differentiation.`])].filter((v): v is RawIdea => !!v);
        }
        if (ctx.goalType === 'lead_generation' || ctx.goalType === 'buyer_enablement') {
          return [base('buyer_enablement', 'landing_page')].filter((v): v is RawIdea => !!v);
        }
        return [base('educational', 'landing_page')].filter((v): v is RawIdea => !!v);
      }
      case 'email':
        return [base('buyer_enablement', 'email')].filter((v): v is RawIdea => !!v);
      case 'video': {
        const format = this.pickFormat(ctx, ['short_video', 'long_video', 'webinar']);
        return format ? [base('educational', format)].filter((v): v is RawIdea => !!v) : [];
      }
      case 'outbound':
        return [base('buyer_enablement', 'documentation')].filter((v): v is RawIdea => !!v);
      case 'community':
        return [base('educational', 'social_post')].filter((v): v is RawIdea => !!v);
      case 'partnership':
        return [base('differentiation', 'documentation')].filter((v): v is RawIdea => !!v);
      case 'paid_search':
      case 'paid_social':
        return [base('conversion_support', 'landing_page')].filter((v): v is RawIdea => !!v);
      case 'conversion':
        return [base('conversion_support', this.pickFormat(ctx, ['faq', 'landing_page']))].filter((v): v is RawIdea => !!v);
      case 'activation':
        return [base('activation', this.pickFormat(ctx, ['guide', 'documentation']))].filter((v): v is RawIdea => !!v);
      case 'proof':
        return [base('proof', 'documentation', [...activity.recommendedActions.slice(0, 2)])].filter((v): v is RawIdea => !!v);
      case 'measurement':
        return [];
      default:
        return [];
    }
  }

  // ---------------------------------------------------------------------
  // Non-activity ideas: thought leadership, FAQ, repurpose
  // ---------------------------------------------------------------------

  private thoughtLeadershipIdea(ctx: Ctx): RawIdea | null {
    if (!ctx.allowedChannels.has('content') && !ctx.allowedChannels.has('organic_social')) return null;
    const strongPositioningPillar = ctx.messaging.pillars.find((p) => p.theme === 'differentiation' && p.priorityScore >= 75);
    if (!strongPositioningPillar) return null;

    const channel = ctx.allowedChannels.has('content') ? 'content' : 'organic_social';
    return {
      type: 'thought_leadership',
      topic: strongPositioningPillar.title,
      funnelStage: 'awareness',
      channel,
      formatDirection: this.pickFormat(ctx, ['guide', 'blog']) ?? 'blog',
      audienceSegmentIds: this.resolveAudiences(ctx, strongPositioningPillar.targetAudienceSegmentIds),
      messagingPillarIds: [strongPositioningPillar.id],
      contentPillarIds: [],
      campaignActivityIds: [],
      keywords: [],
      objective: 'Establish a category-level point of view backed by strong positioning evidence.',
      reasons: [`Strong positioning/differentiation evidence ("${strongPositioningPillar.title}") supports a thought-leadership direction.`],
      warnings: ctx.allowedAudiences.length === 0 ? ['No specific audience segment evidence is available; this idea applies broadly.'] : [],
      supportPriorityScores: [strongPositioningPillar.priorityScore],
      supportConfidenceScores: [strongPositioningPillar.confidenceScore],
    };
  }

  private faqIdea(ctx: Ctx, activities: CampaignActivity[]): RawIdea | null {
    if (!ctx.allowedChannels.has('content')) return null;
    const distinctFrictionTypes = new Set(ctx.conversionStrategy.frictions.map((f) => f.type));
    if (distinctFrictionTypes.size < 2) return null;

    const relatedActivity = activities.find((a) => ctx.allowedChannels.has(a.channel) && (a.type === 'blog' || a.type === 'landing_page' || a.type === 'conversion'));
    return {
      type: 'faq',
      topic: 'Common Evaluation Questions',
      funnelStage: relatedActivity?.funnelStage ?? 'consideration',
      channel: 'content',
      formatDirection: 'faq',
      audienceSegmentIds: this.resolveAudiences(ctx, ctx.allowedAudiences),
      messagingPillarIds: [],
      contentPillarIds: [],
      campaignActivityIds: relatedActivity ? [relatedActivity.id] : [],
      keywords: [],
      objective: 'Address recurring evaluation uncertainties directly and factually.',
      reasons: [`${distinctFrictionTypes.size} distinct conversion frictions are evidenced, supporting a consolidated FAQ direction.`],
      warnings: ctx.allowedAudiences.length === 0 ? ['No specific audience segment evidence is available; this idea applies broadly.'] : [],
      supportPriorityScores: ctx.conversionStrategy.frictions.map((f) => f.severityScore),
      supportConfidenceScores: ctx.conversionStrategy.frictions.map((f) => f.confidenceScore),
    };
  }

  private repurposeIdeas(scored: ContentIdea[], ctx: Ctx): ContentIdea[] {
    const byPillar = new Map<string, ContentIdea[]>();
    for (const idea of scored) {
      const pillarId = idea.contentPillarIds[0];
      if (!pillarId) continue;
      const list = byPillar.get(pillarId) ?? [];
      list.push(idea);
      byPillar.set(pillarId, list);
    }

    const out: ContentIdea[] = [];
    for (const [pillarId, group] of byPillar) {
      const coveredChannels = new Set(group.map((i) => i.channel));
      const target = ['organic_social', 'community', 'email'].find((c) => ctx.allowedChannels.has(c) && !coveredChannels.has(c));
      if (!target) continue;

      const source = [...group].sort((a, b) => b.priorityScore - a.priorityScore)[0];
      const formatDirection = target === 'organic_social' || target === 'community' ? 'social_post' : 'email';
      out.push({
        id: '',
        title: TITLE_TEMPLATES.repurpose(source.title),
        angle: `${ANGLE_FRAGMENTS.repurpose} "${source.title}" for the ${labelize(target)} channel.`,
        type: 'repurpose',
        priorityScore: Math.round(source.priorityScore * 0.8),
        confidenceScore: Math.round(source.confidenceScore * 0.8),
        funnelStage: source.funnelStage,
        channel: target,
        formatDirection,
        audienceSegmentIds: source.audienceSegmentIds,
        messagingPillarIds: source.messagingPillarIds,
        contentPillarIds: [pillarId],
        campaignActivityIds: source.campaignActivityIds,
        keywords: source.keywords,
        objective: `Extend "${source.title}" into an additional selected channel without new research.`,
        reasons: [`Existing idea "${source.title}" can be repurposed for the ${labelize(target)} channel already selected for this campaign.`],
        warnings: source.warnings,
      });
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private resolveAudiences(ctx: Ctx, preferred: string[]): string[] {
    if (ctx.allowedAudiences.length === 0) return [];
    const intersected = preferred.filter((id) => ctx.allowedAudiences.includes(id));
    return intersected.length > 0 ? intersected : ctx.allowedAudiences.slice(0, 3);
  }

  private pickFormat(ctx: Ctx, preferred: ContentFormat[]): string | undefined {
    return preferred.find((f) => ctx.supportedFormats.has(f));
  }

  private ctaFor(type: ContentIdeaType, activity: CampaignActivity): string | undefined {
    if (!CTA_ELIGIBLE_TYPES.includes(type)) return undefined;
    if (activity.conversionDirection) {
      const mapped = CTA_BY_CONVERSION_TYPE[activity.conversionDirection as ConversionActionType];
      if (mapped) return mapped;
    }
    return type === 'conversion_support' ? 'Take the next supported conversion action' : undefined;
  }

  // ---------------------------------------------------------------------
  // Scoring
  // ---------------------------------------------------------------------

  private scoreIdea(raw: RawIdea, ctx: Ctx): ContentIdea {
    const dims: { weight: number; value: number }[] = [];
    if (raw.activityPriorityScore !== undefined) dims.push({ weight: 0.3, value: raw.activityPriorityScore });
    dims.push({ weight: 0.2, value: this.goalAlignmentScore(raw.type, ctx.goalType) });
    if (raw.supportPriorityScores.length > 0) dims.push({ weight: 0.2, value: mean(raw.supportPriorityScores) });
    const funnelStageStrategy = ctx.funnel.stages.find((s) => s.stage === raw.funnelStage);
    if (funnelStageStrategy) dims.push({ weight: 0.15, value: funnelStageStrategy.priorityScore });
    if (raw.keywords.length > 0) dims.push({ weight: 0.15, value: 60 });

    const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0);
    const priorityScore = totalWeight > 0 ? clamp(Math.round(dims.reduce((sum, d) => sum + d.weight * d.value, 0) / totalWeight), 0, 100) : 50;

    const confDims: { weight: number; value: number }[] = [];
    if (raw.activityConfidenceScore !== undefined) confDims.push({ weight: 0.35, value: raw.activityConfidenceScore });
    if (raw.supportConfidenceScores.length > 0) confDims.push({ weight: 0.35, value: mean(raw.supportConfidenceScores) });
    if (funnelStageStrategy) confDims.push({ weight: 0.15, value: funnelStageStrategy.confidenceScore });
    if (raw.keywords.length > 0) confDims.push({ weight: 0.15, value: 55 });
    const confTotalWeight = confDims.reduce((sum, d) => sum + d.weight, 0);
    const sourceCount = [raw.activityConfidenceScore !== undefined, raw.supportConfidenceScores.length > 0, !!funnelStageStrategy, raw.keywords.length > 0].filter(Boolean).length;
    const diversityBonus = Math.min((sourceCount - 1) * 3, 9);
    const confidenceScore = confTotalWeight > 0 ? clamp(Math.round(confDims.reduce((sum, d) => sum + d.weight * d.value, 0) / confTotalWeight + diversityBonus), 0, 100) : 40;

    return {
      id: '',
      title: TITLE_TEMPLATES[raw.type](raw.topic),
      angle: `${ANGLE_FRAGMENTS[raw.type]} "${raw.topic.toLowerCase()}".`,
      type: raw.type,
      priorityScore,
      confidenceScore,
      funnelStage: raw.funnelStage,
      channel: raw.channel,
      formatDirection: raw.formatDirection,
      audienceSegmentIds: raw.audienceSegmentIds,
      messagingPillarIds: raw.messagingPillarIds,
      contentPillarIds: raw.contentPillarIds,
      campaignActivityIds: raw.campaignActivityIds,
      keywords: raw.keywords,
      objective: raw.objective,
      suggestedCTA: raw.suggestedCTA,
      reasons: dedupeStrings(raw.reasons),
      warnings: dedupeStrings(raw.warnings),
    };
  }

  private goalAlignmentScore(type: ContentIdeaType, goalType: CampaignGoalType): number {
    const table: Partial<Record<CampaignGoalType, Partial<Record<ContentIdeaType, number>>>> = {
      awareness: { educational: 100, problem_solution: 85, thought_leadership: 70 },
      education: { educational: 100, use_case: 80 },
      consideration: { use_case: 90, comparison: 90, differentiation: 85, faq: 70 },
      lead_generation: { buyer_enablement: 100, conversion_support: 85, faq: 75 },
      conversion: { conversion_support: 100, proof: 85, faq: 75 },
      activation: { activation: 100 },
      positioning: { differentiation: 90, thought_leadership: 85 },
      differentiation: { differentiation: 100, comparison: 90 },
      buyer_enablement: { buyer_enablement: 100, faq: 80, proof: 75 },
    };
    return table[goalType]?.[type] ?? 55;
  }

  // ---------------------------------------------------------------------
  // Dedup
  // ---------------------------------------------------------------------

  private dedupeAndRank(ideas: ContentIdea[]): ContentIdea[] {
    const byKey = new Map<string, ContentIdea>();
    for (const idea of ideas) {
      const key = [idea.type, idea.funnelStage, [...idea.audienceSegmentIds].sort().join(','), normalizeTitleKey(idea.title)].join('|');
      const existing = byKey.get(key);
      // Always merge cross-references from every duplicate, regardless of
      // which one "wins" on score — otherwise an equal-priority duplicate's
      // campaignActivityIds/reasons/warnings would be silently dropped.
      const mergedReasons = dedupeStrings([...(existing?.reasons ?? []), ...idea.reasons]);
      const mergedWarnings = dedupeStrings([...(existing?.warnings ?? []), ...idea.warnings]);
      const mergedActivityIds = dedupeStrings([...(existing?.campaignActivityIds ?? []), ...idea.campaignActivityIds]);
      const winner = !existing || idea.priorityScore > existing.priorityScore ? idea : existing;
      byKey.set(key, { ...winner, reasons: mergedReasons, warnings: mergedWarnings, campaignActivityIds: mergedActivityIds });
    }
    return Array.from(byKey.values())
      .sort((a, b) => b.priorityScore - a.priorityScore || b.confidenceScore - a.confidenceScore || a.title.localeCompare(b.title))
      .slice(0, this.getMaxTotal());
  }

  // ---------------------------------------------------------------------
  // Orchestration
  // ---------------------------------------------------------------------

  async generateIdeasForCampaign(organizationId: string, productId: string, campaignId: string, userId: string): Promise<ContentIdeaResult> {
    // Cheap campaign-approval check first — this is itself the tenant/
    // product/campaign check (it internally verifies both), and avoids the
    // expensive Growth Strategy rebuild entirely when the campaign isn't
    // even approved yet.
    const campaignApproval = await this.campaignReviewService.isCampaignApprovedForCurrentVersion(organizationId, productId, campaignId, userId);
    if (!campaignApproval.approved) {
      throw new ConflictException(campaignApproval.reason ?? 'Approve this campaign before generating content ideas.');
    }

    const strategyReview = await this.growthStrategyReviewService.getReview(organizationId, productId, userId);
    if (strategyReview.status !== 'approved') {
      throw new ConflictException('Approve the current Growth Strategy before generating content ideas.');
    }
    const product = await this.productsService.findOne(organizationId, productId, userId);
    const productUpdatedAt: Date = (product as { updatedAt?: Date }).updatedAt ?? new Date(0);
    const strategyStillApproved = await this.growthStrategyReviewService.isStrategyApprovedForCurrentVersion(organizationId, productId, userId, productUpdatedAt);
    if (!strategyStillApproved) {
      throw new ConflictException('The product has changed since the Growth Strategy was last approved. Review and approve it again before generating content ideas.');
    }

    const campaign = await this.campaignsService.findOne(organizationId, productId, campaignId, userId);
    if (!campaign.goal) {
      throw new BadRequestException('Define a campaign goal before generating content ideas.');
    }
    if (!campaign.plan) {
      throw new BadRequestException('Generate a 30-day campaign plan before generating content ideas.');
    }

    // Single internal orchestration pass — never multiple preview endpoints,
    // and the campaign plan is reused as already persisted, never rebuilt.
    const overview = await this.growthStrategyService.buildOverviewForProduct(organizationId, productId, userId);

    return this.generate({
      growthStrategy: { messaging: overview.messaging, contentStrategy: overview.contentStrategy, funnel: overview.funnel, conversionStrategy: overview.conversionStrategy },
      campaign: {
        goal: campaign.goal,
        audienceChannelMapping: campaign.audienceChannelMapping ?? { audiences: [], channels: [], confidenceScore: 0, missingEvidence: [], warnings: [], source: 'strategy' },
        channelIds: campaign.channelIds,
        audienceSegmentIds: campaign.audienceSegmentIds,
      },
      campaignPlan: campaign.plan,
    });
  }

  // ---------------------------------------------------------------------
  // Env-configurable limits
  // ---------------------------------------------------------------------

  private getMaxTotal(): number {
    return this.getEnvNumber('CONTENT_IDEA_MAX_TOTAL', DEFAULT_MAX_TOTAL);
  }

  private getMaxPrimary(): number {
    return this.getEnvNumber('CONTENT_IDEA_MAX_PRIMARY', DEFAULT_MAX_PRIMARY);
  }

  private getMaxPerActivity(): number {
    return this.getEnvNumber('CONTENT_IDEA_MAX_PER_ACTIVITY', DEFAULT_MAX_PER_ACTIVITY);
  }

  private getMaxKeywords(): number {
    return this.getEnvNumber('CONTENT_IDEA_MAX_KEYWORDS', DEFAULT_MAX_KEYWORDS);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
