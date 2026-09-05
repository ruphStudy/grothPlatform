import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CampaignReviewService } from '../../campaigns/campaign-review.service';
import { CampaignsService } from '../../campaigns/campaigns.service';
import type { CampaignResponse } from '../../campaigns/types/campaign.types';
import { BlogCalendarService } from '../../content-planning/blog-calendar.service';
import { ContentIdeaService } from '../../content-planning/content-idea.service';
import { ContentPillarPlanService } from '../../content-planning/content-pillar-plan.service';
import { SocialCalendarService } from '../../content-planning/social-calendar.service';
import { TopicPrioritizationService } from '../../content-planning/topic-prioritization.service';
import { VideoCalendarService } from '../../content-planning/video-calendar.service';
import type { VideoCalendarItem, VideoContentType, VideoFormatDirection } from '../../content-planning/types/video-calendar.types';
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
import type { VideoScriptDraftResult, VideoScriptDuration, VideoScriptGenerationOptions, VideoScriptScene, VideoScriptTone } from '../types/video-script-generation.types';

const DEFAULT_DURATION: VideoScriptDuration = 'medium';
const DEFAULT_OUTPUT_FORMAT: 'markdown' | 'plain_text' = 'markdown';

// GIP product-level planning targets — not a statement about any video
// platform's actual duration limits.
const DEFAULT_DURATION_TARGET_SECONDS: Record<VideoScriptDuration, number> = { short: 45, medium: 120, long: 300 };
const DEFAULT_WORDS_PER_MINUTE = 140;
const DEFAULT_TOLERANCE_PERCENT = 20;

const WORKFLOW_FORMATS: VideoFormatDirection[] = ['demo_direction', 'screen_walkthrough_direction', 'tutorial_direction'];
const WORKFLOW_EVIDENCE_WARNING = 'Detailed product workflow evidence is limited; the script avoids inventing interface steps.';

const TONE_LABELS: Record<VideoScriptTone, string[]> = {
  professional: ['professional', 'clear'],
  conversational: ['conversational', 'approachable'],
  educational: ['educational', 'informative'],
  energetic: ['energetic', 'upbeat'],
  thought_leadership: ['thought-provoking', 'insight-led'],
};

const TYPE_INSTRUCTIONS: Partial<Record<VideoContentType, string>> = {
  educational: 'Write an educational script that teaches the audience about the topic clearly.',
  explainer: 'Write a focused explainer script that clarifies the core concept simply.',
  problem_solution: 'Structure the script around the real pain point and the supported solution — do not overstate the solution.',
  use_case: 'Write a use-case walkthrough script grounded in the supplied use-case evidence.',
  comparison:
    'Write a balanced comparison script using only supported dimensions — do not invent named competitor claims; if no competitor evidence exists, frame this as a conceptual comparison of approaches rather than naming competitors.',
  differentiation: 'Write a differentiation script using only the supplied differentiators — do not upgrade them into unsupported superlatives.',
  buyer_enablement: 'Write a buyer-enablement, evaluation-focused script that helps a buyer assess fit.',
  faq: 'Write a question-and-answer style script.',
  conversion_support: 'Write a conversion-support script that reinforces the supplied evidence.',
  activation: 'Write an activation-focused script using only the supplied upstream evidence.',
  thought_leadership: 'Write a perspective/insight script sharing a point of view grounded in the supplied evidence.',
  blog_repurpose: 'Write a script that adapts the real planned blog topic below into spoken video narration.',
  social_repurpose: 'Write a script that adapts the real planned social topic below into spoken video narration.',
};

const FORMAT_INSTRUCTIONS: Partial<Record<VideoFormatDirection, string>> = {
  short_video: 'Keep the script concise and tightly focused.',
  long_video: 'Structure the script with a deeper, multi-part flow appropriate for a longer video.',
  explainer_video: 'Focus the structure entirely on clearly explaining the one core concept.',
  demo_direction:
    'Write a demo-oriented script using only the known supported capabilities and workflow evidence below — do not invent product screens, UI labels, button names, or steps not evidenced.',
  tutorial_direction: 'Write an instructional, step-oriented script using only the how-to evidence supplied below — do not invent steps.',
  talking_head_direction: 'Write a narration-led script with minimal reliance on visual directions.',
  screen_walkthrough_direction:
    'Write narration paired with cautious, generic visual directions based only on the real product/workflow evidence supplied below — never invent specific UI labels or screen sequences.',
  faq_video: 'Structure the script as a clear question-and-answer sequence.',
  comparison_video: 'Structure the script as a balanced comparison using only supported dimensions.',
};

const BASE_VIDEO_INSTRUCTION = [
  'Create one video script for the supplied video-content direction.',
  'Keep narration natural when spoken aloud, structure it clearly, and stay strictly within the factual evidence provided below.',
  'Do not generate an actual video file, image prompts, camera settings, detailed shot cinematography, avatar configuration, voice settings, an editing timeline, or platform upload instructions — script planning copy only.',
  'Never fabricate customer quotes, ROI numbers, case-study outcomes, or adoption numbers.',
].join(' ');

// Deterministic delimiter readers — "[NAME]" or "NAME:" at the start of a
// line. Not a general NLP parser; only these section names are recognized.
const TOP_MARKER_REGEX = /(?:^|\n)[ \t]*(?:\[(TITLE|HOOK|CTA|SCRIPT|SCENE\s*\d+)\]|(TITLE|HOOK|CTA|SCRIPT|SCENE\s*\d+)\s*:)[ \t]*/gi;
const SUB_MARKER_REGEX = /(?:^|\n)[ \t]*(?:\[(NARRATION|VISUAL)\]|(NARRATION|VISUAL)\s*:)[ \t]*/gi;

interface TopSection {
  name: string;
  sceneNumber?: number;
  body: string;
}

function splitTopSections(text: string): TopSection[] {
  const matches: { index: number; length: number; name: string; sceneNumber?: number }[] = [];
  let match: RegExpExecArray | null;
  TOP_MARKER_REGEX.lastIndex = 0;
  while ((match = TOP_MARKER_REGEX.exec(text)) !== null) {
    const raw = (match[1] ?? match[2]).toUpperCase();
    if (raw.startsWith('SCENE')) {
      const num = Number(raw.replace(/\D/g, ''));
      matches.push({ index: match.index, length: match[0].length, name: 'SCENE', sceneNumber: Number.isFinite(num) ? num : undefined });
    } else {
      matches.push({ index: match.index, length: match[0].length, name: raw });
    }
  }

  const sections: TopSection[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const body = text.slice(start, end).trim();
    if (body.length > 0) sections.push({ name: matches[i].name, sceneNumber: matches[i].sceneNumber, body });
  }
  return sections;
}

function splitSubSections(text: string): { name: string; body: string }[] {
  const matches: { index: number; length: number; name: string }[] = [];
  let match: RegExpExecArray | null;
  SUB_MARKER_REGEX.lastIndex = 0;
  while ((match = SUB_MARKER_REGEX.exec(text)) !== null) {
    matches.push({ index: match.index, length: match[0].length, name: (match[1] ?? match[2]).toUpperCase() });
  }
  const sections: { name: string; body: string }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const body = text.slice(start, end).trim();
    if (body.length > 0) sections.push({ name: matches[i].name, body });
  }
  return sections;
}

export interface ParsedScript {
  hook?: string;
  ctaText?: string;
  scenes?: VideoScriptScene[];
  narrationText: string;
}

// Exported so the 16H improvement flow can parse a revised script with the
// exact same [HOOK]/[SCENE n]/[NARRATION]/[VISUAL]/[CTA] rules used for
// original generation.
export function parseVideoScript(raw: string, includeSceneDirections: boolean): ParsedScript {
  const text = raw.replace(/\r\n/g, '\n');
  const topSections = splitTopSections(text);

  const hook = topSections.find((s) => s.name === 'HOOK')?.body;
  const ctaText = topSections.find((s) => s.name === 'CTA')?.body;

  if (includeSceneDirections) {
    const sceneSections = topSections.filter((s) => s.name === 'SCENE');
    if (sceneSections.length === 0) {
      throw new ContentGenerationValidationError('The generated content did not include any parseable [SCENE] blocks.');
    }
    const scenes: VideoScriptScene[] = sceneSections.map((s, i) => {
      const subs = splitSubSections(s.body);
      if (subs.length === 0) {
        return { order: s.sceneNumber ?? i + 1, narration: s.body, visualDirection: undefined };
      }
      const narration = subs.find((x) => x.name === 'NARRATION')?.body ?? '';
      const visualDirection = subs.find((x) => x.name === 'VISUAL')?.body;
      return { order: s.sceneNumber ?? i + 1, narration, visualDirection };
    });
    const narrationText = scenes.map((s) => s.narration).join('\n\n');
    return { hook, ctaText, scenes, narrationText };
  }

  const scriptSection = topSections.find((s) => s.name === 'SCRIPT');
  return { hook, ctaText, scenes: undefined, narrationText: scriptSection?.body ?? '' };
}

interface ResolvedSource {
  title: string;
  type: VideoContentType;
  angle: string;
  funnelStage: string;
  audienceSegmentIds: string[];
  keywords: string[];
  pillarId?: string;
  pillarTitle?: string;
  topicId?: string;
  topicTitle?: string;
  messagingPillarIds: string[];
  suggestedCTA?: string;
  formatDirection: VideoFormatDirection;
}

/**
 * Video script content-type adapter over the 15A engine / 15B prompt
 * builder. Script planning copy only — no video/media/voiceover/avatar
 * generation belongs here. Rebuilds through 14F (never 14G repurposing,
 * which isn't needed to generate a single item's script).
 */
@Injectable()
export class VideoScriptGenerationService {
  private readonly logger = new Logger(VideoScriptGenerationService.name);

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
    private readonly videoCalendarService: VideoCalendarService,
    private readonly promptBuilder: ContentPromptBuilderService,
    private readonly engine: ContentGenerationEngineService,
    private readonly versioningService: ContentVersioningService,
  ) {}

  async generateVideoScript(
    organizationId: string,
    productId: string,
    campaignId: string,
    videoCalendarItemId: string,
    userId: string,
    options?: VideoScriptGenerationOptions,
  ): Promise<VideoScriptDraftResult> {
    const duration = options?.duration ?? DEFAULT_DURATION;
    const outputFormat = options?.outputFormat ?? DEFAULT_OUTPUT_FORMAT;
    const includeHook = options?.includeHook !== false;
    const includeSceneDirections = options?.includeSceneDirections !== false;
    const tone = options?.tone ?? 'conversational';

    // Cheap campaign-approval check first — this is itself the tenant/
    // product/campaign check, and avoids the expensive Growth Strategy
    // rebuild entirely when the campaign isn't even approved yet.
    const campaignApproval = await this.campaignReviewService.isCampaignApprovedForCurrentVersion(organizationId, productId, campaignId, userId);
    if (!campaignApproval.approved) {
      throw new ConflictException(campaignApproval.reason ?? 'Approve this campaign before generating a video script.');
    }

    const strategyReview = await this.growthStrategyReviewService.getReview(organizationId, productId, userId);
    if (strategyReview.status !== 'approved') {
      throw new ConflictException('Approve the current Growth Strategy before generating a video script.');
    }
    const product = await this.productsService.findOne(organizationId, productId, userId);
    const productUpdatedAt: Date = (product as { updatedAt?: Date }).updatedAt ?? new Date(0);
    const strategyStillApproved = await this.growthStrategyReviewService.isStrategyApprovedForCurrentVersion(organizationId, productId, userId, productUpdatedAt);
    if (!strategyStillApproved) {
      throw new ConflictException('The product has changed since the Growth Strategy was last approved. Review and approve it again before generating a video script.');
    }

    const campaign = await this.campaignsService.findOne(organizationId, productId, campaignId, userId);
    if (!campaign.goal) {
      throw new BadRequestException('Define a campaign goal before generating a video script.');
    }
    if (!campaign.plan) {
      throw new BadRequestException('Generate a 30-day campaign plan before generating a video script.');
    }

    // Single internal orchestration pass — Growth Strategy is built once,
    // and every 14A-14F layer is generated exactly once in memory, never
    // over HTTP and never regenerated a second time. 14G repurposing is
    // not needed here and is deliberately skipped.
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

    const videoCalendarResult = this.videoCalendarService.build({
      ideas: ideaResult,
      topics: topicResult,
      pillars: pillarResult,
      blogCalendar: blogCalendarResult,
      socialCalendar: socialCalendarResult,
      growthStrategy: { messaging: overview.messaging, contentStrategy: overview.contentStrategy, funnel: overview.funnel },
      campaign: campaignInput,
      campaignPlan: campaign.plan,
    });

    const videoItem = videoCalendarResult.items.find((i) => i.id === videoCalendarItemId);
    if (!videoItem) {
      throw new NotFoundException('Video calendar item not found.');
    }

    if (videoItem.type === 'blog_repurpose' && !videoItem.sourceBlogItemId) {
      throw new BadRequestException('This blog-repurpose video item has no linked source blog item.');
    }
    if (videoItem.type === 'social_repurpose' && !videoItem.sourceSocialItemId) {
      throw new BadRequestException('This social-repurpose video item has no linked source social item.');
    }

    const pillar = pillarResult.pillars.find((p) => p.id === videoItem.pillarId);
    const topic = videoItem.topicId ? topicResult.topics.find((t) => t.id === videoItem.topicId) : undefined;
    const sourceBlogItem = videoItem.sourceBlogItemId ? blogCalendarResult.items.find((b) => b.id === videoItem.sourceBlogItemId) : undefined;
    const sourceSocialItem = videoItem.sourceSocialItemId ? socialCalendarResult.items.find((s) => s.id === videoItem.sourceSocialItemId) : undefined;

    const resolvedSource: ResolvedSource = {
      title: videoItem.title,
      type: videoItem.type,
      angle: videoItem.angle,
      funnelStage: videoItem.funnelStage,
      audienceSegmentIds: videoItem.audienceSegmentIds,
      keywords: videoItem.keywords,
      pillarId: videoItem.pillarId,
      pillarTitle: pillar?.title,
      topicId: videoItem.topicId,
      topicTitle: topic?.title,
      messagingPillarIds: videoItem.messagingPillarIds,
      suggestedCTA: videoItem.suggestedCTA,
      formatDirection: videoItem.formatDirection,
    };

    const includeCTA = options?.includeCTA;
    const suggestedCTA = includeCTA === false ? undefined : resolvedSource.suggestedCTA;
    const constraintsIncludeCTA = includeCTA === undefined ? !!resolvedSource.suggestedCTA : includeCTA;

    const evidence = mapEvidenceFromOverview(overview, resolvedSource.audienceSegmentIds);
    const workflowEvidenceWeak = WORKFLOW_FORMATS.includes(resolvedSource.formatDirection) && (evidence.capabilities ?? []).length === 0 && (evidence.useCases ?? []).length === 0;

    const wordsPerMinute = this.getWordsPerMinute();
    const targetSeconds = this.getDurationTargetSeconds(duration);
    const targetWords = Math.round((targetSeconds / 60) * wordsPerMinute);
    const tolerancePercent = this.getTolerancePercent();
    const minWords = Math.round(targetWords * (1 - tolerancePercent / 100));
    const maxWords = Math.round(targetWords * (1 + tolerancePercent / 100));

    const promptInput = this.buildPromptInput(
      product,
      campaign,
      resolvedSource,
      overview,
      tone,
      outputFormat,
      minWords,
      maxWords,
      suggestedCTA,
      constraintsIncludeCTA,
      options?.language,
      videoCalendarItemId,
    );
    const promptBuild = this.promptBuilder.build(promptInput);

    const adapterInstruction = this.buildAdapterInstruction(
      resolvedSource,
      sourceBlogItem,
      sourceSocialItem,
      targetWords,
      targetSeconds,
      includeHook,
      includeSceneDirections,
      constraintsIncludeCTA,
      workflowEvidenceWeak,
    );

    const startedAt = Date.now();
    let generation;
    try {
      generation = await this.engine.generate({
        kind: 'video_script',
        systemPrompt: promptBuild.systemPrompt,
        prompt: `${adapterInstruction}\n\n${promptBuild.prompt}`,
        organizationId,
        productId,
        campaignId,
        sourceContext: promptBuild.sourceContext,
        metadata: { promptVersion: promptBuild.metadata.promptVersion, videoCalendarItemId, type: resolvedSource.type, formatDirection: resolvedSource.formatDirection },
      });
    } catch (err) {
      this.logOutcome(organizationId, productId, campaignId, videoCalendarItemId, resolvedSource.type, resolvedSource.formatDirection, 'unknown', 'unknown', Date.now() - startedAt, undefined, false);
      throw err;
    }
    this.logOutcome(
      organizationId,
      productId,
      campaignId,
      videoCalendarItemId,
      resolvedSource.type,
      resolvedSource.formatDirection,
      generation.provider,
      generation.model,
      Date.now() - startedAt,
      generation.usage,
      true,
    );

    const parsed = parseVideoScript(generation.content, includeSceneDirections);
    if (!parsed.narrationText.trim()) {
      throw new ContentGenerationValidationError('The generated content did not include meaningful narration.');
    }

    const script = parsed.ctaText ? `${parsed.narrationText}\n\n${parsed.ctaText}` : parsed.narrationText;
    const wordCount = parsed.narrationText.trim().length === 0 ? 0 : parsed.narrationText.trim().split(/\s+/).filter((w) => w.length > 0).length;
    const estimatedDurationSeconds = Math.round((wordCount / wordsPerMinute) * 60);

    const warnings = [...promptBuild.warnings];
    if (includeHook && !parsed.hook) warnings.push('Requested hook was not returned by the generator.');
    if (constraintsIncludeCTA && !parsed.ctaText) warnings.push('Requested CTA was not returned by the generator.');
    if (includeSceneDirections && parsed.scenes?.some((s) => !s.visualDirection)) warnings.push('One or more scenes are missing a visual direction.');
    if (workflowEvidenceWeak) warnings.push(WORKFLOW_EVIDENCE_WARNING);
    if (wordCount < minWords) warnings.push('Generated video script is shorter than the requested duration target.');
    if (wordCount > maxWords) warnings.push('Generated video script is longer than the requested duration target.');

    const saved = await this.versioningService.saveGeneratedVersion({
      organizationId,
      productId,
      campaignId,
      kind: 'video_script',
      sourceType: 'video_calendar_item',
      sourceId: videoCalendarItemId,
      payload: {
        title: resolvedSource.title,
        hook: parsed.hook,
        content: script,
        scenes: parsed.scenes,
        format: outputFormat,
        estimatedWordCount: wordCount,
        estimatedDurationSeconds,
      },
      generationMetadata: buildGenerationMetadata(generation, promptBuild.metadata.promptVersion, promptBuild.sourceContext, warnings),
      generationOptions: { language: options?.language, tone, duration, outputFormat, includeCTA: constraintsIncludeCTA, includeHook, includeSceneDirections },
      sourceSnapshot: { title: resolvedSource.title, type: resolvedSource.type, pillarId: resolvedSource.pillarId, topicId: resolvedSource.topicId },
      groundingEvidenceSnapshot: buildGroundingEvidenceSnapshot(promptInput),
      brandVoiceSnapshot: buildBrandVoiceSnapshot(promptInput),
      userId,
    });

    return {
      id: generation.id,
      kind: 'video_script',
      videoCalendarItemId,
      title: resolvedSource.title,
      hook: parsed.hook,
      script,
      scenes: parsed.scenes,
      estimatedWordCount: wordCount,
      estimatedDurationSeconds,
      tone,
      duration,
      format: outputFormat,
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
  // Prompt input mapping — only supported, relevance-filtered evidence
  // ever reaches the prompt; never the raw request body.
  // ---------------------------------------------------------------------

  private buildPromptInput(
    product: { name: string; shortDescription?: string; productType?: string },
    campaign: CampaignResponse,
    source: ResolvedSource,
    overview: GrowthStrategyOverview,
    tone: VideoScriptTone,
    outputFormat: 'markdown' | 'plain_text',
    minWords: number,
    maxWords: number,
    suggestedCTA: string | undefined,
    constraintsIncludeCTA: boolean,
    language: string | undefined,
    videoCalendarItemId: string,
  ): ContentPromptBuildInput {
    return {
      kind: 'video_script',
      product: {
        name: product.name,
        shortDescription: product.shortDescription,
        category: product.productType,
      },
      campaign: {
        name: campaign.name,
        goal: campaign.goal?.title,
        funnelStage: source.funnelStage,
        audienceSegmentIds: source.audienceSegmentIds,
        channelIds: campaign.channelIds,
        conversionDirection: campaign.goal?.description,
      },
      content: {
        title: source.title,
        type: source.type,
        angle: source.angle,
        funnelStage: source.funnelStage,
        audience: source.audienceSegmentIds.map((id) => resolveAudienceLabel(campaign.audienceChannelMapping, id)),
        keywords: source.keywords,
        pillar: source.pillarTitle,
        topic: source.topicTitle,
        messagingDirections: mapMessagingDirectionsFromOverview(overview, source.audienceSegmentIds, source.funnelStage, source.messagingPillarIds),
        suggestedCTA,
        formatDirection: source.formatDirection,
      },
      evidence: mapEvidenceFromOverview(overview, source.audienceSegmentIds),
      brand: { tone: TONE_LABELS[tone] },
      constraints: {
        language,
        minWords,
        maxWords,
        outputFormat,
        includeCTA: constraintsIncludeCTA,
      },
      sourceContext: {
        strategyGeneratedAt: overview.generatedAt.toISOString(),
        campaignPlanningVersion: campaign.planningMetadata.version,
        sourceIds: [videoCalendarItemId],
      },
    };
  }

  private buildAdapterInstruction(
    source: ResolvedSource,
    sourceBlogItem: { title: string } | undefined,
    sourceSocialItem: { title: string } | undefined,
    targetWords: number,
    targetSeconds: number,
    includeHook: boolean,
    includeSceneDirections: boolean,
    expectCTA: boolean,
    workflowEvidenceWeak: boolean,
  ): string {
    const lines = [BASE_VIDEO_INSTRUCTION, `Aim for roughly ${targetWords} words of narration (about ${targetSeconds} seconds at a natural spoken pace).`];

    const typeInstruction = TYPE_INSTRUCTIONS[source.type];
    if (typeInstruction) lines.push(typeInstruction);

    const formatInstruction = FORMAT_INSTRUCTIONS[source.formatDirection];
    if (formatInstruction) lines.push(formatInstruction);

    if (workflowEvidenceWeak) lines.push(`${WORKFLOW_EVIDENCE_WARNING} Stay conceptual.`);

    if (source.type === 'blog_repurpose' && sourceBlogItem) {
      lines.push(`Adapt the real planned blog topic: "${sourceBlogItem.title}".`);
    }
    if (source.type === 'social_repurpose' && sourceSocialItem) {
      lines.push(`Adapt the real planned social topic: "${sourceSocialItem.title}".`);
    }

    lines.push('Return the content using exactly these delimiters and nothing else:');
    lines.push('[TITLE] on its own line, followed by a brief working title — this will be ignored in favor of the already-planned title.');
    if (includeHook) {
      lines.push('[HOOK] on its own line, followed by one concise opening hook grounded in the actual topic — avoid clickbait, unsupported claims, or fake urgency.');
    }
    if (includeSceneDirections) {
      lines.push(
        'One or more [SCENE N] blocks, starting at [SCENE 1], each containing [NARRATION] followed by the spoken narration for that scene, and [VISUAL] followed by one lightweight editorial visual direction — never a shot list, camera setting, or specific UI/button label; if visual evidence is weak, use a generic direction such as "Show a simple visual representing the concept."',
      );
    } else {
      lines.push('[SCRIPT] on its own line, followed by the full narration as continuous text. This section is mandatory.');
    }
    if (expectCTA) {
      lines.push('[CTA] on its own line, followed by the closing call to action.');
    }

    return lines.join(' ');
  }

  // ---------------------------------------------------------------------
  // Config-driven defaults — GIP planning targets, not a statement about
  // any video platform's actual duration limits.
  // ---------------------------------------------------------------------

  private getDurationTargetSeconds(duration: VideoScriptDuration): number {
    const key = duration === 'short' ? 'VIDEO_SCRIPT_SHORT_TARGET_SECONDS' : duration === 'long' ? 'VIDEO_SCRIPT_LONG_TARGET_SECONDS' : 'VIDEO_SCRIPT_MEDIUM_TARGET_SECONDS';
    return this.getEnvNumber(key, DEFAULT_DURATION_TARGET_SECONDS[duration]);
  }

  private getWordsPerMinute(): number {
    return this.getEnvNumber('VIDEO_SCRIPT_WORDS_PER_MINUTE', DEFAULT_WORDS_PER_MINUTE);
  }

  private getTolerancePercent(): number {
    return this.getEnvNumber('VIDEO_SCRIPT_DURATION_TOLERANCE_PERCENT', DEFAULT_TOLERANCE_PERCENT);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  // ---------------------------------------------------------------------
  // Logging — org/product/campaign/item/type/format/provider/model/
  // latency/tokens only, never prompts, generated script, evidence text,
  // or API keys.
  // ---------------------------------------------------------------------

  private logOutcome(
    organizationId: string,
    productId: string,
    campaignId: string,
    videoCalendarItemId: string,
    type: VideoContentType,
    formatDirection: VideoFormatDirection,
    provider: string,
    model: string,
    latencyMs: number,
    usage: { totalTokens?: number } | undefined,
    success: boolean,
  ): void {
    const tokenPart = usage?.totalTokens !== undefined ? ` totalTokens=${usage.totalTokens}` : '';
    this.logger.log(
      `org=${organizationId} product=${productId} campaign=${campaignId} videoCalendarItemId=${videoCalendarItemId} type=${type} formatDirection=${formatDirection} provider=${provider} model=${model} success=${success} latencyMs=${latencyMs}${tokenPart}`,
    );
  }
}
