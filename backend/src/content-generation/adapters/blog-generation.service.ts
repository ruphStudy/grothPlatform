import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CampaignReviewService } from '../../campaigns/campaign-review.service';
import { CampaignsService } from '../../campaigns/campaigns.service';
import type { CampaignResponse } from '../../campaigns/types/campaign.types';
import { ContentIdeaService } from '../../content-planning/content-idea.service';
import { ContentPillarPlanService } from '../../content-planning/content-pillar-plan.service';
import { TopicPrioritizationService } from '../../content-planning/topic-prioritization.service';
import { BlogCalendarService } from '../../content-planning/blog-calendar.service';
import type { BlogCalendarItem } from '../../content-planning/types/blog-calendar.types';
import type { CampaignContentPillar } from '../../content-planning/types/content-pillar-plan.types';
import type { ContentTopic } from '../../content-planning/types/topic-prioritization.types';
import { GrowthStrategyReviewService } from '../../growth-strategy/growth-strategy-review.service';
import { GrowthStrategyService } from '../../growth-strategy/growth-strategy.service';
import type { GrowthStrategyOverview } from '../../growth-strategy/types/growth-strategy-overview.types';
import { ProductsService } from '../../products/products.service';
import { ContentPromptBuilderService } from '../prompting/content-prompt-builder.service';
import type { ContentPromptBuildInput } from '../types/content-prompt.types';
import { ContentGenerationEngineService } from '../engine/content-generation-engine.service';
import { mapEvidenceFromOverview, mapMessagingDirectionsFromOverview, resolveAudienceLabel } from '../shared/content-evidence-mapping.util';
import type { BlogDraftResult } from '../types/blog-generation.types';
import type { BlogGenerationOptions } from '../types/blog-generation.types';

const DEFAULT_MIN_WORDS = 800;
const DEFAULT_MAX_WORDS = 1400;
const DEFAULT_MAX_WORDS_LIMIT = 2500;

const BLOG_ADAPTER_INSTRUCTION = [
  'Write a single coherent blog draft with a clear introduction, body, and conclusion.',
  'Use headings where useful if writing in markdown.',
  'Ground every claim in the evidence and direction supplied below; never fabricate statistics, proof, or customers.',
  'Use the supplied keywords naturally where relevant — do not keyword-stuff.',
  'Include a call to action only if one is supplied below.',
].join(' ');

/**
 * Blog content-type adapter over the 15A engine / 15B prompt builder. Never
 * builds its own prompt template beyond the small instruction above, never
 * calls the provider/engine more than once, and never trusts request-body
 * content — only blogCalendarItemId and generation options are accepted;
 * everything else is reconstructed server-side from the approved planning
 * lineage.
 */
@Injectable()
export class BlogGenerationService {
  private readonly logger = new Logger(BlogGenerationService.name);

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
    private readonly promptBuilder: ContentPromptBuilderService,
    private readonly engine: ContentGenerationEngineService,
  ) {}

  async generateBlogDraft(
    organizationId: string,
    productId: string,
    campaignId: string,
    blogCalendarItemId: string,
    userId: string,
    options?: BlogGenerationOptions,
  ): Promise<BlogDraftResult> {
    const { minWords, maxWords } = this.resolveWordBounds(options);
    const outputFormat = this.resolveOutputFormat(options);

    // Cheap campaign-approval check first — this is itself the tenant/
    // product/campaign check, and avoids the expensive Growth Strategy
    // rebuild entirely when the campaign isn't even approved yet.
    const campaignApproval = await this.campaignReviewService.isCampaignApprovedForCurrentVersion(organizationId, productId, campaignId, userId);
    if (!campaignApproval.approved) {
      throw new ConflictException(campaignApproval.reason ?? 'Approve this campaign before generating a blog draft.');
    }

    const strategyReview = await this.growthStrategyReviewService.getReview(organizationId, productId, userId);
    if (strategyReview.status !== 'approved') {
      throw new ConflictException('Approve the current Growth Strategy before generating a blog draft.');
    }
    const product = await this.productsService.findOne(organizationId, productId, userId);
    const productUpdatedAt: Date = (product as { updatedAt?: Date }).updatedAt ?? new Date(0);
    const strategyStillApproved = await this.growthStrategyReviewService.isStrategyApprovedForCurrentVersion(organizationId, productId, userId, productUpdatedAt);
    if (!strategyStillApproved) {
      throw new ConflictException('The product has changed since the Growth Strategy was last approved. Review and approve it again before generating a blog draft.');
    }

    const campaign = await this.campaignsService.findOne(organizationId, productId, campaignId, userId);
    if (!campaign.goal) {
      throw new BadRequestException('Define a campaign goal before generating a blog draft.');
    }
    if (!campaign.plan) {
      throw new BadRequestException('Generate a 30-day campaign plan before generating a blog draft.');
    }

    // Single internal orchestration pass — Growth Strategy is built once,
    // and every 14A-14D layer is generated exactly once in memory, never
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

    const blogItem = blogCalendarResult.items.find((i) => i.id === blogCalendarItemId);
    if (!blogItem) {
      throw new NotFoundException('Blog calendar item not found.');
    }

    const pillar = pillarResult.pillars.find((p) => p.id === blogItem.pillarId);
    const topic = topicResult.topics.find((t) => t.id === blogItem.topicId);

    const promptInput = this.buildPromptInput(product, campaign, blogItem, pillar, topic, overview, minWords, maxWords, outputFormat, options?.language, blogCalendarItemId);
    const promptBuild = this.promptBuilder.build(promptInput);

    const startedAt = Date.now();
    let generation;
    try {
      generation = await this.engine.generate({
        kind: 'blog',
        systemPrompt: promptBuild.systemPrompt,
        prompt: `${BLOG_ADAPTER_INSTRUCTION}\n\n${promptBuild.prompt}`,
        organizationId,
        productId,
        campaignId,
        sourceContext: promptBuild.sourceContext,
        metadata: { promptVersion: promptBuild.metadata.promptVersion, blogCalendarItemId },
      });
    } catch (err) {
      this.logOutcome(organizationId, productId, campaignId, blogCalendarItemId, 'unknown', 'unknown', Date.now() - startedAt, undefined, false);
      throw err;
    }
    this.logOutcome(organizationId, productId, campaignId, blogCalendarItemId, generation.provider, generation.model, Date.now() - startedAt, generation.usage, true);

    const content = generation.content.trim();
    const wordCount = content.length === 0 ? 0 : content.split(/\s+/).filter((w) => w.length > 0).length;

    const warnings = [...promptBuild.warnings];
    if (wordCount < minWords) warnings.push('Generated draft is shorter than requested.');
    if (wordCount > maxWords) warnings.push('Generated draft is longer than requested.');

    return {
      id: generation.id,
      kind: 'blog',
      blogCalendarItemId,
      title: blogItem.title,
      content,
      format: outputFormat,
      wordCount,
      provider: generation.provider,
      model: generation.model,
      usage: generation.usage,
      cost: generation.cost,
      promptVersion: promptBuild.metadata.promptVersion,
      sourceContext: promptBuild.sourceContext ?? {},
      warnings,
      generatedAt: generation.generatedAt,
    };
  }

  // ---------------------------------------------------------------------
  // Prompt input mapping — only supported, relevance-filtered evidence
  // ever reaches the prompt; never the raw request body.
  // ---------------------------------------------------------------------

  private buildPromptInput(
    product: { name: string; shortDescription?: string; productType?: string },
    campaign: CampaignResponse,
    blogItem: BlogCalendarItem,
    pillar: CampaignContentPillar | undefined,
    topic: ContentTopic | undefined,
    overview: GrowthStrategyOverview,
    minWords: number,
    maxWords: number,
    outputFormat: 'markdown' | 'plain_text',
    language: string | undefined,
    blogCalendarItemId: string,
  ): ContentPromptBuildInput {
    return {
      kind: 'blog',
      product: {
        name: product.name,
        shortDescription: product.shortDescription,
        category: product.productType,
      },
      campaign: {
        name: campaign.name,
        goal: campaign.goal?.title,
        funnelStage: blogItem.funnelStage,
        audienceSegmentIds: blogItem.audienceSegmentIds,
        channelIds: campaign.channelIds,
        conversionDirection: campaign.goal?.description,
      },
      content: {
        title: blogItem.title,
        type: blogItem.type,
        angle: blogItem.angle,
        objective: blogItem.objective,
        funnelStage: blogItem.funnelStage,
        audience: blogItem.audienceSegmentIds.map((id) => resolveAudienceLabel(campaign.audienceChannelMapping, id)),
        keywords: [...(blogItem.primaryKeyword ? [blogItem.primaryKeyword] : []), ...blogItem.supportingKeywords],
        pillar: pillar?.title,
        topic: topic?.title,
        messagingDirections: mapMessagingDirectionsFromOverview(overview, blogItem.audienceSegmentIds, blogItem.funnelStage, pillar?.messagingPillarIds ?? []),
        suggestedCTA: blogItem.suggestedCTA,
        formatDirection: blogItem.type,
      },
      evidence: mapEvidenceFromOverview(overview, blogItem.audienceSegmentIds),
      constraints: {
        language,
        minWords,
        maxWords,
        outputFormat,
        includeCTA: !!blogItem.suggestedCTA,
      },
      sourceContext: {
        strategyGeneratedAt: overview.generatedAt.toISOString(),
        campaignPlanningVersion: campaign.planningMetadata.version,
        sourceIds: [blogCalendarItemId],
      },
    };
  }

  // ---------------------------------------------------------------------
  // Options validation
  // ---------------------------------------------------------------------

  private resolveWordBounds(options: BlogGenerationOptions | undefined): { minWords: number; maxWords: number } {
    const minWords = options?.minWords ?? this.getDefaultMinWords();
    const maxWords = options?.maxWords ?? this.getDefaultMaxWords();
    const hardCap = this.getMaxWordsLimit();

    if (!Number.isFinite(minWords) || minWords <= 0) {
      throw new BadRequestException('minWords must be a positive number.');
    }
    if (!Number.isFinite(maxWords) || maxWords < minWords) {
      throw new BadRequestException('maxWords must be a number greater than or equal to minWords.');
    }
    if (maxWords > hardCap) {
      throw new BadRequestException(`maxWords must not exceed ${hardCap}.`);
    }
    return { minWords, maxWords };
  }

  private resolveOutputFormat(options: BlogGenerationOptions | undefined): 'markdown' | 'plain_text' {
    const format = options?.outputFormat ?? 'markdown';
    if (format !== 'markdown' && format !== 'plain_text') {
      throw new BadRequestException('outputFormat must be either "markdown" or "plain_text".');
    }
    return format;
  }

  // ---------------------------------------------------------------------
  // Config-driven defaults
  // ---------------------------------------------------------------------

  private getDefaultMinWords(): number {
    return this.getEnvNumber('BLOG_GENERATION_DEFAULT_MIN_WORDS', DEFAULT_MIN_WORDS);
  }

  private getDefaultMaxWords(): number {
    return this.getEnvNumber('BLOG_GENERATION_DEFAULT_MAX_WORDS', DEFAULT_MAX_WORDS);
  }

  private getMaxWordsLimit(): number {
    return this.getEnvNumber('BLOG_GENERATION_MAX_WORDS', DEFAULT_MAX_WORDS_LIMIT);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  // ---------------------------------------------------------------------
  // Logging — org/product/campaign/item/provider/model/latency/tokens
  // only, never prompts, generated content, or API keys.
  // ---------------------------------------------------------------------

  private logOutcome(
    organizationId: string,
    productId: string,
    campaignId: string,
    blogCalendarItemId: string,
    provider: string,
    model: string,
    latencyMs: number,
    usage: { totalTokens?: number } | undefined,
    success: boolean,
  ): void {
    const tokenPart = usage?.totalTokens !== undefined ? ` totalTokens=${usage.totalTokens}` : '';
    this.logger.log(
      `org=${organizationId} product=${productId} campaign=${campaignId} blogCalendarItemId=${blogCalendarItemId} provider=${provider} model=${model} success=${success} latencyMs=${latencyMs}${tokenPart}`,
    );
  }
}
