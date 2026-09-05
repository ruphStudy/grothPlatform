import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CampaignReviewService } from '../../campaigns/campaign-review.service';
import { CampaignsService } from '../../campaigns/campaigns.service';
import type { CampaignResponse } from '../../campaigns/types/campaign.types';
import { BlogCalendarService } from '../../content-planning/blog-calendar.service';
import { ContentIdeaService } from '../../content-planning/content-idea.service';
import { ContentPillarPlanService } from '../../content-planning/content-pillar-plan.service';
import type { CampaignContentPillar } from '../../content-planning/types/content-pillar-plan.types';
import { TopicPrioritizationService } from '../../content-planning/topic-prioritization.service';
import type { ContentTopic } from '../../content-planning/types/topic-prioritization.types';
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
import type { NewsletterDraftResult, NewsletterGenerationOptions, NewsletterLength, NewsletterSourceType, NewsletterTone } from '../types/newsletter-generation.types';

const NEWSLETTER_SOURCE_TYPES: NewsletterSourceType[] = ['blog_calendar_item', 'content_topic', 'content_pillar'];

const DEFAULT_LENGTH: NewsletterLength = 'medium';
const DEFAULT_OUTPUT_FORMAT: 'markdown' | 'plain_text' = 'markdown';

// GIP product-level generation targets — not a statement about any email
// platform's rendering limits.
const DEFAULT_WORD_RANGE: Record<NewsletterLength, { min: number; max: number }> = {
  short: { min: 250, max: 500 },
  medium: { min: 500, max: 900 },
  long: { min: 900, max: 1400 },
};
const DEFAULT_HARD_MAX_WORDS = 1800;
const DEFAULT_MIN_PILLAR_CONFIDENCE = 50;

const TONE_LABELS: Record<NewsletterTone, string[]> = {
  professional: ['professional', 'clear'],
  conversational: ['conversational', 'approachable'],
  educational: ['educational', 'informative'],
  thought_leadership: ['thought-provoking', 'insight-led'],
};

const BASE_NEWSLETTER_INSTRUCTION = [
  'Create one editorial newsletter draft around the supplied planning direction.',
  'Keep the main theme focused, use clear structure with readable paragraphs, and include useful takeaways.',
  'Ground every claim in the evidence and direction supplied below; never fabricate statistics, results, or customers.',
  'Do not include a personalized greeting such as "Hi {{first_name}}", an unsubscribe notice, a physical mailing address, a sender identity, or any send-time or segmentation detail — return content body only.',
  'Do not invent a URL, blog link, product link, "click here," or "read more" unless a real link is supplied — none is supplied here.',
  'Keywords are thematic context only — use them naturally, never keyword-stuff, and never make ranking or search-demand claims.',
].join(' ');

// Deterministic delimiter reader — matches "[SUBJECT]"/"[PREHEADER]"/"[BODY]"
// or "SUBJECT:"/"PREHEADER:"/"BODY:" at the start of a line. Not a general
// NLP parser; only these three section names are recognized.
const SECTION_MARKER_REGEX = /(?:^|\n)[ \t]*(?:\[(SUBJECT|PREHEADER|BODY)\]|(SUBJECT|PREHEADER|BODY)\s*:)[ \t]*/gi;

interface ParsedNewsletter {
  subjectLine?: string;
  preheader?: string;
  body?: string;
}

function parseNewsletterSections(raw: string): ParsedNewsletter {
  const text = raw.replace(/\r\n/g, '\n');
  const matches: { index: number; length: number; name: string }[] = [];
  let match: RegExpExecArray | null;
  SECTION_MARKER_REGEX.lastIndex = 0;
  while ((match = SECTION_MARKER_REGEX.exec(text)) !== null) {
    const name = (match[1] ?? match[2]).toUpperCase();
    matches.push({ index: match.index, length: match[0].length, name });
  }

  const sections: Record<string, string> = {};
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const value = text.slice(start, end).trim();
    if (value.length > 0 && !(matches[i].name in sections)) sections[matches[i].name] = value;
  }

  return { subjectLine: sections.SUBJECT, preheader: sections.PREHEADER, body: sections.BODY };
}

interface ResolvedSource {
  title: string;
  type?: string;
  angle?: string;
  objective?: string;
  funnelStage?: string;
  audienceSegmentIds: string[];
  keywords: string[];
  pillarId?: string;
  pillarTitle?: string;
  topicId?: string;
  topicTitle?: string;
  messagingPillarIds: string[];
  suggestedCTA?: string;
}

/**
 * Newsletter content-type adapter over the 15A engine / 15B prompt builder.
 * There is no dedicated Newsletter Calendar in Sprint 14 — a newsletter is
 * generated from one explicit, server-validated planning source (a real
 * 14D blog item, 14B topic, or 14C pillar), never from frontend-supplied
 * subject/topic text. Only rebuilds through 14D — 14E-14G are not needed
 * here and are deliberately skipped for performance.
 */
@Injectable()
export class NewsletterGenerationService {
  private readonly logger = new Logger(NewsletterGenerationService.name);

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
    private readonly versioningService: ContentVersioningService,
  ) {}

  async generateNewsletterDraft(
    organizationId: string,
    productId: string,
    campaignId: string,
    sourceType: string,
    sourceId: string,
    userId: string,
    options?: NewsletterGenerationOptions,
  ): Promise<NewsletterDraftResult> {
    if (!NEWSLETTER_SOURCE_TYPES.includes(sourceType as NewsletterSourceType)) {
      throw new BadRequestException(`Unsupported newsletter source type: ${sourceType}`);
    }
    const resolvedSourceType = sourceType as NewsletterSourceType;

    const length = this.resolveLength(options);
    const outputFormat = options?.outputFormat ?? DEFAULT_OUTPUT_FORMAT;
    const includeSubjectLine = options?.includeSubjectLine !== false;
    const includePreheader = options?.includePreheader !== false;
    const tone = options?.tone ?? 'professional';

    // Cheap campaign-approval check first — this is itself the tenant/
    // product/campaign check, and avoids the expensive Growth Strategy
    // rebuild entirely when the campaign isn't even approved yet.
    const campaignApproval = await this.campaignReviewService.isCampaignApprovedForCurrentVersion(organizationId, productId, campaignId, userId);
    if (!campaignApproval.approved) {
      throw new ConflictException(campaignApproval.reason ?? 'Approve this campaign before generating a newsletter draft.');
    }

    const strategyReview = await this.growthStrategyReviewService.getReview(organizationId, productId, userId);
    if (strategyReview.status !== 'approved') {
      throw new ConflictException('Approve the current Growth Strategy before generating a newsletter draft.');
    }
    const product = await this.productsService.findOne(organizationId, productId, userId);
    const productUpdatedAt: Date = (product as { updatedAt?: Date }).updatedAt ?? new Date(0);
    const strategyStillApproved = await this.growthStrategyReviewService.isStrategyApprovedForCurrentVersion(organizationId, productId, userId, productUpdatedAt);
    if (!strategyStillApproved) {
      throw new ConflictException('The product has changed since the Growth Strategy was last approved. Review and approve it again before generating a newsletter draft.');
    }

    const campaign = await this.campaignsService.findOne(organizationId, productId, campaignId, userId);
    if (!campaign.goal) {
      throw new BadRequestException('Define a campaign goal before generating a newsletter draft.');
    }
    if (!campaign.plan) {
      throw new BadRequestException('Generate a 30-day campaign plan before generating a newsletter draft.');
    }

    // Single internal orchestration pass — Growth Strategy is built once,
    // and only 14A-14D are generated (14E-14G are not needed for a
    // newsletter and are deliberately skipped for performance).
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

    const resolvedSource = this.resolveSource(resolvedSourceType, sourceId, blogCalendarResult.items, topicResult.topics, pillarResult.pillars);

    const includeCTA = options?.includeCTA;
    const suggestedCTA = includeCTA === false ? undefined : resolvedSource.suggestedCTA;
    const constraintsIncludeCTA = includeCTA === undefined ? !!resolvedSource.suggestedCTA : includeCTA;

    const wordRange = this.resolveWordRange(length);
    const promptInput = this.buildPromptInput(product, campaign, resolvedSource, overview, tone, outputFormat, wordRange, suggestedCTA, constraintsIncludeCTA, options?.language, resolvedSourceType, sourceId);
    const promptBuild = this.promptBuilder.build(promptInput);

    const adapterInstruction = this.buildAdapterInstruction(includeSubjectLine, includePreheader);

    const startedAt = Date.now();
    let generation;
    try {
      generation = await this.engine.generate({
        kind: 'newsletter',
        systemPrompt: promptBuild.systemPrompt,
        prompt: `${adapterInstruction}\n\n${promptBuild.prompt}`,
        organizationId,
        productId,
        campaignId,
        sourceContext: promptBuild.sourceContext,
        metadata: { promptVersion: promptBuild.metadata.promptVersion, sourceType: resolvedSourceType, sourceId },
      });
    } catch (err) {
      this.logOutcome(organizationId, productId, campaignId, resolvedSourceType, sourceId, 'unknown', 'unknown', Date.now() - startedAt, undefined, false);
      throw err;
    }
    this.logOutcome(organizationId, productId, campaignId, resolvedSourceType, sourceId, generation.provider, generation.model, Date.now() - startedAt, generation.usage, true);

    const parsed = parseNewsletterSections(generation.content);
    if (!parsed.body) {
      throw new ContentGenerationValidationError('The generated content did not include a mandatory [BODY] section.');
    }
    const body = parsed.body.trim();

    const wordCount = body.length === 0 ? 0 : body.split(/\s+/).filter((w) => w.length > 0).length;
    const characterCount = body.length;

    const warnings = [...promptBuild.warnings];
    if (includeSubjectLine && !parsed.subjectLine) warnings.push('Requested subject line was not returned by the generator.');
    if (includePreheader && !parsed.preheader) warnings.push('Requested preheader was not returned by the generator.');
    if (wordCount < wordRange.min) warnings.push('Generated newsletter body is shorter than requested.');
    if (wordCount > wordRange.max) warnings.push('Generated newsletter body is longer than requested.');

    const saved = await this.versioningService.saveGeneratedVersion({
      organizationId,
      productId,
      campaignId,
      kind: 'newsletter',
      sourceType: resolvedSourceType,
      sourceId,
      payload: { subjectLine: parsed.subjectLine, preheader: parsed.preheader, content: body, format: outputFormat, wordCount, characterCount },
      generationMetadata: buildGenerationMetadata(generation, promptBuild.metadata.promptVersion, promptBuild.sourceContext, warnings),
      generationOptions: { language: options?.language, tone, length, outputFormat, includeCTA: constraintsIncludeCTA, includeSubjectLine, includePreheader },
      sourceSnapshot: { title: resolvedSource.title, type: resolvedSource.type, pillarId: resolvedSource.pillarId, topicId: resolvedSource.topicId },
      groundingEvidenceSnapshot: buildGroundingEvidenceSnapshot(promptInput),
      brandVoiceSnapshot: buildBrandVoiceSnapshot(promptInput),
      userId,
    });

    return {
      id: generation.id,
      kind: 'newsletter',
      sourceType: resolvedSourceType,
      sourceId,
      subjectLine: parsed.subjectLine,
      preheader: parsed.preheader,
      content: body,
      format: outputFormat,
      wordCount,
      characterCount,
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
  // Source resolution — reconstructed server-side only; never accepts
  // frontend-supplied subject/topic text.
  // ---------------------------------------------------------------------

  private resolveSource(
    sourceType: NewsletterSourceType,
    sourceId: string,
    blogItems: { id: string; title: string; type: string; angle: string; objective: string; funnelStage: string; audienceSegmentIds: string[]; primaryKeyword?: string; supportingKeywords: string[]; pillarId: string; topicId: string; suggestedCTA?: string }[],
    topics: ContentTopic[],
    pillars: CampaignContentPillar[],
  ): ResolvedSource {
    if (sourceType === 'blog_calendar_item') {
      const blogItem = blogItems.find((i) => i.id === sourceId);
      if (!blogItem) throw new NotFoundException('Blog calendar item not found.');
      const pillar = pillars.find((p) => p.id === blogItem.pillarId);
      const topic = topics.find((t) => t.id === blogItem.topicId);
      return {
        title: blogItem.title,
        type: blogItem.type,
        angle: blogItem.angle,
        objective: blogItem.objective,
        funnelStage: blogItem.funnelStage,
        audienceSegmentIds: blogItem.audienceSegmentIds,
        keywords: [...(blogItem.primaryKeyword ? [blogItem.primaryKeyword] : []), ...blogItem.supportingKeywords],
        pillarId: blogItem.pillarId,
        pillarTitle: pillar?.title,
        topicId: blogItem.topicId,
        topicTitle: topic?.title,
        messagingPillarIds: pillar?.messagingPillarIds ?? [],
        suggestedCTA: blogItem.suggestedCTA,
      };
    }

    if (sourceType === 'content_topic') {
      const topic = topics.find((t) => t.id === sourceId);
      if (!topic) throw new NotFoundException('Content topic not found.');
      if (topic.tier === 'deferred') {
        throw new BadRequestException('This topic is deferred and does not have enough evidence for newsletter generation.');
      }
      const pillar = pillars.find((p) => p.topicIds.includes(topic.id));
      return {
        title: topic.title,
        funnelStage: topic.funnelStages[0],
        audienceSegmentIds: topic.audienceSegmentIds,
        keywords: topic.keywords,
        pillarId: pillar?.id,
        pillarTitle: pillar?.title,
        topicId: topic.id,
        topicTitle: topic.title,
        messagingPillarIds: topic.messagingPillarIds,
        suggestedCTA: undefined,
      };
    }

    // content_pillar
    const pillar = pillars.find((p) => p.id === sourceId);
    if (!pillar) throw new NotFoundException('Content pillar not found.');
    if (pillar.tier === 'experimental' && pillar.confidenceScore < this.getMinPillarConfidence()) {
      throw new BadRequestException('This content pillar has insufficient evidence for newsletter generation.');
    }
    const memberTopics = topics
      .filter((t) => pillar.topicIds.includes(t.id))
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, 3);
    const relatedThemes = memberTopics.slice(1).map((t) => `Related theme: ${t.title}`);

    return {
      title: pillar.title,
      objective: pillar.purpose,
      funnelStage: pillar.funnelStages[0],
      audienceSegmentIds: pillar.audienceSegmentIds,
      keywords: [...pillar.keywords, ...memberTopics.flatMap((t) => t.keywords)],
      pillarId: pillar.id,
      pillarTitle: pillar.title,
      topicId: memberTopics[0]?.id,
      topicTitle: memberTopics[0]?.title,
      messagingPillarIds: pillar.messagingPillarIds,
      suggestedCTA: undefined,
      angle: relatedThemes.length > 0 ? relatedThemes.join('; ') : undefined,
    };
  }

  // ---------------------------------------------------------------------
  // Prompt input mapping — only supported, relevance-filtered evidence
  // ever reaches the prompt; never the raw request body.
  // ---------------------------------------------------------------------

  private buildPromptInput(
    product: { name: string; shortDescription?: string; productType?: string },
    campaign: CampaignResponse,
    source: ResolvedSource,
    overview: GrowthStrategyOverview,
    tone: NewsletterTone,
    outputFormat: 'markdown' | 'plain_text',
    wordRange: { min: number; max: number },
    suggestedCTA: string | undefined,
    constraintsIncludeCTA: boolean,
    language: string | undefined,
    sourceType: NewsletterSourceType,
    sourceId: string,
  ): ContentPromptBuildInput {
    const funnelStage = source.funnelStage ?? '';
    return {
      kind: 'newsletter',
      product: {
        name: product.name,
        shortDescription: product.shortDescription,
        category: product.productType,
      },
      campaign: {
        name: campaign.name,
        goal: campaign.goal?.title,
        funnelStage,
        audienceSegmentIds: source.audienceSegmentIds,
        channelIds: campaign.channelIds,
        conversionDirection: campaign.goal?.description,
      },
      content: {
        title: source.title,
        type: source.type,
        angle: source.angle,
        objective: source.objective,
        funnelStage,
        audience: source.audienceSegmentIds.map((id) => resolveAudienceLabel(campaign.audienceChannelMapping, id)),
        keywords: source.keywords,
        pillar: source.pillarTitle,
        topic: source.topicTitle,
        messagingDirections: mapMessagingDirectionsFromOverview(overview, source.audienceSegmentIds, funnelStage, source.messagingPillarIds),
        suggestedCTA,
      },
      evidence: mapEvidenceFromOverview(overview, source.audienceSegmentIds),
      brand: { tone: TONE_LABELS[tone] },
      constraints: {
        language,
        minWords: wordRange.min,
        maxWords: wordRange.max,
        outputFormat,
        includeCTA: constraintsIncludeCTA,
      },
      sourceContext: {
        strategyGeneratedAt: overview.generatedAt.toISOString(),
        campaignPlanningVersion: campaign.planningMetadata.version,
        sourceIds: [`${sourceType}:${sourceId}`],
      },
    };
  }

  private buildAdapterInstruction(includeSubjectLine: boolean, includePreheader: boolean): string {
    const lines = [BASE_NEWSLETTER_INSTRUCTION, 'Return the content using exactly these delimiters and nothing else:'];
    if (includeSubjectLine) {
      lines.push('[SUBJECT] on its own line, followed by one subject line reflecting the actual source theme — avoid clickbait, fake urgency, or unsupported numbers/results.');
    }
    if (includePreheader) {
      lines.push('[PREHEADER] on its own line, followed by one concise preheader aligned with the subject and body — no fake urgency.');
    }
    lines.push('[BODY] on its own line, followed by the full newsletter body. This section is mandatory.');
    return lines.join(' ');
  }

  // ---------------------------------------------------------------------
  // Options resolution
  // ---------------------------------------------------------------------

  private resolveLength(options: NewsletterGenerationOptions | undefined): NewsletterLength {
    return options?.length ?? DEFAULT_LENGTH;
  }

  private resolveWordRange(length: NewsletterLength): { min: number; max: number } {
    const min = this.getEnvNumber(`NEWSLETTER_GENERATION_${length.toUpperCase()}_MIN_WORDS`, DEFAULT_WORD_RANGE[length].min);
    const maxCandidate = this.getEnvNumber(`NEWSLETTER_GENERATION_${length.toUpperCase()}_MAX_WORDS`, DEFAULT_WORD_RANGE[length].max);
    const hardCap = this.getEnvNumber('NEWSLETTER_GENERATION_MAX_WORDS', DEFAULT_HARD_MAX_WORDS);
    const max = Math.min(maxCandidate, hardCap);
    return { min, max };
  }

  private getMinPillarConfidence(): number {
    return this.getEnvNumber('NEWSLETTER_GENERATION_MIN_PILLAR_CONFIDENCE', DEFAULT_MIN_PILLAR_CONFIDENCE);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  // ---------------------------------------------------------------------
  // Logging — org/product/campaign/source/provider/model/latency/tokens
  // only, never prompts, generated content, evidence text, or API keys.
  // ---------------------------------------------------------------------

  private logOutcome(
    organizationId: string,
    productId: string,
    campaignId: string,
    sourceType: NewsletterSourceType,
    sourceId: string,
    provider: string,
    model: string,
    latencyMs: number,
    usage: { totalTokens?: number } | undefined,
    success: boolean,
  ): void {
    const tokenPart = usage?.totalTokens !== undefined ? ` totalTokens=${usage.totalTokens}` : '';
    this.logger.log(
      `org=${organizationId} product=${productId} campaign=${campaignId} sourceType=${sourceType} sourceId=${sourceId} provider=${provider} model=${model} success=${success} latencyMs=${latencyMs}${tokenPart}`,
    );
  }
}
