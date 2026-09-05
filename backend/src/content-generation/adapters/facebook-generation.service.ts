import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CampaignReviewService } from '../../campaigns/campaign-review.service';
import { CampaignsService } from '../../campaigns/campaigns.service';
import type { CampaignResponse } from '../../campaigns/types/campaign.types';
import { BlogCalendarService } from '../../content-planning/blog-calendar.service';
import { ContentIdeaService } from '../../content-planning/content-idea.service';
import { ContentPillarPlanService } from '../../content-planning/content-pillar-plan.service';
import { SocialCalendarService } from '../../content-planning/social-calendar.service';
import type { SocialCalendarItem } from '../../content-planning/types/social-calendar.types';
import { TopicPrioritizationService } from '../../content-planning/topic-prioritization.service';
import { GrowthStrategyReviewService } from '../../growth-strategy/growth-strategy-review.service';
import { GrowthStrategyService } from '../../growth-strategy/growth-strategy.service';
import type { GrowthStrategyOverview } from '../../growth-strategy/types/growth-strategy-overview.types';
import { ProductsService } from '../../products/products.service';
import { ContentGenerationEngineService } from '../engine/content-generation-engine.service';
import { ContentPromptBuilderService } from '../prompting/content-prompt-builder.service';
import { ContentVersioningService } from '../services/content-versioning.service';
import { buildBrandVoiceSnapshot, buildGroundingEvidenceSnapshot, mapEvidenceFromOverview, mapMessagingDirectionsFromOverview, resolveAudienceLabel } from '../shared/content-evidence-mapping.util';
import { buildGenerationMetadata } from '../shared/content-version-mapping.util';
import type { ContentPromptBuildInput } from '../types/content-prompt.types';
import type { FacebookDraftResult, FacebookGenerationOptions, FacebookLength, FacebookTone } from '../types/facebook-generation.types';

const DEFAULT_LENGTH: FacebookLength = 'medium';
const DEFAULT_SHORT_MAX_CHARS = 700;
const DEFAULT_MEDIUM_MAX_CHARS = 1500;
const DEFAULT_LONG_MAX_CHARS = 2500;
const DEFAULT_MAX_HASHTAGS_LIMIT = 5;
const DEFAULT_HASHTAGS = 2;
const TOO_SHORT_CHARS = 50;

const TONE_LABELS: Record<FacebookTone, string[]> = {
  professional: ['professional', 'clear'],
  conversational: ['conversational', 'approachable'],
  friendly: ['friendly', 'warm'],
  educational: ['educational', 'informative'],
  thought_leadership: ['thought-provoking', 'insight-led'],
};

const LENGTH_INSTRUCTION: Record<FacebookLength, string> = {
  short: 'Write a concise post.',
  medium: 'Write a moderately detailed post.',
  long: 'Write a deeper, more detailed post.',
};

// Extra guidance per 14E recommendedFormat — the model must never invent a
// carousel/poll/video-script asset, or an X-style thread, that this
// endpoint was never asked to produce; it only ever returns Facebook post text.
const FORMAT_INSTRUCTIONS: Record<string, string> = {
  carousel_direction: 'Write Facebook post copy only — do not produce slide-by-slide carousel content unless the planning evidence explicitly supplies it.',
  image_post_direction: 'Write only the accompanying Facebook post text — do not describe or generate image content.',
  poll_direction: 'Write Facebook post framing only — do not invent poll options unless the planning evidence explicitly supplies them.',
  thread_direction: 'Convert this into a single structured, multi-point Facebook post — do not write an X-style numbered thread.',
  short_video_direction: 'Write the accompanying Facebook post text only — do not write a video script.',
};

const BASE_FACEBOOK_INSTRUCTION = [
  'Create one Facebook post using short, readable paragraphs and a natural conversational structure.',
  'Open clearly, provide enough context to stand alone, and preserve the planned angle and funnel stage below.',
  'Ground every claim in the evidence and direction supplied below; never fabricate statistics, results, or customers.',
  'Do not attempt to "make this go viral," "game the algorithm," "guarantee reach," or "maximize shares."',
  'Return only the final post copy.',
].join(' ');

/**
 * Facebook content-type adapter over the 15A engine / 15B prompt builder.
 * Follows the exact explicit-target eligibility rule established in
 * 15D/15E: a `generic_social` item is only ever generated as Facebook
 * because the user explicitly chose it, never because the planner assumed it.
 */
@Injectable()
export class FacebookGenerationService {
  private readonly logger = new Logger(FacebookGenerationService.name);

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
    private readonly promptBuilder: ContentPromptBuilderService,
    private readonly engine: ContentGenerationEngineService,
    private readonly versioningService: ContentVersioningService,
  ) {}

  async generateFacebookDraft(
    organizationId: string,
    productId: string,
    campaignId: string,
    socialCalendarItemId: string,
    userId: string,
    options?: FacebookGenerationOptions,
  ): Promise<FacebookDraftResult> {
    const length = this.resolveLength(options);
    const maxHashtags = this.resolveMaxHashtags(options);

    // Cheap campaign-approval check first — this is itself the tenant/
    // product/campaign check, and avoids the expensive Growth Strategy
    // rebuild entirely when the campaign isn't even approved yet.
    const campaignApproval = await this.campaignReviewService.isCampaignApprovedForCurrentVersion(organizationId, productId, campaignId, userId);
    if (!campaignApproval.approved) {
      throw new ConflictException(campaignApproval.reason ?? 'Approve this campaign before generating a Facebook draft.');
    }

    const strategyReview = await this.growthStrategyReviewService.getReview(organizationId, productId, userId);
    if (strategyReview.status !== 'approved') {
      throw new ConflictException('Approve the current Growth Strategy before generating a Facebook draft.');
    }
    const product = await this.productsService.findOne(organizationId, productId, userId);
    const productUpdatedAt: Date = (product as { updatedAt?: Date }).updatedAt ?? new Date(0);
    const strategyStillApproved = await this.growthStrategyReviewService.isStrategyApprovedForCurrentVersion(organizationId, productId, userId, productUpdatedAt);
    if (!strategyStillApproved) {
      throw new ConflictException('The product has changed since the Growth Strategy was last approved. Review and approve it again before generating a Facebook draft.');
    }

    const campaign = await this.campaignsService.findOne(organizationId, productId, campaignId, userId);
    if (!campaign.goal) {
      throw new BadRequestException('Define a campaign goal before generating a Facebook draft.');
    }
    if (!campaign.plan) {
      throw new BadRequestException('Generate a 30-day campaign plan before generating a Facebook draft.');
    }

    // Single internal orchestration pass — Growth Strategy is built once,
    // and every 14A-14E layer is generated exactly once in memory, never
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

    const socialItem = socialCalendarResult.items.find((i) => i.id === socialCalendarItemId);
    if (!socialItem) {
      throw new NotFoundException('Social calendar item not found.');
    }

    const eligibilityWarnings = this.checkEligibility(socialItem);

    const pillar = pillarResult.pillars.find((p) => p.id === socialItem.pillarId);
    const topic = socialItem.topicId ? topicResult.topics.find((t) => t.id === socialItem.topicId) : undefined;
    const sourceBlogItem = socialItem.sourceBlogItemId ? blogCalendarResult.items.find((b) => b.id === socialItem.sourceBlogItemId) : undefined;

    if (socialItem.type === 'blog_promotion' && !socialItem.sourceBlogItemId) {
      throw new BadRequestException('This blog-promotion social item has no linked source blog item to promote.');
    }

    const includeCTA = options?.includeCTA;
    const suggestedCTA = includeCTA === false ? undefined : socialItem.suggestedCTA;
    const constraintsIncludeCTA = includeCTA === undefined ? !!socialItem.suggestedCTA : includeCTA;
    const includeHashtags = options?.includeHashtags === true;
    const tone = options?.tone ?? 'conversational';

    const promptInput = this.buildPromptInput(product, campaign, socialItem, pillar, topic, overview, length, tone, includeHashtags, suggestedCTA, constraintsIncludeCTA, options?.language, socialCalendarItemId);
    const promptBuild = this.promptBuilder.build(promptInput);

    const adapterInstruction = this.buildAdapterInstruction(socialItem, sourceBlogItem, length, includeHashtags, maxHashtags);

    const startedAt = Date.now();
    let generation;
    try {
      generation = await this.engine.generate({
        kind: 'facebook',
        systemPrompt: promptBuild.systemPrompt,
        prompt: `${adapterInstruction}\n\n${promptBuild.prompt}`,
        organizationId,
        productId,
        campaignId,
        sourceContext: promptBuild.sourceContext,
        metadata: { promptVersion: promptBuild.metadata.promptVersion, socialCalendarItemId },
      });
    } catch (err) {
      this.logOutcome(organizationId, productId, campaignId, socialCalendarItemId, 'unknown', 'unknown', Date.now() - startedAt, undefined, false);
      throw err;
    }
    this.logOutcome(organizationId, productId, campaignId, socialCalendarItemId, generation.provider, generation.model, Date.now() - startedAt, generation.usage, true);

    const content = generation.content.trim();
    const wordCount = content.length === 0 ? 0 : content.split(/\s+/).filter((w) => w.length > 0).length;
    const characterCount = content.length;

    const maxChars = this.getLengthMaxChars(length);
    const warnings = [...promptBuild.warnings, ...eligibilityWarnings];
    if (characterCount > maxChars) warnings.push('Generated Facebook draft exceeds the requested length target.');
    if (characterCount < TOO_SHORT_CHARS) warnings.push('Generated Facebook draft is suspiciously short.');

    const saved = await this.versioningService.saveGeneratedVersion({
      organizationId,
      productId,
      campaignId,
      kind: 'facebook',
      sourceType: 'social_calendar_item',
      sourceId: socialCalendarItemId,
      payload: { content, characterCount, wordCount },
      generationMetadata: buildGenerationMetadata(generation, promptBuild.metadata.promptVersion, promptBuild.sourceContext, warnings),
      generationOptions: { language: options?.language, tone, length, includeCTA: constraintsIncludeCTA, includeHashtags, maxHashtags },
      sourceSnapshot: { title: socialItem.title, type: socialItem.type, pillarId: socialItem.pillarId, topicId: socialItem.topicId },
      groundingEvidenceSnapshot: buildGroundingEvidenceSnapshot(promptInput),
      brandVoiceSnapshot: buildBrandVoiceSnapshot(promptInput),
      userId,
    });

    return {
      id: generation.id,
      kind: 'facebook',
      socialCalendarItemId,
      content,
      characterCount,
      wordCount,
      tone,
      length,
      provider: generation.provider,
      model: generation.model,
      usage: generation.usage,
      cost: generation.cost,
      promptVersion: promptBuild.metadata.promptVersion,
      sourceContext: promptBuild.sourceContext ?? {},
      warnings,
      generatedAt: generation.generatedAt,
      artifactId: saved.artifactId,
      versionId: saved.versionId,
      version: saved.version,
    };
  }

  // ---------------------------------------------------------------------
  // Eligibility — the critical generic_social vs. explicit-platform gate.
  // ---------------------------------------------------------------------

  private checkEligibility(item: SocialCalendarItem): string[] {
    if (item.platform === 'facebook') return [];
    if (item.platform === 'generic_social') {
      return ['Facebook was selected as the generation target for a generic social planning item; the campaign strategy did not explicitly identify Facebook.'];
    }
    throw new BadRequestException('This social calendar item is planned for another platform and is not eligible for Facebook generation.');
  }

  // ---------------------------------------------------------------------
  // Prompt input mapping — only supported, relevance-filtered evidence
  // ever reaches the prompt; never the raw request body.
  // ---------------------------------------------------------------------

  private buildPromptInput(
    product: { name: string; shortDescription?: string; productType?: string },
    campaign: CampaignResponse,
    socialItem: SocialCalendarItem,
    pillar: { title: string } | undefined,
    topic: { title: string } | undefined,
    overview: GrowthStrategyOverview,
    length: FacebookLength,
    tone: FacebookTone,
    includeHashtags: boolean,
    suggestedCTA: string | undefined,
    constraintsIncludeCTA: boolean,
    language: string | undefined,
    socialCalendarItemId: string,
  ): ContentPromptBuildInput {
    return {
      kind: 'facebook',
      product: {
        name: product.name,
        shortDescription: product.shortDescription,
        category: product.productType,
      },
      campaign: {
        name: campaign.name,
        goal: campaign.goal?.title,
        funnelStage: socialItem.funnelStage,
        audienceSegmentIds: socialItem.audienceSegmentIds,
        channelIds: campaign.channelIds,
        conversionDirection: campaign.goal?.description,
      },
      content: {
        title: socialItem.title,
        type: socialItem.type,
        angle: socialItem.angle,
        funnelStage: socialItem.funnelStage,
        audience: socialItem.audienceSegmentIds.map((id) => resolveAudienceLabel(campaign.audienceChannelMapping, id)),
        keywords: socialItem.keywords,
        pillar: pillar?.title,
        topic: topic?.title,
        messagingDirections: mapMessagingDirectionsFromOverview(overview, socialItem.audienceSegmentIds, socialItem.funnelStage, socialItem.messagingPillarIds),
        suggestedCTA,
        formatDirection: socialItem.recommendedFormat,
      },
      evidence: mapEvidenceFromOverview(overview, socialItem.audienceSegmentIds),
      brand: { tone: TONE_LABELS[tone] },
      constraints: {
        language,
        maxCharacters: this.getLengthMaxChars(length),
        includeCTA: constraintsIncludeCTA,
        includeHashtags,
      },
      sourceContext: {
        strategyGeneratedAt: overview.generatedAt.toISOString(),
        campaignPlanningVersion: campaign.planningMetadata.version,
        sourceIds: [socialCalendarItemId],
      },
    };
  }

  private buildAdapterInstruction(
    socialItem: SocialCalendarItem,
    sourceBlogItem: { title: string } | undefined,
    length: FacebookLength,
    includeHashtags: boolean,
    maxHashtags: number,
  ): string {
    const lines = [BASE_FACEBOOK_INSTRUCTION, LENGTH_INSTRUCTION[length]];

    const formatInstruction = FORMAT_INSTRUCTIONS[socialItem.recommendedFormat];
    if (formatInstruction) lines.push(formatInstruction);

    if (socialItem.type === 'blog_promotion') {
      if (sourceBlogItem) {
        lines.push(`Create Facebook copy that introduces and promotes the planned blog topic: "${sourceBlogItem.title}".`);
      }
      lines.push('Do not invent a URL, "Read more here," a tracking link, or a link-in-comments instruction — no link is supplied.');
    }

    if (includeHashtags) {
      lines.push(`Use at most ${maxHashtags} relevant hashtags — do not hashtag-stuff or invent trending hashtags.`);
    }

    return lines.join(' ');
  }

  // ---------------------------------------------------------------------
  // Options resolution
  // ---------------------------------------------------------------------

  private resolveLength(options: FacebookGenerationOptions | undefined): FacebookLength {
    return options?.length ?? this.getDefaultLength();
  }

  private resolveMaxHashtags(options: FacebookGenerationOptions | undefined): number {
    const limit = this.getMaxHashtagsLimit();
    const requested = options?.maxHashtags ?? this.getDefaultHashtags();
    return Math.min(Math.max(requested, 1), limit);
  }

  // ---------------------------------------------------------------------
  // Config-driven defaults — GIP generation constraints, not a statement
  // about Facebook's actual current platform limits.
  // ---------------------------------------------------------------------

  private getDefaultLength(): FacebookLength {
    const value = this.configService.get<string>('FACEBOOK_GENERATION_DEFAULT_LENGTH');
    return value === 'short' || value === 'medium' || value === 'long' ? value : DEFAULT_LENGTH;
  }

  private getLengthMaxChars(length: FacebookLength): number {
    const key = length === 'short' ? 'FACEBOOK_GENERATION_SHORT_MAX_CHARS' : length === 'long' ? 'FACEBOOK_GENERATION_LONG_MAX_CHARS' : 'FACEBOOK_GENERATION_MEDIUM_MAX_CHARS';
    const fallback = length === 'short' ? DEFAULT_SHORT_MAX_CHARS : length === 'long' ? DEFAULT_LONG_MAX_CHARS : DEFAULT_MEDIUM_MAX_CHARS;
    return this.getEnvNumber(key, fallback);
  }

  private getMaxHashtagsLimit(): number {
    return this.getEnvNumber('FACEBOOK_GENERATION_MAX_HASHTAGS', DEFAULT_MAX_HASHTAGS_LIMIT);
  }

  private getDefaultHashtags(): number {
    return this.getEnvNumber('FACEBOOK_GENERATION_DEFAULT_HASHTAGS', DEFAULT_HASHTAGS);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  // ---------------------------------------------------------------------
  // Logging — org/product/campaign/item/provider/model/latency/tokens
  // only, never prompts, generated content, evidence text, or API keys.
  // ---------------------------------------------------------------------

  private logOutcome(
    organizationId: string,
    productId: string,
    campaignId: string,
    socialCalendarItemId: string,
    provider: string,
    model: string,
    latencyMs: number,
    usage: { totalTokens?: number } | undefined,
    success: boolean,
  ): void {
    const tokenPart = usage?.totalTokens !== undefined ? ` totalTokens=${usage.totalTokens}` : '';
    this.logger.log(
      `org=${organizationId} product=${productId} campaign=${campaignId} socialCalendarItemId=${socialCalendarItemId} provider=${provider} model=${model} success=${success} latencyMs=${latencyMs}${tokenPart}`,
    );
  }
}
