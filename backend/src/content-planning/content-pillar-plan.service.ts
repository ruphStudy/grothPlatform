import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CampaignReviewService } from '../campaigns/campaign-review.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import type { CampaignAudienceChannelMapping } from '../campaigns/types/campaign-audience-channel.types';
import type { CampaignGoal, CampaignGoalType } from '../campaigns/types/campaign-goal.types';
import type { CampaignPlanResult } from '../campaigns/types/campaign-plan.types';
import type { ContentPillar, ContentStrategyResult } from '../growth-strategy/types/content-strategy.types';
import type { FunnelStrategyResult } from '../growth-strategy/types/funnel-strategy.types';
import type { MessagingPillar, MessagingStrategyResult } from '../growth-strategy/types/messaging-strategy.types';
import { GrowthStrategyReviewService } from '../growth-strategy/growth-strategy-review.service';
import { GrowthStrategyService } from '../growth-strategy/growth-strategy.service';
import { ProductsService } from '../products/products.service';
import { ContentIdeaService } from './content-idea.service';
import type { ContentIdea, ContentIdeaResult, ContentIdeaType } from './types/content-idea.types';
import type { CampaignContentPillar, CampaignContentPillarTier, ContentPillarPlanResult } from './types/content-pillar-plan.types';
import type { ContentTopic, TopicPrioritizationResult } from './types/topic-prioritization.types';
import { TopicPrioritizationService } from './topic-prioritization.service';

const DEFAULT_PRIMARY_MIN_SCORE = 75;
const DEFAULT_SUPPORTING_MIN_SCORE = 50;
const DEFAULT_OMIT_BELOW_SCORE = 15;
const DEFAULT_MAX_TOTAL = 8;
const DEFAULT_MAX_PRIMARY = 4;
const DEFAULT_MAX_SUPPORTING = 6;
const DEFAULT_MAX_TOPICS_PER_PILLAR = 10;
const DEFAULT_MAX_KEYWORDS_PER_PILLAR = 10;

const DISCLAIMER = 'Campaign content pillars are evidence-based planning themes and do not represent verified content performance or search demand.';

const GENERIC_TOKENS = new Set(['software', 'platform', 'solution', 'tool', 'guide', 'content', 'product', 'the', 'and', 'for', 'with', 'of', 'to', 'in', 'a', 'an']);

// Every likely pillar theme from the spec's own list, keyed by the idea type
// that most directly evidences it.
const THEME_BY_IDEA_TYPE: Record<ContentIdeaType, string> = {
  educational: 'category_education',
  problem_solution: 'problem_education',
  use_case: 'use_case_education',
  comparison: 'comparison_evaluation',
  differentiation: 'differentiation',
  buyer_enablement: 'buyer_enablement',
  conversion_support: 'conversion_support',
  activation: 'activation_how_to',
  thought_leadership: 'category_education',
  faq: 'buyer_enablement',
  proof: 'proof_trust',
  repurpose: 'category_education',
};

const PURPOSE_FRAGMENT_BY_THEME: Record<string, string> = {
  category_education: 'Educate the target audience on core category concepts relevant to',
  problem_education: 'Help the target audience recognize and understand the problem behind',
  use_case_education: 'Demonstrate practical, evidenced use cases for',
  comparison_evaluation: 'Support evaluators comparing approaches around',
  differentiation: 'Explain what genuinely differentiates the product with respect to',
  buyer_enablement: 'Give evaluators and buyers what they need to build a confident case for',
  conversion_support: 'Support the next supported conversion step with clarity around',
  activation_how_to: 'Guide new users toward their first-value action around',
  proof_trust: 'Build trust through validated, collected proof around',
};

// Reused convention from 14A/14B — only these goal-type/theme pairs get a
// strong alignment score; everything else falls to a neutral default so no
// theme is ever unfairly zeroed for an unlisted goal.
const GOAL_THEME_ALIGNMENT: Partial<Record<CampaignGoalType, Record<string, number>>> = {
  awareness: { category_education: 100, problem_education: 90, use_case_education: 85 },
  education: { category_education: 100, use_case_education: 85 },
  consideration: { use_case_education: 90, comparison_evaluation: 90, differentiation: 85, buyer_enablement: 70 },
  lead_generation: { buyer_enablement: 100, conversion_support: 85, comparison_evaluation: 75 },
  conversion: { conversion_support: 100, proof_trust: 85 },
  activation: { activation_how_to: 100 },
  positioning: { differentiation: 90, category_education: 75 },
  differentiation: { differentiation: 100, comparison_evaluation: 90 },
  buyer_enablement: { buyer_enablement: 100, proof_trust: 80 },
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

export interface ContentPillarPlanInput {
  topics: TopicPrioritizationResult;
  ideas: ContentIdeaResult;
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

interface Group {
  topics: ContentTopic[];
}

/**
 * Content pillar consolidation. `build()` is pure — no fetches, no HTTP
 * calls — so it can be unit-tested directly. Groups the campaign's own 14B
 * topics into a small number of durable pillars; never pulls in a Sprint 12
 * content pillar that has no actual topic evidence within this campaign.
 */
@Injectable()
export class ContentPillarPlanService {
  constructor(
    private readonly configService: ConfigService,
    private readonly productsService: ProductsService,
    private readonly campaignsService: CampaignsService,
    private readonly campaignReviewService: CampaignReviewService,
    private readonly growthStrategyService: GrowthStrategyService,
    private readonly growthStrategyReviewService: GrowthStrategyReviewService,
    private readonly contentIdeaService: ContentIdeaService,
    private readonly topicPrioritizationService: TopicPrioritizationService,
  ) {}

  /**
   * PURE. Consolidates topics into durable pillars, scores/tiers them, and
   * applies primary/supporting overflow normalization.
   */
  build(input: ContentPillarPlanInput): ContentPillarPlanResult {
    const ideaById = new Map(input.ideas.ideas.map((i) => [i.id, i]));
    const messagingPillarById = new Map(input.growthStrategy.messaging.pillars.map((p) => [p.id, p]));
    const contentPillarById = new Map(input.growthStrategy.contentStrategy.pillars.map((p) => [p.id, p]));
    const channelFitById = new Map(input.campaign.audienceChannelMapping.channels.map((c) => [c.channel, c]));
    const audienceFitById = new Map(input.campaign.audienceChannelMapping.audiences.map((a) => [a.audienceSegmentId, a]));

    const groups = this.groupTopics(input.topics.topics);
    const rawPillars = groups.map((g) => this.buildPillar(g, input, ideaById, messagingPillarById, contentPillarById, channelFitById, audienceFitById)).filter((p): p is CampaignContentPillar => !!p);

    const tiered = this.assignTiers(rawPillars);
    const normalized = this.normalizeOverflow(tiered);

    const primaryPillarIds = normalized.filter((p) => p.tier === 'primary').map((p) => p.id);
    const supportingPillarIds = normalized.filter((p) => p.tier === 'supporting').map((p) => p.id);

    const missingEvidence: string[] = [];
    if (normalized.length === 0) missingEvidence.push('No reliable content pillars were detected from the approved campaign and strategy evidence.');
    if (primaryPillarIds.length === 0 && normalized.length > 0) missingEvidence.push('No content pillar currently scores strongly enough to be a primary pillar.');
    if (input.campaign.audienceSegmentIds.length === 0) missingEvidence.push('No mapped audience is available; some pillars apply broadly.');
    if (!normalized.some((p) => p.keywords.length > 0)) missingEvidence.push('No reliable keyword evidence is available to support these pillars.');
    if (!normalized.some((p) => p.funnelStages.includes('conversion') || p.funnelStages.includes('activation'))) missingEvidence.push('Limited lower-funnel content support is currently evidenced.');
    if (!normalized.some((p) => p.theme === 'proof_trust')) missingEvidence.push('Customer proof evidence is currently unavailable for these pillars.');

    const confidenceScore = normalized.length ? Math.round(mean(normalized.map((p) => p.confidenceScore))) : 0;

    return {
      pillars: normalized,
      primaryPillarIds,
      supportingPillarIds,
      confidenceScore,
      missingEvidence,
      warnings: [DISCLAIMER],
      generatedAt: new Date(),
    };
  }

  // ---------------------------------------------------------------------
  // Grouping — ordered anchor preference: Sprint 12 content pillar > Sprint
  // 12 messaging pillar > shared audience+funnel+intent > never generic
  // title-word overlap.
  // ---------------------------------------------------------------------

  private groupTopics(topics: ContentTopic[]): Group[] {
    const byKey = new Map<string, ContentTopic[]>();
    for (const topic of topics) {
      const key = topic.contentPillarIds[0]
        ? `pillar:${topic.contentPillarIds[0]}`
        : topic.messagingPillarIds[0]
          ? `msg:${topic.messagingPillarIds[0]}`
          : `anchor:${[...topic.audienceSegmentIds].sort().join(',')}|${[...topic.funnelStages].sort().join(',')}|${[...topic.intentTypes].sort().join(',')}`;
      const list = byKey.get(key) ?? [];
      list.push(topic);
      byKey.set(key, list);
    }
    return Array.from(byKey.values()).map((groupTopics) => ({ topics: groupTopics.slice(0, DEFAULT_MAX_TOPICS_PER_PILLAR) }));
  }

  // ---------------------------------------------------------------------
  // Pillar construction + scoring
  // ---------------------------------------------------------------------

  private buildPillar(
    group: Group,
    input: ContentPillarPlanInput,
    ideaById: Map<string, ContentIdea>,
    messagingPillarById: Map<string, MessagingPillar>,
    contentPillarById: Map<string, ContentPillar>,
    channelFitById: Map<string, { confidenceScore: number }>,
    audienceFitById: Map<string, { confidenceScore: number }>,
  ): CampaignContentPillar | null {
    if (group.topics.length === 0) return null;

    const topicIds = dedupeStrings(group.topics.map((t) => t.id));
    const memberIdeas = dedupeStrings(group.topics.flatMap((t) => t.relatedIdeaIds))
      .map((id) => ideaById.get(id))
      .filter((i): i is ContentIdea => !!i);

    const strategyContentPillarIds = dedupeStrings(group.topics.flatMap((t) => t.contentPillarIds));
    const messagingPillarIds = dedupeStrings(group.topics.flatMap((t) => t.messagingPillarIds));
    const audienceSegmentIds = dedupeStrings(group.topics.flatMap((t) => t.audienceSegmentIds)).filter((id) => input.campaign.audienceSegmentIds.includes(id));
    const channels = dedupeStrings(group.topics.flatMap((t) => t.channels)).filter((c) => input.campaign.channelIds.includes(c));
    const funnelStages = dedupeStrings(group.topics.flatMap((t) => t.funnelStages));
    const keywords = dedupeStrings(group.topics.flatMap((t) => t.keywords)).slice(0, this.getMaxKeywordsPerPillar());
    const intentTypes = dedupeStrings(group.topics.flatMap((t) => t.intentTypes));

    const anchorContentPillar = strategyContentPillarIds[0] ? contentPillarById.get(strategyContentPillarIds[0]) : undefined;
    const anchorMessagingPillar = messagingPillarIds[0] ? messagingPillarById.get(messagingPillarIds[0]) : undefined;
    const title = anchorContentPillar?.title ?? anchorMessagingPillar?.title ?? this.fallbackTitle(group);

    const theme = this.dominantTheme(memberIdeas, group.topics);
    const purpose = `${PURPOSE_FRAGMENT_BY_THEME[theme] ?? 'Consistently communicate this theme to the target audience around'} ${title.toLowerCase()}.`;

    // --- priority ---
    const dims: { weight: number; value: number }[] = [{ weight: 0.35, value: mean(group.topics.map((t) => t.priorityScore)) }];
    dims.push({ weight: 0.2, value: GOAL_THEME_ALIGNMENT[input.campaign.goal.type]?.[theme] ?? 55 });
    if (audienceSegmentIds.length > 0) dims.push({ weight: 0.15, value: mean(audienceSegmentIds.map((id) => audienceFitById.get(id)?.confidenceScore ?? 60)) });
    const funnelStageScores = funnelStages.map((s) => input.growthStrategy.funnel.stages.find((fs) => fs.stage === s)?.priorityScore).filter((v): v is number => v !== undefined);
    if (funnelStageScores.length > 0) dims.push({ weight: 0.1, value: mean(funnelStageScores) });
    const strategyAlignmentScores = [anchorContentPillar?.priorityScore, anchorMessagingPillar?.priorityScore].filter((v): v is number => v !== undefined);
    if (strategyAlignmentScores.length > 0) dims.push({ weight: 0.15, value: mean(strategyAlignmentScores) });
    if (channels.length > 0) dims.push({ weight: 0.05, value: mean(channels.map((c) => channelFitById.get(c)?.confidenceScore ?? 60)) });

    const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0);
    const rawPriorityScore = totalWeight > 0 ? clamp(Math.round(dims.reduce((sum, d) => sum + d.weight * d.value, 0) / totalWeight), 0, 100) : 50;
    // A pillar with no campaign-supported channel at all has no real
    // distribution path in this campaign — never let goal/theme alignment
    // alone carry it into a healthy tier.
    const priorityScore = channels.length > 0 ? rawPriorityScore : Math.min(rawPriorityScore, 45);

    // --- confidence ---
    const confDims: { weight: number; value: number }[] = [{ weight: 0.35, value: mean(group.topics.map((t) => t.confidenceScore)) }];
    const strategyConfidences = [anchorContentPillar?.confidenceScore, anchorMessagingPillar?.confidenceScore].filter((v): v is number => v !== undefined);
    if (strategyConfidences.length > 0) confDims.push({ weight: 0.25, value: mean(strategyConfidences) });
    const mappingConfidences = [...audienceSegmentIds.map((id) => audienceFitById.get(id)?.confidenceScore), ...channels.map((c) => channelFitById.get(c)?.confidenceScore)].filter(
      (v): v is number => v !== undefined,
    );
    if (mappingConfidences.length > 0) confDims.push({ weight: 0.25, value: mean(mappingConfidences) });
    if (keywords.length > 0) confDims.push({ weight: 0.15, value: 55 });
    const confTotalWeight = confDims.reduce((sum, d) => sum + d.weight, 0);
    const sourceCount = [true, strategyConfidences.length > 0, mappingConfidences.length > 0, keywords.length > 0].filter(Boolean).length;
    const diversityBonus = Math.min((sourceCount - 1) * 3, 9);
    const confidenceScore = confTotalWeight > 0 ? clamp(Math.round(confDims.reduce((sum, d) => sum + d.weight * d.value, 0) / confTotalWeight + diversityBonus), 0, 100) : 40;

    // --- weaknesses (cautious, never fabricated) ---
    const weaknesses: string[] = [];
    if (topicIds.length === 1) weaknesses.push('This pillar is currently supported by only one topic.');
    if (audienceSegmentIds.length === 0) weaknesses.push('Limited audience evidence for this pillar.');
    if (keywords.length === 0) weaknesses.push('Weak keyword support for this pillar.');
    if (channels.length <= 1) weaknesses.push('Limited channel coverage for this pillar.');
    if (!funnelStages.includes('conversion') && !memberIdeas.some((i) => i.suggestedCTA)) weaknesses.push('No conversion-stage support identified for this pillar.');
    if (['conversion', 'lead_generation', 'buyer_enablement'].includes(input.campaign.goal.type) && theme !== 'proof_trust' && !memberIdeas.some((i) => i.type === 'proof')) {
      weaknesses.push('No proof evidence identified for this pillar.');
    }

    const reasons = dedupeStrings(group.topics.flatMap((t) => t.reasons)).slice(0, 5);
    const warnings = dedupeStrings(group.topics.flatMap((t) => t.warnings));

    return {
      id: '',
      title,
      theme,
      tier: 'experimental',
      priorityScore,
      confidenceScore,
      topicIds,
      audienceSegmentIds,
      channels,
      funnelStages,
      messagingPillarIds,
      strategyContentPillarIds,
      keywords,
      intentTypes,
      purpose,
      reasons,
      weaknesses,
      warnings,
    };
  }

  private dominantTheme(memberIdeas: ContentIdea[], topics: ContentTopic[]): string {
    if (memberIdeas.length > 0) {
      const counts = new Map<ContentIdeaType, number>();
      for (const idea of memberIdeas) counts.set(idea.type, (counts.get(idea.type) ?? 0) + 1);
      const dominant = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
      return THEME_BY_IDEA_TYPE[dominant];
    }
    return topics[0] ? THEME_BY_IDEA_TYPE['educational'] : 'category_education';
  }

  private fallbackTitle(group: Group): string {
    const first = group.topics[0];
    return first ? first.title : 'Untitled Pillar';
  }

  // ---------------------------------------------------------------------
  // Tiering + overflow normalization
  // ---------------------------------------------------------------------

  private assignTiers(pillars: CampaignContentPillar[]): CampaignContentPillar[] {
    const primaryMin = this.getEnvNumber('CONTENT_PILLAR_PRIMARY_MIN_SCORE', DEFAULT_PRIMARY_MIN_SCORE);
    const supportingMin = this.getEnvNumber('CONTENT_PILLAR_SUPPORTING_MIN_SCORE', DEFAULT_SUPPORTING_MIN_SCORE);

    return pillars
      .filter((p) => p.priorityScore >= DEFAULT_OMIT_BELOW_SCORE)
      .map((p) => {
        const tier: CampaignContentPillarTier = p.priorityScore >= primaryMin ? 'primary' : p.priorityScore >= supportingMin ? 'supporting' : 'experimental';
        return { ...p, tier };
      });
  }

  private normalizeOverflow(pillars: CampaignContentPillar[]): CampaignContentPillar[] {
    const sorted = [...pillars].sort((a, b) => b.priorityScore - a.priorityScore || b.confidenceScore - a.confidenceScore || a.title.localeCompare(b.title));

    const maxPrimary = this.getEnvNumber('CONTENT_PILLAR_MAX_PRIMARY', DEFAULT_MAX_PRIMARY);
    const maxSupporting = this.getEnvNumber('CONTENT_PILLAR_MAX_SUPPORTING', DEFAULT_MAX_SUPPORTING);
    const maxTotal = this.getEnvNumber('CONTENT_PILLAR_MAX_TOTAL', DEFAULT_MAX_TOTAL);

    let primaryCount = 0;
    let supportingCount = 0;
    const result: CampaignContentPillar[] = [];
    for (const pillar of sorted) {
      let tier = pillar.tier;
      if (tier === 'primary') {
        if (primaryCount < maxPrimary) {
          primaryCount += 1;
        } else {
          tier = 'supporting';
        }
      }
      if (tier === 'supporting') {
        if (supportingCount < maxSupporting) {
          supportingCount += 1;
        } else {
          tier = 'experimental';
        }
      }
      result.push({ ...pillar, tier, id: `pillar-${result.length + 1}` });
    }

    return result.slice(0, maxTotal);
  }

  // ---------------------------------------------------------------------
  // Orchestration
  // ---------------------------------------------------------------------

  async buildPillarsForCampaign(organizationId: string, productId: string, campaignId: string, userId: string): Promise<ContentPillarPlanResult> {
    // Cheap campaign-approval check first — this is itself the tenant/
    // product/campaign check, and avoids the expensive Growth Strategy
    // rebuild entirely when the campaign isn't even approved yet.
    const campaignApproval = await this.campaignReviewService.isCampaignApprovedForCurrentVersion(organizationId, productId, campaignId, userId);
    if (!campaignApproval.approved) {
      throw new ConflictException(campaignApproval.reason ?? 'Approve this campaign before building content pillars.');
    }

    const strategyReview = await this.growthStrategyReviewService.getReview(organizationId, productId, userId);
    if (strategyReview.status !== 'approved') {
      throw new ConflictException('Approve the current Growth Strategy before building content pillars.');
    }
    const product = await this.productsService.findOne(organizationId, productId, userId);
    const productUpdatedAt: Date = (product as { updatedAt?: Date }).updatedAt ?? new Date(0);
    const strategyStillApproved = await this.growthStrategyReviewService.isStrategyApprovedForCurrentVersion(organizationId, productId, userId, productUpdatedAt);
    if (!strategyStillApproved) {
      throw new ConflictException('The product has changed since the Growth Strategy was last approved. Review and approve it again before building content pillars.');
    }

    const campaign = await this.campaignsService.findOne(organizationId, productId, campaignId, userId);
    if (!campaign.goal) {
      throw new BadRequestException('Define a campaign goal before building content pillars.');
    }
    if (!campaign.plan) {
      throw new BadRequestException('Generate a 30-day campaign plan before building content pillars.');
    }

    // Single internal orchestration pass — Growth Strategy is built once,
    // and 14A ideas + 14B topics are each generated exactly once in memory,
    // never over HTTP and never regenerated a second time.
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

    return this.build({
      topics: topicResult,
      ideas: ideaResult,
      growthStrategy: { messaging: overview.messaging, contentStrategy: overview.contentStrategy, funnel: overview.funnel },
      campaign: campaignInput,
      campaignPlan: campaign.plan,
    });
  }

  // ---------------------------------------------------------------------
  // Env-configurable limits
  // ---------------------------------------------------------------------

  private getMaxKeywordsPerPillar(): number {
    return this.getEnvNumber('CONTENT_PILLAR_MAX_KEYWORDS_PER_PILLAR', DEFAULT_MAX_KEYWORDS_PER_PILLAR);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
