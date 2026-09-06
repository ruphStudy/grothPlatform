import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CampaignReviewService } from '../../campaigns/campaign-review.service';
import { CampaignsService } from '../../campaigns/campaigns.service';
import { ContentVersioningService } from '../../content-generation/services/content-versioning.service';
import type { ContentGenerationKind } from '../../content-generation/types/content-generation.types';
import { GrowthStrategyReviewService } from '../../growth-strategy/growth-strategy-review.service';
import { ProductsService } from '../../products/products.service';
import { CreativeEngineService } from '../engine/creative-engine.service';
import { ImagePromptBuilderService, IMAGE_PROMPT_VERSION } from '../prompts/image-prompt-builder.service';
import type { BuildImagePromptInput } from '../prompts/image-prompt.types';
import { CreativeAssetsService } from './creative-assets.service';
import type { CreativeAssetResponse } from '../types/creative-asset.types';

const SOCIAL_KINDS: ContentGenerationKind[] = ['linkedin', 'x', 'facebook', 'instagram'];

const PLATFORM_DEFAULT_ASPECT_RATIO_ENV: Record<string, string> = {
  linkedin: 'CREATIVE_SOCIAL_ASPECT_RATIO_LINKEDIN',
  x: 'CREATIVE_SOCIAL_ASPECT_RATIO_X',
  facebook: 'CREATIVE_SOCIAL_ASPECT_RATIO_FACEBOOK',
  instagram: 'CREATIVE_SOCIAL_ASPECT_RATIO_INSTAGRAM',
};
const PLATFORM_DEFAULT_ASPECT_RATIO_FALLBACK: Record<string, string> = {
  linkedin: '1:1',
  x: '16:9',
  facebook: '1:1',
  instagram: '4:5',
};

const CONCEPTUAL_STYLE_OVERRIDE = 'conceptual, abstract, non-literal visual — do not depict specific data points, numbers, or claims';

export interface GenerateSocialImageOptions {
  aspectRatio?: '1:1' | '4:5' | '16:9';
  styleDirection?: string;
  includeTextOverlay?: boolean;
  overlayText?: string;
}

export interface GenerateSocialImageInput {
  organizationId: string;
  productId: string;
  campaignId: string;
  artifactId: string;
  version: number;
  userId: string;
  options?: GenerateSocialImageOptions;
}

/**
 * 17C: the first real (potentially paid) creative workflow. Resolves an
 * existing, already-approved social ContentVersion server-side, builds a
 * safe structured prompt with 17B, calls the 17A CreativeEngineService
 * exactly once, and persists exactly one new CreativeAsset on success.
 * Never accepts a client-supplied prompt, never mutates the source
 * ContentVersion/ContentArtifact, and never overwrites a prior generation.
 */
@Injectable()
export class SocialImageService {
  private readonly logger = new Logger(SocialImageService.name);

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

  async generate(input: GenerateSocialImageInput): Promise<CreativeAssetResponse> {
    // Tenant-safe load first — throws NotFoundException on any org/product/
    // campaign/artifact/version mismatch, before any approval check or
    // provider call.
    const sourceVersion = await this.versioningService.getVersion(input.organizationId, input.productId, input.campaignId, input.artifactId, input.version);

    if (!SOCIAL_KINDS.includes(sourceVersion.kind)) {
      throw new BadRequestException('Social image generation is only supported for LinkedIn, X, Facebook, or Instagram content.');
    }

    // Same paid-generation gates as 15C-15I / 16H, checked before the
    // (paid) provider call.
    const campaignApproval = await this.campaignReviewService.isCampaignApprovedForCurrentVersion(input.organizationId, input.productId, input.campaignId, input.userId);
    if (!campaignApproval.approved) {
      throw new ConflictException(campaignApproval.reason ?? 'Approve this campaign before generating a social image.');
    }
    const strategyReview = await this.growthStrategyReviewService.getReview(input.organizationId, input.productId, input.userId);
    if (strategyReview.status !== 'approved') {
      throw new ConflictException('Approve the current Growth Strategy before generating a social image.');
    }
    const product = await this.productsService.findOne(input.organizationId, input.productId, input.userId);
    const productUpdatedAt: Date = (product as { updatedAt?: Date }).updatedAt ?? new Date(0);
    const strategyStillApproved = await this.growthStrategyReviewService.isStrategyApprovedForCurrentVersion(input.organizationId, input.productId, input.userId, productUpdatedAt);
    if (!strategyStillApproved) {
      throw new ConflictException('The product has changed since the Growth Strategy was last approved. Review and approve it again before generating a social image.');
    }

    const platform = sourceVersion.kind;
    const aspectRatio = input.options?.aspectRatio ?? this.getPlatformDefaultAspectRatio(platform);

    // Factual-safety gate (item 24): use persisted Grounding/Fact
    // Validation only to steer toward a conceptual, non-claim visual —
    // never to block generation outright.
    const factualRisk = sourceVersion.grounding?.status === 'insufficient_evidence' || sourceVersion.factValidation?.status === 'failed_validation';

    const requestedOverlayText = input.options?.includeTextOverlay ? input.options.overlayText?.trim() : undefined;
    const overlayEnabled = !!requestedOverlayText && !factualRisk;
    const styleDirection = factualRisk
      ? input.options?.styleDirection
        ? `${input.options.styleDirection}; ${CONCEPTUAL_STYLE_OVERRIDE}`
        : CONCEPTUAL_STYLE_OVERRIDE
      : input.options?.styleDirection;

    const evidence = sourceVersion.groundingEvidenceSnapshot;
    const brandSnapshot = sourceVersion.brandVoiceSnapshot;

    const promptInput: BuildImagePromptInput = {
      kind: 'social_image',
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
      content: {
        title: sourceVersion.sourceSnapshot?.title,
        topic: evidence?.topic,
        platform,
      },
      brand:
        (brandSnapshot?.tone && brandSnapshot.tone.length > 0) || (brandSnapshot?.style && brandSnapshot.style.length > 0)
          ? { tone: brandSnapshot?.tone?.join(', '), style: brandSnapshot?.style?.join(', ') }
          : undefined,
      textOverlay: { enabled: overlayEnabled, text: overlayEnabled ? requestedOverlayText : undefined },
      sourceContext: {
        organizationId: input.organizationId,
        productId: input.productId,
        campaignId: input.campaignId,
        contentArtifactId: input.artifactId,
        contentVersionId: sourceVersion.id,
      },
      metadata: { platform, contentVersion: String(sourceVersion.version) },
    };

    const imagePrompt = this.imagePromptBuilder.buildImagePrompt(promptInput);

    const startedAt = Date.now();
    let generation;
    try {
      generation = await this.creativeEngine.generate({
        kind: 'social_image',
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
      this.logOutcome(input, platform, undefined, undefined, aspectRatio, Date.now() - startedAt, false);
      throw err;
    }
    const latencyMs = Date.now() - startedAt;
    this.logOutcome(input, platform, generation.provider, generation.model, aspectRatio, latencyMs, true);

    // Never persist a returned base64 payload — only a hosted URL/storage
    // reference (see CreativeAssetFile schema, which has no base64 field).
    const saved = await this.creativeAssetsService.createGenerated({
      organizationId: input.organizationId,
      productId: input.productId,
      campaignId: input.campaignId,
      kind: 'social_image',
      contentArtifactId: input.artifactId,
      contentVersionId: sourceVersion.id,
      contentVersion: sourceVersion.version,
      contentKind: sourceVersion.kind,
      platform,
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

    return saved;
  }

  async listForSourceVersion(organizationId: string, productId: string, campaignId: string, artifactId: string, version: number): Promise<CreativeAssetResponse[]> {
    // Tenant-safe, no provider call — same cheap read-path convention as
    // 15J's history endpoints.
    const sourceVersion = await this.versioningService.getVersion(organizationId, productId, campaignId, artifactId, version);
    return this.creativeAssetsService.listForSourceVersion(organizationId, productId, campaignId, artifactId, sourceVersion.id);
  }

  private getPlatformDefaultAspectRatio(platform: string): string {
    const envKey = PLATFORM_DEFAULT_ASPECT_RATIO_ENV[platform];
    const fallback = PLATFORM_DEFAULT_ASPECT_RATIO_FALLBACK[platform] ?? '1:1';
    if (!envKey) return fallback;
    return this.configService.get<string>(envKey) ?? fallback;
  }

  // Logs org/product/campaign/artifact/version/platform/provider/model/
  // aspect-ratio/latency/success only — never the prompt, base64, or full
  // social copy.
  private logOutcome(
    input: GenerateSocialImageInput,
    platform: string,
    provider: string | undefined,
    model: string | undefined,
    aspectRatio: string | undefined,
    latencyMs: number,
    success: boolean,
  ): void {
    this.logger.log(
      `org=${input.organizationId} product=${input.productId} campaign=${input.campaignId} artifact=${input.artifactId} version=${input.version} platform=${platform} provider=${provider ?? 'unknown'} model=${model ?? 'unknown'} aspectRatio=${aspectRatio ?? 'unknown'} success=${success} latencyMs=${latencyMs}`,
    );
  }
}
