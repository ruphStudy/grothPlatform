import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CampaignReviewService } from '../campaigns/campaign-review.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import type { CampaignAudienceChannelMapping } from '../campaigns/types/campaign-audience-channel.types';
import type { CampaignGoal, CampaignGoalType } from '../campaigns/types/campaign-goal.types';
import type { CampaignPlanResult } from '../campaigns/types/campaign-plan.types';
import type { ContentPillar, ContentStrategyResult } from '../growth-strategy/types/content-strategy.types';
import type { FunnelStrategyResult } from '../growth-strategy/types/funnel-strategy.types';
import { GrowthStrategyReviewService } from '../growth-strategy/growth-strategy-review.service';
import { GrowthStrategyService } from '../growth-strategy/growth-strategy.service';
import { ProductsService } from '../products/products.service';
import { ContentIdeaService } from './content-idea.service';
import type { ContentIdea, ContentIdeaResult, ContentIdeaType } from './types/content-idea.types';
import type { ContentTopic, ContentTopicTier, TopicPrioritizationResult } from './types/topic-prioritization.types';

const DEFAULT_PRIMARY_MIN_SCORE = 75;
const DEFAULT_SECONDARY_MIN_SCORE = 55;
const DEFAULT_EXPERIMENTAL_MIN_SCORE = 35;
const DEFAULT_OMIT_BELOW_SCORE = 15;
const DEFAULT_MAX_TOPICS = 25;
const DEFAULT_MAX_PRIMARY = 6;
const DEFAULT_MAX_SECONDARY = 10;
const DEFAULT_MAX_IDEAS_PER_TOPIC = 8;
const DEFAULT_MAX_KEYWORDS_PER_TOPIC = 8;

const DISCLAIMER =
  'Topic priorities are evidence-based planning scores and do not represent verified search demand, traffic potential, or expected content performance.';

// Ignored when building the topic-dedup semantic key — generic terms that
// would otherwise force unrelated topics together just because they share a
// common product/category word.
const GENERIC_TOKENS = new Set(['software', 'platform', 'solution', 'tool', 'guide', 'content', 'product', 'the', 'and', 'for', 'with', 'of', 'to', 'in', 'a', 'an']);

// Same goal-alignment convention as 14A's own table, expressed per idea type
// rather than duplicated cross-file logic.
const GOAL_TOPIC_ALIGNMENT: Partial<Record<CampaignGoalType, Partial<Record<ContentIdeaType, number>>>> = {
  awareness: { educational: 100, problem_solution: 85, use_case: 85, thought_leadership: 70 },
  education: { educational: 100, use_case: 80 },
  consideration: { use_case: 90, comparison: 90, differentiation: 85, faq: 70 },
  lead_generation: { buyer_enablement: 100, conversion_support: 85, faq: 75 },
  conversion: { conversion_support: 100, proof: 85, faq: 75 },
  activation: { activation: 100 },
  positioning: { differentiation: 90, thought_leadership: 85 },
  differentiation: { differentiation: 100, comparison: 90 },
  buyer_enablement: { buyer_enablement: 100, faq: 80, proof: 75 },
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

function normalizedSemanticTokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map(stem)
    .filter((t) => !GENERIC_TOKENS.has(t));
}

function inferIntents(keywords: string[]): string[] {
  const intents = new Set<string>();
  for (const kw of keywords) {
    const v = kw.toLowerCase();
    if (/\b(how|guide|learn|tips|what is|practice)\b/.test(v)) intents.add('informational');
    if (/\b(software|platform|tool|solution|service|best)\b/.test(v)) intents.add('commercial');
    if (/\b(pricing|plans?|buy|trial|sign ?up)\b/.test(v)) intents.add('transactional');
    if (/\b(best|vs|versus|alternatives?|comparison)\b/.test(v)) intents.add('comparison');
  }
  return Array.from(intents);
}

export interface TopicPrioritizationInput {
  ideas: ContentIdeaResult;
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

interface Group {
  key: string;
  ideas: ContentIdea[];
}

/**
 * Topic prioritization. `prioritize()` is pure — no fetches, no HTTP calls —
 * so it can be unit-tested directly. Groups the campaign's own 14A content
 * ideas into strategic topics and ranks them into tiers; never invents an
 * idea, audience, channel, or keyword beyond what 14A already evidenced.
 */
@Injectable()
export class TopicPrioritizationService {
  constructor(
    private readonly configService: ConfigService,
    private readonly productsService: ProductsService,
    private readonly campaignsService: CampaignsService,
    private readonly campaignReviewService: CampaignReviewService,
    private readonly growthStrategyService: GrowthStrategyService,
    private readonly growthStrategyReviewService: GrowthStrategyReviewService,
    private readonly contentIdeaService: ContentIdeaService,
  ) {}

  /**
   * PURE. Groups related ideas into topics, scores/tiers them, and applies
   * primary/secondary overflow normalization so tier fields always match
   * the returned id arrays.
   */
  prioritize(input: TopicPrioritizationInput): TopicPrioritizationResult {
    const contentPillarById = new Map(input.growthStrategy.contentStrategy.pillars.map((p) => [p.id, p]));
    const activityById = new Map(input.campaignPlan.activities.map((a) => [a.id, a]));
    const channelFitById = new Map<string, { confidenceScore: number }>(input.campaign.audienceChannelMapping.channels.map((c) => [c.channel, c]));
    const audienceFitById = new Map<string, { confidenceScore: number }>(input.campaign.audienceChannelMapping.audiences.map((a) => [a.audienceSegmentId, a]));

    const groups = this.groupIdeas(input.ideas.ideas);
    const rawTopics = groups.map((g) => this.buildTopic(g, input, contentPillarById, activityById, channelFitById, audienceFitById)).filter((t): t is ContentTopic => t !== null);

    const deduped = this.dedupeTopics(rawTopics);
    const tiered = this.assignTiers(deduped);
    const normalized = this.normalizeOverflow(tiered);

    const primaryTopicIds = normalized.filter((t) => t.tier === 'primary').map((t) => t.id);
    const secondaryTopicIds = normalized.filter((t) => t.tier === 'secondary').map((t) => t.id);

    const missingEvidence: string[] = [];
    if (normalized.length === 0) missingEvidence.push('No reliable content topics were detected from the approved campaign and strategy evidence.');
    if (input.campaign.audienceSegmentIds.length === 0) missingEvidence.push('No specific audience segment evidence is available; some topics apply broadly.');

    const confidenceScore = normalized.length ? Math.round(mean(normalized.map((t) => t.confidenceScore))) : 0;

    return {
      topics: normalized,
      primaryTopicIds,
      secondaryTopicIds,
      confidenceScore,
      missingEvidence,
      warnings: [DISCLAIMER],
      generatedAt: new Date(),
    };
  }

  // ---------------------------------------------------------------------
  // Grouping
  // ---------------------------------------------------------------------

  private groupIdeas(ideas: ContentIdea[]): Group[] {
    const byKey = new Map<string, ContentIdea[]>();
    for (const idea of ideas) {
      const key = idea.contentPillarIds[0] ? `pillar:${idea.contentPillarIds[0]}` : idea.messagingPillarIds[0] ? `msg:${idea.messagingPillarIds[0]}` : `bucket:${idea.type}|${idea.funnelStage}`;
      const list = byKey.get(key) ?? [];
      list.push(idea);
      byKey.set(key, list);
    }
    return Array.from(byKey.entries()).map(([key, groupIdeas]) => ({ key, ideas: groupIdeas.slice(0, DEFAULT_MAX_IDEAS_PER_TOPIC) }));
  }

  // ---------------------------------------------------------------------
  // Topic construction + scoring
  // ---------------------------------------------------------------------

  private buildTopic(
    group: Group,
    input: TopicPrioritizationInput,
    contentPillarById: Map<string, ContentPillar>,
    activityById: Map<string, TopicPrioritizationInput['campaignPlan']['activities'][number]>,
    channelFitById: Map<string, { confidenceScore: number }>,
    audienceFitById: Map<string, { confidenceScore: number }>,
  ): ContentTopic | null {
    if (group.ideas.length === 0) return null;

    const contentPillarIds = dedupeStrings(group.ideas.flatMap((i) => i.contentPillarIds));
    const messagingPillarIds = dedupeStrings(group.ideas.flatMap((i) => i.messagingPillarIds));
    const audienceSegmentIds = dedupeStrings(group.ideas.flatMap((i) => i.audienceSegmentIds)).filter((id) => input.campaign.audienceSegmentIds.includes(id));
    const channels = dedupeStrings(group.ideas.map((i) => i.channel)).filter((c) => input.campaign.channelIds.includes(c));
    const funnelStages = dedupeStrings(group.ideas.map((i) => i.funnelStage));
    const keywords = dedupeStrings(group.ideas.flatMap((i) => i.keywords)).slice(0, this.getMaxKeywordsPerTopic());
    const intentTypes = inferIntents(keywords);

    const anchorPillar = contentPillarIds[0] ? contentPillarById.get(contentPillarIds[0]) : undefined;
    const title = anchorPillar?.title ?? this.fallbackTitle(group);

    // --- priority ---
    const dominantType = this.dominantIdeaType(group.ideas);
    const dims: { weight: number; value: number }[] = [{ weight: 0.3, value: mean(group.ideas.map((i) => i.priorityScore)) }];
    dims.push({ weight: 0.2, value: GOAL_TOPIC_ALIGNMENT[input.campaign.goal.type]?.[dominantType] ?? 55 });
    if (audienceSegmentIds.length > 0) dims.push({ weight: 0.15, value: mean(audienceSegmentIds.map((id) => audienceFitById.get(id)?.confidenceScore ?? 60)) });
    const funnelStageScores = funnelStages.map((s) => input.growthStrategy.funnel.stages.find((fs) => fs.stage === s)?.priorityScore).filter((v): v is number => v !== undefined);
    if (funnelStageScores.length > 0) dims.push({ weight: 0.1, value: mean(funnelStageScores) });
    if (keywords.length > 0) dims.push({ weight: 0.15, value: Math.min(100, keywords.length * 15) });
    const activityScores = dedupeStrings(group.ideas.flatMap((i) => i.campaignActivityIds))
      .map((id) => activityById.get(id)?.priorityScore)
      .filter((v): v is number => v !== undefined);
    if (activityScores.length > 0 || channels.length > 0) {
      const channelValues = channels.map((c) => channelFitById.get(c)?.confidenceScore ?? 60);
      dims.push({ weight: 0.1, value: mean([...activityScores, ...channelValues]) });
    }
    const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0);
    const rawPriorityScore = totalWeight > 0 ? clamp(Math.round(dims.reduce((sum, d) => sum + d.weight * d.value, 0) / totalWeight), 0, 100) : 50;
    // A topic with no campaign-supported channel and no linked campaign
    // activity has no real distribution path in THIS campaign — goal-type
    // alignment alone must never be enough to carry it into a healthy tier.
    const hasChannelOrActivityEvidence = channels.length > 0 || activityScores.length > 0;
    const priorityScore = hasChannelOrActivityEvidence ? rawPriorityScore : Math.min(rawPriorityScore, 45);

    // --- confidence ---
    const confDims: { weight: number; value: number }[] = [{ weight: 0.35, value: mean(group.ideas.map((i) => i.confidenceScore)) }];
    if (keywords.length > 0) confDims.push({ weight: 0.2, value: 55 });
    const mappingConfidences = [...audienceSegmentIds.map((id) => audienceFitById.get(id)?.confidenceScore), ...channels.map((c) => channelFitById.get(c)?.confidenceScore)].filter(
      (v): v is number => v !== undefined,
    );
    if (mappingConfidences.length > 0) confDims.push({ weight: 0.2, value: mean(mappingConfidences) });
    if (anchorPillar) confDims.push({ weight: 0.15, value: anchorPillar.confidenceScore });
    const confTotalWeight = confDims.reduce((sum, d) => sum + d.weight, 0);
    const sourceCount = [true, keywords.length > 0, mappingConfidences.length > 0, !!anchorPillar].filter(Boolean).length;
    const diversityBonus = Math.min((sourceCount - 1) * 3, 9);
    const confidenceScore = confTotalWeight > 0 ? clamp(Math.round(confDims.reduce((sum, d) => sum + d.weight * d.value, 0) / confTotalWeight + diversityBonus), 0, 100) : 40;

    // --- weaknesses (cautious, never fabricated) ---
    const weaknesses: string[] = [];
    if (group.ideas.length === 1) weaknesses.push('Only one supporting idea currently evidences this topic.');
    if (keywords.length === 0) weaknesses.push('Limited keyword support for this topic.');
    if (audienceSegmentIds.length === 0) weaknesses.push('No mapped audience segment for this topic.');
    if (funnelStageScores.length === 0) weaknesses.push('Weak funnel-stage relevance evidence.');
    if (!group.ideas.some((i) => i.suggestedCTA)) weaknesses.push('No supported conversion direction identified for this topic.');
    if (!hasChannelOrActivityEvidence) weaknesses.push('No campaign-selected channel or linked campaign activity supports this topic.');

    const reasons = dedupeStrings(group.ideas.flatMap((i) => i.reasons)).slice(0, 5);
    const warnings = dedupeStrings(group.ideas.flatMap((i) => i.warnings));

    return {
      id: '',
      title,
      tier: 'deferred',
      priorityScore,
      confidenceScore,
      relatedIdeaIds: group.ideas.map((i) => i.id),
      audienceSegmentIds,
      channels,
      funnelStages,
      contentPillarIds,
      messagingPillarIds,
      keywords,
      intentTypes,
      reasons,
      weaknesses,
      warnings,
    };
  }

  private dominantIdeaType(ideas: ContentIdea[]): ContentIdeaType {
    const counts = new Map<ContentIdeaType, number>();
    for (const idea of ideas) counts.set(idea.type, (counts.get(idea.type) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  }

  private fallbackTitle(group: Group): string {
    const [, type, stage] = group.key.match(/^bucket:([^|]+)\|(.+)$/) ?? [];
    if (type && stage) return `${labelize(type)} Topics for the ${labelize(stage)} Stage`;
    const first = group.ideas[0];
    return first ? `${labelize(first.type)} Topics for the ${labelize(first.funnelStage)} Stage` : 'Untitled Topic';
  }

  // ---------------------------------------------------------------------
  // Dedup
  // ---------------------------------------------------------------------

  private dedupeTopics(topics: ContentTopic[]): ContentTopic[] {
    const byKey = new Map<string, ContentTopic>();
    for (const topic of topics) {
      const key = [
        [...topic.contentPillarIds].sort().join(','),
        [...topic.audienceSegmentIds].sort().join(','),
        [...topic.funnelStages].sort().join(','),
        normalizedSemanticTokens(topic.title).sort().join(' '),
      ].join('|');
      const existing = byKey.get(key);
      const mergedIdeaIds = dedupeStrings([...(existing?.relatedIdeaIds ?? []), ...topic.relatedIdeaIds]);
      const mergedReasons = dedupeStrings([...(existing?.reasons ?? []), ...topic.reasons]);
      const mergedWarnings = dedupeStrings([...(existing?.warnings ?? []), ...topic.warnings]);
      const mergedWeaknesses = dedupeStrings([...(existing?.weaknesses ?? []), ...topic.weaknesses]);
      const winner = !existing || topic.priorityScore > existing.priorityScore ? topic : existing;
      byKey.set(key, { ...winner, relatedIdeaIds: mergedIdeaIds, reasons: mergedReasons, warnings: mergedWarnings, weaknesses: mergedWeaknesses });
    }
    return Array.from(byKey.values());
  }

  // ---------------------------------------------------------------------
  // Tiering + overflow normalization
  // ---------------------------------------------------------------------

  private assignTiers(topics: ContentTopic[]): ContentTopic[] {
    const primaryMin = this.getEnvNumber('TOPIC_PRIMARY_MIN_SCORE', DEFAULT_PRIMARY_MIN_SCORE);
    const secondaryMin = this.getEnvNumber('TOPIC_SECONDARY_MIN_SCORE', DEFAULT_SECONDARY_MIN_SCORE);
    const experimentalMin = this.getEnvNumber('TOPIC_EXPERIMENTAL_MIN_SCORE', DEFAULT_EXPERIMENTAL_MIN_SCORE);

    return topics
      .filter((t) => t.priorityScore >= DEFAULT_OMIT_BELOW_SCORE)
      .map((t) => {
        const tier: ContentTopicTier = t.priorityScore >= primaryMin ? 'primary' : t.priorityScore >= secondaryMin ? 'secondary' : t.priorityScore >= experimentalMin ? 'experimental' : 'deferred';
        return { ...t, tier };
      });
  }

  private normalizeOverflow(topics: ContentTopic[]): ContentTopic[] {
    const sorted = [...topics].sort((a, b) => b.priorityScore - a.priorityScore || b.confidenceScore - a.confidenceScore || a.title.localeCompare(b.title));

    const maxPrimary = this.getEnvNumber('TOPIC_MAX_PRIMARY', DEFAULT_MAX_PRIMARY);
    const maxSecondary = this.getEnvNumber('TOPIC_MAX_SECONDARY', DEFAULT_MAX_SECONDARY);
    const maxTopics = this.getEnvNumber('TOPIC_MAX_TOPICS', DEFAULT_MAX_TOPICS);

    let primaryCount = 0;
    let secondaryCount = 0;
    const result: ContentTopic[] = [];
    for (const topic of sorted) {
      let tier = topic.tier;
      if (tier === 'primary') {
        if (primaryCount < maxPrimary) {
          primaryCount += 1;
        } else {
          tier = 'secondary';
        }
      }
      if (tier === 'secondary') {
        if (secondaryCount < maxSecondary) {
          secondaryCount += 1;
        } else {
          tier = 'experimental';
        }
      }
      result.push({ ...topic, tier, id: `topic-${result.length + 1}` });
    }

    return result.slice(0, maxTopics);
  }

  // ---------------------------------------------------------------------
  // Orchestration
  // ---------------------------------------------------------------------

  async prioritizeTopicsForCampaign(organizationId: string, productId: string, campaignId: string, userId: string): Promise<TopicPrioritizationResult> {
    // Cheap campaign-approval check first — this is itself the tenant/
    // product/campaign check, and avoids the expensive Growth Strategy
    // rebuild entirely when the campaign isn't even approved yet.
    const campaignApproval = await this.campaignReviewService.isCampaignApprovedForCurrentVersion(organizationId, productId, campaignId, userId);
    if (!campaignApproval.approved) {
      throw new ConflictException(campaignApproval.reason ?? 'Approve this campaign before prioritizing content topics.');
    }

    const strategyReview = await this.growthStrategyReviewService.getReview(organizationId, productId, userId);
    if (strategyReview.status !== 'approved') {
      throw new ConflictException('Approve the current Growth Strategy before prioritizing content topics.');
    }
    const product = await this.productsService.findOne(organizationId, productId, userId);
    const productUpdatedAt: Date = (product as { updatedAt?: Date }).updatedAt ?? new Date(0);
    const strategyStillApproved = await this.growthStrategyReviewService.isStrategyApprovedForCurrentVersion(organizationId, productId, userId, productUpdatedAt);
    if (!strategyStillApproved) {
      throw new ConflictException('The product has changed since the Growth Strategy was last approved. Review and approve it again before prioritizing content topics.');
    }

    const campaign = await this.campaignsService.findOne(organizationId, productId, campaignId, userId);
    if (!campaign.goal) {
      throw new BadRequestException('Define a campaign goal before prioritizing content topics.');
    }
    if (!campaign.plan) {
      throw new BadRequestException('Generate a 30-day campaign plan before prioritizing content topics.');
    }

    // Single internal orchestration pass — Growth Strategy is built once and
    // 14A ideas are generated exactly once in memory, never over HTTP.
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

    return this.prioritize({
      ideas: ideaResult,
      growthStrategy: { funnel: overview.funnel, contentStrategy: overview.contentStrategy },
      campaign: campaignInput,
      campaignPlan: campaign.plan,
    });
  }

  // ---------------------------------------------------------------------
  // Env-configurable limits
  // ---------------------------------------------------------------------

  private getMaxKeywordsPerTopic(): number {
    return this.getEnvNumber('TOPIC_MAX_KEYWORDS_PER_TOPIC', DEFAULT_MAX_KEYWORDS_PER_TOPIC);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
