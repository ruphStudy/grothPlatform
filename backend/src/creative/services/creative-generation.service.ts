import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CampaignReviewService } from '../../campaigns/campaign-review.service';
import { CampaignsService } from '../../campaigns/campaigns.service';
import { ContentVersioningService } from '../../content-generation/services/content-versioning.service';
import type { ContentGenerationKind } from '../../content-generation/types/content-generation.types';
import type { ContentVersionDetail } from '../../content-generation/types/content-versioning.types';
import { GrowthStrategyReviewService } from '../../growth-strategy/growth-strategy-review.service';
import { ProductsService } from '../../products/products.service';
import { CreativeEngineService } from '../engine/creative-engine.service';
import { ImagePromptBuilderService, IMAGE_PROMPT_VERSION } from '../prompts/image-prompt-builder.service';
import type { BuildImagePromptInput, ImagePromptContentContext } from '../prompts/image-prompt.types';
import type { CreativeKind } from '../types/creative.types';
import type { CreativeAssetResponse } from '../types/creative-asset.types';
import { CreativeAssetsService } from './creative-assets.service';

const SOCIAL_CONTENT_KINDS: ContentGenerationKind[] = ['linkedin', 'x', 'facebook', 'instagram'];
const BLOG_HERO_CONTENT_KINDS: ContentGenerationKind[] = ['blog'];
const THUMBNAIL_CONTENT_KINDS: ContentGenerationKind[] = ['blog', 'video_script'];

const SOCIAL_PLATFORM_DEFAULT_ASPECT_RATIO_ENV: Record<string, string> = {
  linkedin: 'CREATIVE_SOCIAL_ASPECT_RATIO_LINKEDIN',
  x: 'CREATIVE_SOCIAL_ASPECT_RATIO_X',
  facebook: 'CREATIVE_SOCIAL_ASPECT_RATIO_FACEBOOK',
  instagram: 'CREATIVE_SOCIAL_ASPECT_RATIO_INSTAGRAM',
};
const SOCIAL_PLATFORM_DEFAULT_ASPECT_RATIO_FALLBACK: Record<string, string> = {
  linkedin: '1:1',
  x: '16:9',
  facebook: '1:1',
  instagram: '4:5',
};

const DEFAULT_BLOG_HERO_ASPECT_RATIO = '16:9';
const DEFAULT_THUMBNAIL_ASPECT_RATIO = '16:9';
const THUMBNAIL_OVERLAY_MAX_CHARS = 50;

const CONCEPTUAL_STYLE_OVERRIDE = 'conceptual, abstract, non-literal visual — do not depict specific data points, numbers, or claims';

const BLOG_HERO_STYLE_HINT =
  'wide editorial hero image for a blog article header; strong single focal point; clean, uncluttered composition with useful negative space; must remain effective even without any text overlay';
const THUMBNAIL_STYLE_HINT =
  'compact, high-contrast attention thumbnail; one dominant focal idea; simple composition that stays legible at small size; clear subject separation from background; avoid tiny visual details';

export interface GenerateCreativeImageOptions {
  aspectRatio?: string;
  styleDirection?: string;
  includeTextOverlay?: boolean;
  overlayText?: string;
}

export interface GenerateCreativeImageInput {
  organizationId: string;
  productId: string;
  campaignId: string;
  artifactId: string;
  version: number;
  userId: string;
  options?: GenerateCreativeImageOptions;
}

interface FeatureConfig {
  creativeKind: CreativeKind;
  eligibleContentKinds: ContentGenerationKind[];
  ineligibleMessage: string;
  approvalActionLabel: string;
  overlayMaxChars?: number;
  resolveDefaultAspectRatio: (contentKind: ContentGenerationKind, configService: ConfigService) => string;
  styleHint: (contentKind: ContentGenerationKind) => string;
}

const FEATURE_CONFIG: Record<'social_image' | 'blog_hero' | 'thumbnail', FeatureConfig> = {
  social_image: {
    creativeKind: 'social_image',
    eligibleContentKinds: SOCIAL_CONTENT_KINDS,
    ineligibleMessage: 'Social image generation is only supported for LinkedIn, X, Facebook, or Instagram content.',
    approvalActionLabel: 'generating a social image',
    resolveDefaultAspectRatio: (contentKind, configService) => {
      const envKey = SOCIAL_PLATFORM_DEFAULT_ASPECT_RATIO_ENV[contentKind];
      const fallback = SOCIAL_PLATFORM_DEFAULT_ASPECT_RATIO_FALLBACK[contentKind] ?? '1:1';
      return (envKey && configService.get<string>(envKey)) || fallback;
    },
    styleHint: () => '',
  },
  blog_hero: {
    creativeKind: 'blog_hero',
    eligibleContentKinds: BLOG_HERO_CONTENT_KINDS,
    ineligibleMessage: 'Blog hero generation is only supported for blog content.',
    approvalActionLabel: 'generating a blog hero image',
    resolveDefaultAspectRatio: (_contentKind, configService) => configService.get<string>('CREATIVE_BLOG_HERO_ASPECT_RATIO') ?? DEFAULT_BLOG_HERO_ASPECT_RATIO,
    styleHint: () => BLOG_HERO_STYLE_HINT,
  },
  thumbnail: {
    creativeKind: 'thumbnail',
    eligibleContentKinds: THUMBNAIL_CONTENT_KINDS,
    ineligibleMessage: 'Thumbnail generation is only supported for blog or video script content.',
    approvalActionLabel: 'generating a thumbnail',
    overlayMaxChars: THUMBNAIL_OVERLAY_MAX_CHARS,
    resolveDefaultAspectRatio: (_contentKind, configService) => configService.get<string>('CREATIVE_THUMBNAIL_ASPECT_RATIO') ?? DEFAULT_THUMBNAIL_ASPECT_RATIO,
    styleHint: () => THUMBNAIL_STYLE_HINT,
  },
};

/**
 * Shared creative-generation workflow (17C social image, 17D blog hero, 17E
 * thumbnail): resolve a persisted ContentVersion server-side, apply the
 * same paid-generation approval gate as 15C-15I/16H, build a safe prompt
 * with 17B, call the 17A CreativeEngineService exactly once, and persist
 * exactly one new CreativeAsset on success. Never accepts a client-supplied
 * prompt, never mutates the source ContentVersion/ContentArtifact, and
 * never overwrites a prior generation — each explicit action creates a new
 * CreativeAsset. Feature differences (eligible content kinds, default
 * aspect ratio, visual-direction hint, overlay cap) are the only thing that
 * varies per public method below; the generation/persistence core is
 * shared in one place.
 */
@Injectable()
export class CreativeGenerationService {
  private readonly logger = new Logger(CreativeGenerationService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly campaignsService: CampaignsService,
    private readonly campaignReviewService: CampaignReviewService,
    private readonly growthStrategyReviewService: GrowthStrategyReviewService,
    private readonly productsService: ProductsService,
    private readonly versioningService: ContentVersioningService,
    private readonly imagePromptBuilder: ImagePromptBuilderService,
    private readonly creativeEngine: CreativeEngineService,
    private readonly creativeAssetsService: CreativeAssetsService,
  ) {}

  async generateSocialImage(input: GenerateCreativeImageInput): Promise<CreativeAssetResponse> {
    return this.generate(FEATURE_CONFIG.social_image, input);
  }

  async generateBlogHero(input: GenerateCreativeImageInput): Promise<CreativeAssetResponse> {
    return this.generate(FEATURE_CONFIG.blog_hero, input);
  }

  async generateThumbnail(input: GenerateCreativeImageInput): Promise<CreativeAssetResponse> {
    return this.generate(FEATURE_CONFIG.thumbnail, input);
  }

  async listSocialImages(organizationId: string, productId: string, campaignId: string, artifactId: string, version: number): Promise<CreativeAssetResponse[]> {
    return this.list('social_image', organizationId, productId, campaignId, artifactId, version);
  }

  async listBlogHeroes(organizationId: string, productId: string, campaignId: string, artifactId: string, version: number): Promise<CreativeAssetResponse[]> {
    return this.list('blog_hero', organizationId, productId, campaignId, artifactId, version);
  }

  async listThumbnails(organizationId: string, productId: string, campaignId: string, artifactId: string, version: number): Promise<CreativeAssetResponse[]> {
    return this.list('thumbnail', organizationId, productId, campaignId, artifactId, version);
  }

  // ---------------------------------------------------------------------
  // Shared core
  // ---------------------------------------------------------------------

  private async generate(config: FeatureConfig, input: GenerateCreativeImageInput): Promise<CreativeAssetResponse> {
    // Tenant-safe load first — throws NotFoundException on any org/product/
    // campaign/artifact/version mismatch, before any approval check or
    // provider call.
    const sourceVersion = await this.versioningService.getVersion(input.organizationId, input.productId, input.campaignId, input.artifactId, input.version);

    if (!config.eligibleContentKinds.includes(sourceVersion.kind)) {
      throw new BadRequestException(config.ineligibleMessage);
    }

    await this.assertPaidGenerationApproved(input, config.approvalActionLabel);

    const aspectRatio = input.options?.aspectRatio ?? config.resolveDefaultAspectRatio(sourceVersion.kind, this.configService);

    // Factual-safety gate: use persisted Grounding/Fact Validation only to
    // steer toward a conceptual, non-claim visual — never to block
    // generation outright (17C item 24, reused unchanged for 17D/17E).
    const factualRisk = sourceVersion.grounding?.status === 'insufficient_evidence' || sourceVersion.factValidation?.status === 'failed_validation';

    const requestedOverlayText = input.options?.includeTextOverlay ? input.options.overlayText?.trim() : undefined;
    const overlayEnabled = !!requestedOverlayText && !factualRisk;

    const featureHint = config.styleHint(sourceVersion.kind);
    const baseStyleDirection = [input.options?.styleDirection, featureHint].filter(Boolean).join('; ') || undefined;
    const styleDirection = factualRisk ? [baseStyleDirection, CONCEPTUAL_STYLE_OVERRIDE].filter(Boolean).join('; ') : baseStyleDirection;

    const evidence = sourceVersion.groundingEvidenceSnapshot;
    const brandSnapshot = sourceVersion.brandVoiceSnapshot;

    const promptInput: BuildImagePromptInput = {
      kind: config.creativeKind,
      aspectRatio,
      styleDirection,
      product: evidence?.productName
        ? {
            name: evidence.productName,
            category: evidence.productCategory,
            shortDescription: evidence.productDescription,
            valueProposition: evidence.valueProposition,
          }
        : undefined,
      campaign: {
        objective: evidence?.campaignGoal,
        funnelStage: evidence?.funnelStage,
        ctaDirection: evidence?.suggestedCTA,
      },
      content: this.buildContentContext(config.creativeKind, sourceVersion, evidence?.topic),
      brand:
        (brandSnapshot?.tone && brandSnapshot.tone.length > 0) || (brandSnapshot?.style && brandSnapshot.style.length > 0)
          ? { tone: brandSnapshot?.tone?.join(', '), style: brandSnapshot?.style?.join(', ') }
          : undefined,
      textOverlay: { enabled: overlayEnabled, text: overlayEnabled ? requestedOverlayText : undefined, maxChars: config.overlayMaxChars },
      sourceContext: {
        organizationId: input.organizationId,
        productId: input.productId,
        campaignId: input.campaignId,
        contentArtifactId: input.artifactId,
        contentVersionId: sourceVersion.id,
      },
      metadata: { sourceContentKind: sourceVersion.kind, contentVersion: String(sourceVersion.version) },
    };

    const imagePrompt = this.imagePromptBuilder.buildImagePrompt(promptInput);

    const startedAt = Date.now();
    let generation;
    try {
      generation = await this.creativeEngine.generate({
        kind: config.creativeKind,
        prompt: imagePrompt.prompt,
        negativePrompt: imagePrompt.negativePrompt,
        aspectRatio: imagePrompt.aspectRatio,
        quality: 'standard',
        organizationId: input.organizationId,
        productId: input.productId,
        campaignId: input.campaignId,
        sourceContext: imagePrompt.sourceContext,
        metadata: imagePrompt.metadata,
      });
    } catch (err) {
      this.logOutcome(config.creativeKind, input, sourceVersion.kind, undefined, undefined, aspectRatio, Date.now() - startedAt, false);
      throw err;
    }
    const latencyMs = Date.now() - startedAt;
    this.logOutcome(config.creativeKind, input, sourceVersion.kind, generation.provider, generation.model, aspectRatio, latencyMs, true);

    // Never persist a returned base64 payload — only a hosted URL/storage
    // reference (see CreativeAssetFile schema, which has no base64 field).
    return this.creativeAssetsService.createGenerated({
      organizationId: input.organizationId,
      productId: input.productId,
      campaignId: input.campaignId,
      kind: config.creativeKind,
      contentArtifactId: input.artifactId,
      contentVersionId: sourceVersion.id,
      contentVersion: sourceVersion.version,
      contentKind: sourceVersion.kind,
      platform: sourceVersion.kind,
      provider: generation.provider,
      model: generation.model,
      asset: {
        type: 'image',
        url: generation.asset.url,
        mimeType: generation.asset.mimeType,
        width: generation.asset.width,
        height: generation.asset.height,
      },
      promptSnapshot: {
        promptVersion: IMAGE_PROMPT_VERSION,
        aspectRatio: imagePrompt.aspectRatio,
        styleDirection: imagePrompt.styleDirection,
        textOverlayEnabled: !!imagePrompt.textOverlay?.enabled,
      },
      usage: generation.usage,
      cost: generation.cost,
      userId: input.userId,
    });
  }

  private async list(kind: CreativeKind, organizationId: string, productId: string, campaignId: string, artifactId: string, version: number): Promise<CreativeAssetResponse[]> {
    // Tenant-safe, no provider call — same cheap read-path convention as
    // 15J's history endpoints.
    const sourceVersion = await this.versioningService.getVersion(organizationId, productId, campaignId, artifactId, version);
    return this.creativeAssetsService.listForSourceVersion(organizationId, productId, campaignId, kind, artifactId, sourceVersion.id);
  }

  private async assertPaidGenerationApproved(input: GenerateCreativeImageInput, actionLabel: string): Promise<void> {
    // Same paid-generation gates as 15C-15I / 16H, checked before the
    // (paid) provider call.
    const campaignApproval = await this.campaignReviewService.isCampaignApprovedForCurrentVersion(input.organizationId, input.productId, input.campaignId, input.userId);
    if (!campaignApproval.approved) {
      throw new ConflictException(campaignApproval.reason ?? `Approve this campaign before ${actionLabel}.`);
    }
    const strategyReview = await this.growthStrategyReviewService.getReview(input.organizationId, input.productId, input.userId);
    if (strategyReview.status !== 'approved') {
      throw new ConflictException(`Approve the current Growth Strategy before ${actionLabel}.`);
    }
    const product = await this.productsService.findOne(input.organizationId, input.productId, input.userId);
    const productUpdatedAt: Date = (product as { updatedAt?: Date }).updatedAt ?? new Date(0);
    const strategyStillApproved = await this.growthStrategyReviewService.isStrategyApprovedForCurrentVersion(input.organizationId, input.productId, input.userId, productUpdatedAt);
    if (!strategyStillApproved) {
      throw new ConflictException(`The product has changed since the Growth Strategy was last approved. Review and approve it again before ${actionLabel}.`);
    }
  }

  // Content-context mapping differs per creative kind/content kind: social
  // images key off the planning item's title (sourceSnapshot); blog
  // hero/thumbnail prefer the actual generated blog title (payload.title);
  // a video script thumbnail also includes its hook — never a fabricated
  // presenter identity, just the opening concept.
  private buildContentContext(creativeKind: CreativeKind, sourceVersion: ContentVersionDetail, topic: string | undefined): ImagePromptContentContext {
    if (creativeKind === 'social_image') {
      return { title: sourceVersion.sourceSnapshot?.title, topic, platform: sourceVersion.kind };
    }
    if (sourceVersion.kind === 'video_script') {
      return { title: sourceVersion.payload.title ?? sourceVersion.sourceSnapshot?.title, topic, hook: sourceVersion.payload.hook };
    }
    // blog
    return { title: sourceVersion.payload.title ?? sourceVersion.sourceSnapshot?.title, topic };
  }

  // Logs org/product/campaign/artifact/version/source-kind/provider/model/
  // aspect-ratio/latency/success only — never the prompt, base64, or
  // source content body.
  private logOutcome(
    creativeKind: CreativeKind,
    input: GenerateCreativeImageInput,
    sourceContentKind: string,
    provider: string | undefined,
    model: string | undefined,
    aspectRatio: string | undefined,
    latencyMs: number,
    success: boolean,
  ): void {
    this.logger.log(
      `kind=${creativeKind} org=${input.organizationId} product=${input.productId} campaign=${input.campaignId} artifact=${input.artifactId} version=${input.version} sourceKind=${sourceContentKind} provider=${provider ?? 'unknown'} model=${model ?? 'unknown'} aspectRatio=${aspectRatio ?? 'unknown'} success=${success} latencyMs=${latencyMs}`,
    );
  }
}
