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
import { ContentGenerationValidationError } from '../errors/content-generation.errors';
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
import type { XDraftResult, XGenerationOptions, XMode, XTone } from '../types/x-generation.types';

const DEFAULT_MODE: XMode = 'single_post';
const DEFAULT_TONE: XTone = 'concise';

// GIP product-level generation targets — NOT a statement about X's current
// platform character limit, which this adapter deliberately does not
// hardcode or assume.
const DEFAULT_SINGLE_TARGET_CHARS = 260;
const DEFAULT_SINGLE_MAX_CHARS = 280;
const DEFAULT_THREAD_MAX_POSTS = 5;
const DEFAULT_MAX_THREAD_POSTS = 10;
const DEFAULT_THREAD_POST_MAX_CHARS = 280;

const DEFAULT_MAX_HASHTAGS_LIMIT = 4;
const DEFAULT_HASHTAGS = 2;

const TONE_LABELS: Record<XTone, string[]> = {
  concise: ['concise', 'direct'],
  professional: ['professional', 'clear'],
  conversational: ['conversational', 'approachable'],
  thought_leadership: ['thought-provoking', 'insight-led'],
};

// Extra guidance per 14E recommendedFormat — the model must never invent a
// carousel/poll/video-script asset that this endpoint was never asked to
// produce; it only ever returns X post text.
const FORMAT_INSTRUCTIONS: Record<string, string> = {
  carousel_direction: 'Write X post copy only — do not produce slide-by-slide carousel content unless the planning evidence explicitly supplies it.',
  image_post_direction: 'Write only the accompanying X post text — do not describe or generate image content.',
  poll_direction: 'Write X post framing only — do not invent poll options unless the planning evidence explicitly supplies them.',
  short_video_direction: 'Write the accompanying X post text only — do not write a video script.',
};

const BASE_X_INSTRUCTION = [
  'Write concise, X-native copy with a direct opening and minimal filler.',
  'Use short, clear sentences and preserve the planned topic and angle below.',
  'Ground every claim in the evidence and direction supplied below; never fabricate statistics, results, or customers.',
  'Do not attempt to "make this go viral," "hack the algorithm," or "maximize impressions" — write clearly for an X audience.',
].join(' ');

// Matches "[POST 1]", "POST 1:", "POST 1-", "1.", or "1)" at the start of a
// line. Kept deliberately small — this is not a general natural-language
// parser, just a deterministic delimiter reader.
const POST_MARKER_REGEX = /(?:^|\n)[ \t]*(?:\[POST\s*(\d+)\]|POST\s*(\d+)\s*[:\-]|(\d+)[.)])[ \t]*/gi;

/**
 * Small deterministic delimiter reader — not a general natural-language
 * parser. Accepts "[POST N]", "POST N:"/"POST N-", "N." or "N)" markers at
 * the start of a line, and requires the parsed post numbers to be a
 * strictly ordered 1..N sequence; anything else is treated as unparseable
 * so the caller can fail validation rather than guess. Exported (moved out
 * of the class in 16H) so the improvement flow can parse a revised thread
 * with the exact same rules used for original generation.
 */
export function parseXThreadPosts(raw: string): string[] {
  const text = raw.replace(/\r\n/g, '\n');
  const matches: { index: number; length: number; num: number }[] = [];
  let match: RegExpExecArray | null;
  POST_MARKER_REGEX.lastIndex = 0;
  while ((match = POST_MARKER_REGEX.exec(text)) !== null) {
    const num = Number(match[1] ?? match[2] ?? match[3]);
    matches.push({ index: match.index, length: match[0].length, num });
  }
  if (matches.length === 0) return [];
  for (let i = 0; i < matches.length; i++) {
    if (matches[i].num !== i + 1) return [];
  }

  const posts: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const body = text.slice(start, end).trim();
    if (body.length > 0) posts.push(body);
  }
  return posts;
}

/**
 * X content-type adapter over the 15A engine / 15B prompt builder. Follows
 * the exact explicit-target eligibility rule established in 15D: a
 * `generic_social` item is only ever generated as X because the user
 * explicitly chose it, never because the planner assumed it.
 */
@Injectable()
export class XGenerationService {
  private readonly logger = new Logger(XGenerationService.name);

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

  async generateXDraft(
    organizationId: string,
    productId: string,
    campaignId: string,
    socialCalendarItemId: string,
    userId: string,
    options?: XGenerationOptions,
  ): Promise<XDraftResult> {
    const threadMaxPosts = this.resolveThreadMaxPosts(options);
    const maxHashtags = this.resolveMaxHashtags(options);

    // Cheap campaign-approval check first — this is itself the tenant/
    // product/campaign check, and avoids the expensive Growth Strategy
    // rebuild entirely when the campaign isn't even approved yet.
    const campaignApproval = await this.campaignReviewService.isCampaignApprovedForCurrentVersion(organizationId, productId, campaignId, userId);
    if (!campaignApproval.approved) {
      throw new ConflictException(campaignApproval.reason ?? 'Approve this campaign before generating an X draft.');
    }

    const strategyReview = await this.growthStrategyReviewService.getReview(organizationId, productId, userId);
    if (strategyReview.status !== 'approved') {
      throw new ConflictException('Approve the current Growth Strategy before generating an X draft.');
    }
    const product = await this.productsService.findOne(organizationId, productId, userId);
    const productUpdatedAt: Date = (product as { updatedAt?: Date }).updatedAt ?? new Date(0);
    const strategyStillApproved = await this.growthStrategyReviewService.isStrategyApprovedForCurrentVersion(organizationId, productId, userId, productUpdatedAt);
    if (!strategyStillApproved) {
      throw new ConflictException('The product has changed since the Growth Strategy was last approved. Review and approve it again before generating an X draft.');
    }

    const campaign = await this.campaignsService.findOne(organizationId, productId, campaignId, userId);
    if (!campaign.goal) {
      throw new BadRequestException('Define a campaign goal before generating an X draft.');
    }
    if (!campaign.plan) {
      throw new BadRequestException('Generate a 30-day campaign plan before generating an X draft.');
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

    const mode = this.resolveMode(socialItem, options);
    const includeCTA = options?.includeCTA;
    const suggestedCTA = includeCTA === false ? undefined : socialItem.suggestedCTA;
    const constraintsIncludeCTA = includeCTA === undefined ? !!socialItem.suggestedCTA : includeCTA;
    const includeHashtags = options?.includeHashtags === true;
    const tone = options?.tone ?? DEFAULT_TONE;

    const promptInput = this.buildPromptInput(product, campaign, socialItem, pillar, topic, overview, mode, tone, includeHashtags, suggestedCTA, constraintsIncludeCTA, options?.language, socialCalendarItemId);
    const promptBuild = this.promptBuilder.build(promptInput);

    const adapterInstruction = this.buildAdapterInstruction(socialItem, sourceBlogItem, mode, threadMaxPosts, includeHashtags, maxHashtags);

    const startedAt = Date.now();
    let generation;
    try {
      generation = await this.engine.generate({
        kind: 'x',
        systemPrompt: promptBuild.systemPrompt,
        prompt: `${adapterInstruction}\n\n${promptBuild.prompt}`,
        organizationId,
        productId,
        campaignId,
        sourceContext: promptBuild.sourceContext,
        metadata: { promptVersion: promptBuild.metadata.promptVersion, socialCalendarItemId, mode },
      });
    } catch (err) {
      this.logOutcome(organizationId, productId, campaignId, socialCalendarItemId, mode, 'unknown', 'unknown', Date.now() - startedAt, undefined, false);
      throw err;
    }
    this.logOutcome(organizationId, productId, campaignId, socialCalendarItemId, mode, generation.provider, generation.model, Date.now() - startedAt, generation.usage, true);

    const warnings = [...promptBuild.warnings, ...eligibilityWarnings];
    const result =
      mode === 'thread'
        ? this.buildThreadResult(generation, threadMaxPosts, warnings)
        : this.buildSingleResult(generation, warnings);

    const saved = await this.versioningService.saveGeneratedVersion({
      organizationId,
      productId,
      campaignId,
      kind: 'x',
      sourceType: 'social_calendar_item',
      sourceId: socialCalendarItemId,
      payload: { mode, ...result },
      generationMetadata: buildGenerationMetadata(generation, promptBuild.metadata.promptVersion, promptBuild.sourceContext, warnings),
      generationOptions: { language: options?.language, mode, tone, includeCTA: constraintsIncludeCTA, includeHashtags, maxHashtags, threadMaxPosts },
      sourceSnapshot: { title: socialItem.title, type: socialItem.type, pillarId: socialItem.pillarId, topicId: socialItem.topicId },
      groundingEvidenceSnapshot: buildGroundingEvidenceSnapshot(promptInput),
      brandVoiceSnapshot: buildBrandVoiceSnapshot(promptInput),
      userId,
    });

    return {
      id: generation.id,
      kind: 'x',
      socialCalendarItemId,
      mode,
      ...result,
      tone,
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
    if (item.platform === 'x') return [];
    if (item.platform === 'generic_social') {
      return ['X was selected as the generation target for a generic social planning item; the campaign strategy did not explicitly identify X.'];
    }
    throw new BadRequestException('This social calendar item is planned for another platform and is not eligible for X generation.');
  }

  // ---------------------------------------------------------------------
  // Mode resolution — an explicit user choice always wins; otherwise a
  // thread_direction item defaults to thread, everything else to single.
  // ---------------------------------------------------------------------

  private resolveMode(item: SocialCalendarItem, options: XGenerationOptions | undefined): XMode {
    if (options?.mode) return options.mode;
    return item.recommendedFormat === 'thread_direction' ? 'thread' : DEFAULT_MODE;
  }

  // ---------------------------------------------------------------------
  // Single/thread output normalization
  // ---------------------------------------------------------------------

  private buildSingleResult(
    generation: { content: string },
    warnings: string[],
  ): { content: string; characterCount: number; wordCount: number } {
    const content = generation.content.trim();
    const characterCount = content.length;
    const wordCount = content.length === 0 ? 0 : content.split(/\s+/).filter((w) => w.length > 0).length;

    const maxChars = this.getSingleMaxChars();
    if (characterCount > maxChars) warnings.push('Generated X draft exceeds the requested single-post length target.');

    return { content, characterCount, wordCount };
  }

  private buildThreadResult(
    generation: { content: string },
    threadMaxPosts: number,
    warnings: string[],
  ): { posts: string[]; postCharacterCounts: number[]; wordCount: number } {
    const parsed = parseXThreadPosts(generation.content);
    if (parsed.length === 0) {
      throw new ContentGenerationValidationError('The generated content could not be parsed into an X thread.');
    }
    if (parsed.length === 1) {
      throw new ContentGenerationValidationError('The generated content only produced a single post, which is not a meaningful X thread.');
    }

    let posts = parsed;
    if (posts.length > threadMaxPosts) {
      posts = posts.slice(0, threadMaxPosts);
      warnings.push(`Generated X thread exceeded the requested post count and was truncated to ${threadMaxPosts} posts.`);
    } else if (posts.length < threadMaxPosts) {
      warnings.push('Generated X thread has fewer posts than requested.');
    }

    const maxCharsPerPost = this.getThreadPostMaxChars();
    const postCharacterCounts = posts.map((p) => p.length);
    posts.forEach((p, i) => {
      if (p.length > maxCharsPerPost) warnings.push(`Post ${i + 1} of the generated X thread exceeds the requested per-post length target.`);
    });

    const wordCount = posts.reduce((sum, p) => sum + (p.length === 0 ? 0 : p.split(/\s+/).filter((w) => w.length > 0).length), 0);

    return { posts, postCharacterCounts, wordCount };
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
    mode: XMode,
    tone: XTone,
    includeHashtags: boolean,
    suggestedCTA: string | undefined,
    constraintsIncludeCTA: boolean,
    language: string | undefined,
    socialCalendarItemId: string,
  ): ContentPromptBuildInput {
    return {
      kind: 'x',
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
        maxCharacters: mode === 'single_post' ? this.getSingleMaxChars() : undefined,
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
    mode: XMode,
    threadMaxPosts: number,
    includeHashtags: boolean,
    maxHashtags: number,
  ): string {
    const lines = [BASE_X_INSTRUCTION];

    if (mode === 'thread') {
      lines.push(
        `Create an ordered X thread of at most ${threadMaxPosts} posts using the required delimiter format — write each post as "[POST N]" on its own line followed by that post's text, then "[POST N+1]" for the next post, and so on. Do not use any other delimiter formatting.`,
      );
      lines.push(`Keep each individual post within about ${this.getThreadPostMaxChars()} characters.`);
    } else {
      lines.push('Create one concise X post.');
      lines.push(`Aim for roughly ${this.getSingleTargetChars()} characters and stay within ${this.getSingleMaxChars()}.`);
    }

    const formatInstruction = FORMAT_INSTRUCTIONS[socialItem.recommendedFormat];
    if (formatInstruction) lines.push(formatInstruction);

    if (socialItem.type === 'blog_promotion') {
      if (sourceBlogItem) {
        lines.push(`Create concise X copy introducing the planned blog topic: "${sourceBlogItem.title}".`);
      }
      lines.push('Do not invent a URL, link, "read more here," or tracking link — no link is supplied.');
    }

    if (includeHashtags) {
      lines.push(`Use at most ${maxHashtags} relevant hashtags — do not hashtag-stuff or invent trending hashtags.`);
    }

    return lines.join(' ');
  }

  // ---------------------------------------------------------------------
  // Options resolution
  // ---------------------------------------------------------------------

  private resolveThreadMaxPosts(options: XGenerationOptions | undefined): number {
    const limit = this.getMaxThreadPosts();
    const requested = options?.threadMaxPosts ?? this.getDefaultThreadMaxPosts();
    return Math.min(Math.max(requested, 2), limit);
  }

  private resolveMaxHashtags(options: XGenerationOptions | undefined): number {
    const limit = this.getMaxHashtagsLimit();
    const requested = options?.maxHashtags ?? this.getDefaultHashtags();
    return Math.min(Math.max(requested, 1), limit);
  }

  // ---------------------------------------------------------------------
  // Config-driven defaults — GIP generation constraints, not a statement
  // about X's actual current platform character limits.
  // ---------------------------------------------------------------------

  private getSingleTargetChars(): number {
    return this.getEnvNumber('X_GENERATION_SINGLE_TARGET_CHARS', DEFAULT_SINGLE_TARGET_CHARS);
  }

  private getSingleMaxChars(): number {
    return this.getEnvNumber('X_GENERATION_SINGLE_MAX_CHARS', DEFAULT_SINGLE_MAX_CHARS);
  }

  private getDefaultThreadMaxPosts(): number {
    return this.getEnvNumber('X_GENERATION_DEFAULT_THREAD_MAX_POSTS', DEFAULT_THREAD_MAX_POSTS);
  }

  private getMaxThreadPosts(): number {
    return this.getEnvNumber('X_GENERATION_MAX_THREAD_POSTS', DEFAULT_MAX_THREAD_POSTS);
  }

  private getThreadPostMaxChars(): number {
    return this.getEnvNumber('X_GENERATION_THREAD_POST_MAX_CHARS', DEFAULT_THREAD_POST_MAX_CHARS);
  }

  private getMaxHashtagsLimit(): number {
    return this.getEnvNumber('X_GENERATION_MAX_HASHTAGS', DEFAULT_MAX_HASHTAGS_LIMIT);
  }

  private getDefaultHashtags(): number {
    return this.getEnvNumber('X_GENERATION_DEFAULT_HASHTAGS', DEFAULT_HASHTAGS);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  // ---------------------------------------------------------------------
  // Logging — org/product/campaign/item/mode/provider/model/latency/tokens
  // only, never prompts, generated content, evidence text, or API keys.
  // ---------------------------------------------------------------------

  private logOutcome(
    organizationId: string,
    productId: string,
    campaignId: string,
    socialCalendarItemId: string,
    mode: XMode,
    provider: string,
    model: string,
    latencyMs: number,
    usage: { totalTokens?: number } | undefined,
    success: boolean,
  ): void {
    const tokenPart = usage?.totalTokens !== undefined ? ` totalTokens=${usage.totalTokens}` : '';
    this.logger.log(
      `org=${organizationId} product=${productId} campaign=${campaignId} socialCalendarItemId=${socialCalendarItemId} mode=${mode} provider=${provider} model=${model} success=${success} latencyMs=${latencyMs}${tokenPart}`,
    );
  }
}
