import { Body, Controller, Get, Logger, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CampaignsService } from '../campaigns/campaigns.service';
import { ContentImprovementOptionsDto } from './dto/content-improvement-options.dto';
import { ContentBrandVoiceService } from './services/content-brand-voice.service';
import { ContentFactValidationService } from './services/content-fact-validation.service';
import { ContentGroundingService } from './services/content-grounding.service';
import { ContentImprovementService } from './services/content-improvement.service';
import { ContentOriginalityService } from './services/content-originality.service';
import { ContentQualityService } from './services/content-quality.service';
import { ContentReadabilityService } from './services/content-readability.service';
import { ContentSeoReviewService } from './services/content-seo-review.service';
import { ContentVersioningService } from './services/content-versioning.service';
import { extractGroundableText } from './shared/content-grounding-text.util';
import type { ContentVersionDetail } from './types/content-versioning.types';

// Read-only history/hydration endpoints. Tenant safety is the cheap
// Campaign/Product ownership check already used everywhere else in this
// module — reading history never rebuilds Growth Strategy or touches
// approval/staleness gates, since those only matter for triggering a new
// paid generation, not for viewing what was already generated.
@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/campaigns/:campaignId/content-generation')
export class ContentArtifactsController {
  private readonly logger = new Logger(ContentArtifactsController.name);

  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly versioningService: ContentVersioningService,
    private readonly groundingService: ContentGroundingService,
    private readonly factValidationService: ContentFactValidationService,
    private readonly seoReviewService: ContentSeoReviewService,
    private readonly readabilityService: ContentReadabilityService,
    private readonly brandVoiceService: ContentBrandVoiceService,
    private readonly originalityService: ContentOriginalityService,
    private readonly qualityService: ContentQualityService,
    private readonly improvementService: ContentImprovementService,
  ) {}

  // Keeps Quality (16G) synchronized after any 16A-16F manual recheck (spec
  // section 20), without ever rerunning the underlying reviews themselves.
  // Best-effort: a quality recalculation failure must never fail the
  // recheck response that triggered it.
  private async recalculateQualityQuietly(versionDetail: ContentVersionDetail, organizationId: string, productId: string, campaignId: string): Promise<void> {
    try {
      await this.qualityService.calculateForVersion({
        contentVersionId: versionDetail.id,
        artifactId: versionDetail.artifactId,
        organizationId,
        productId,
        campaignId,
      });
    } catch (err) {
      this.logger.warn(`contentVersionId=${versionDetail.id} kind=quality success=false reason=${(err as Error).message}. Content quality score could not be calculated.`);
    }
  }

  @Get('artifacts')
  async listArtifacts(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Query('kind') kind?: string,
    @Query('sourceType') sourceType?: string,
    @Query('sourceId') sourceId?: string,
  ) {
    await this.campaignsService.findOne(organizationId, productId, campaignId, req.user.userId);
    return this.versioningService.listLatestForCampaign(organizationId, productId, campaignId, { kind, sourceType, sourceId });
  }

  @Get('latest')
  async getLatest(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Query('kind') kind: string,
    @Query('sourceType') sourceType: string,
    @Query('sourceId') sourceId: string,
  ) {
    await this.campaignsService.findOne(organizationId, productId, campaignId, req.user.userId);
    return this.versioningService.getLatestByCriteria(organizationId, productId, campaignId, kind as never, sourceType, sourceId);
  }

  @Get('artifacts/:artifactId')
  async getArtifact(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('artifactId') artifactId: string,
  ) {
    await this.campaignsService.findOne(organizationId, productId, campaignId, req.user.userId);
    const artifact = await this.versioningService.getArtifactById(organizationId, productId, campaignId, artifactId);
    return { id: artifact._id.toString(), kind: artifact.kind, sourceType: artifact.sourceType, sourceId: artifact.sourceId, latestVersion: artifact.latestVersion, latestVersionId: artifact.latestVersionId?.toString() };
  }

  @Get('artifacts/:artifactId/versions')
  async listVersions(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('artifactId') artifactId: string,
    @Query('limit') limit?: string,
    @Query('beforeVersion') beforeVersion?: string,
  ) {
    await this.campaignsService.findOne(organizationId, productId, campaignId, req.user.userId);
    return this.versioningService.listVersions(organizationId, productId, campaignId, artifactId, {
      limit: limit ? Number(limit) : undefined,
      beforeVersion: beforeVersion ? Number(beforeVersion) : undefined,
    });
  }

  @Get('artifacts/:artifactId/versions/:version')
  async getVersion(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('artifactId') artifactId: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    const campaign = await this.campaignsService.findOne(organizationId, productId, campaignId, req.user.userId);
    const versionDetail = await this.versioningService.getVersion(organizationId, productId, campaignId, artifactId, version);
    const isCurrentPlanningVersion = versionDetail.generationMetadata.sourceContext?.campaignPlanningVersion === campaign.planningMetadata.version;
    return { ...versionDetail, isCurrentPlanningVersion };
  }

  // Read-only: never rebuilds Growth Strategy. Returns null (not 404) when
  // no grounding result exists yet for an otherwise-valid version.
  @Get('artifacts/:artifactId/versions/:version/grounding')
  async getGrounding(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('artifactId') artifactId: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    await this.campaignsService.findOne(organizationId, productId, campaignId, req.user.userId);
    const versionDetail = await this.versioningService.getVersion(organizationId, productId, campaignId, artifactId, version);
    return this.groundingService.getResult(versionDetail.id);
  }

  // Manual recheck: recomputes against this version's own persisted
  // groundingEvidenceSnapshot — never rebuilds Growth Strategy. No
  // confirmation required since this never calls a paid API.
  @Post('artifacts/:artifactId/versions/:version/grounding')
  async recheckGrounding(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('artifactId') artifactId: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    await this.campaignsService.findOne(organizationId, productId, campaignId, req.user.userId);
    const versionDetail = await this.versioningService.getVersion(organizationId, productId, campaignId, artifactId, version);
    const result = await this.groundingService.analyzeContentVersion({
      contentVersionId: versionDetail.id,
      artifactId: versionDetail.artifactId,
      organizationId,
      productId,
      campaignId,
      text: extractGroundableText(versionDetail.payload),
      evidence: versionDetail.groundingEvidenceSnapshot,
    });
    await this.recalculateQualityQuietly(versionDetail, organizationId, productId, campaignId);
    return result;
  }

  // Read-only: never rebuilds Growth Strategy. Returns null (not 404) when
  // no fact-validation result exists yet for an otherwise-valid version.
  @Get('artifacts/:artifactId/versions/:version/fact-validation')
  async getFactValidation(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('artifactId') artifactId: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    await this.campaignsService.findOne(organizationId, productId, campaignId, req.user.userId);
    const versionDetail = await this.versioningService.getVersion(organizationId, productId, campaignId, artifactId, version);
    return this.factValidationService.getResult(versionDetail.id);
  }

  // Manual recheck: recomputes against this version's own persisted
  // groundingEvidenceSnapshot — never rebuilds Growth Strategy. No
  // confirmation required since this never calls a paid API.
  @Post('artifacts/:artifactId/versions/:version/fact-validation')
  async recheckFactValidation(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('artifactId') artifactId: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    await this.campaignsService.findOne(organizationId, productId, campaignId, req.user.userId);
    const versionDetail = await this.versioningService.getVersion(organizationId, productId, campaignId, artifactId, version);
    const result = await this.factValidationService.validateContentVersion({
      contentVersionId: versionDetail.id,
      artifactId: versionDetail.artifactId,
      organizationId,
      productId,
      campaignId,
      text: extractGroundableText(versionDetail.payload),
      evidence: versionDetail.groundingEvidenceSnapshot,
    });
    await this.recalculateQualityQuietly(versionDetail, organizationId, productId, campaignId);
    return result;
  }

  // Read-only: never rebuilds Growth Strategy. Returns null (not 404) when
  // no SEO review result exists yet for an otherwise-valid version.
  @Get('artifacts/:artifactId/versions/:version/seo-review')
  async getSeoReview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('artifactId') artifactId: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    await this.campaignsService.findOne(organizationId, productId, campaignId, req.user.userId);
    const versionDetail = await this.versioningService.getVersion(organizationId, productId, campaignId, artifactId, version);
    return this.seoReviewService.getResult(versionDetail.id);
  }

  // Manual recheck: recomputes against this version's own persisted
  // groundingEvidenceSnapshot — never rebuilds Growth Strategy. No
  // confirmation required since this never calls a paid API.
  @Post('artifacts/:artifactId/versions/:version/seo-review')
  async recheckSeoReview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('artifactId') artifactId: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    await this.campaignsService.findOne(organizationId, productId, campaignId, req.user.userId);
    const versionDetail = await this.versioningService.getVersion(organizationId, productId, campaignId, artifactId, version);
    const result = await this.seoReviewService.reviewContentVersion({
      contentVersionId: versionDetail.id,
      artifactId: versionDetail.artifactId,
      organizationId,
      productId,
      campaignId,
      kind: versionDetail.kind,
      payload: versionDetail.payload,
      text: extractGroundableText(versionDetail.payload),
      evidence: versionDetail.groundingEvidenceSnapshot,
      generationOptions: versionDetail.generationOptions,
    });
    await this.recalculateQualityQuietly(versionDetail, organizationId, productId, campaignId);
    return result;
  }

  // Read-only: never rebuilds Growth Strategy. Returns null (not 404) when
  // no readability result exists yet for an otherwise-valid version.
  @Get('artifacts/:artifactId/versions/:version/readability')
  async getReadability(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('artifactId') artifactId: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    await this.campaignsService.findOne(organizationId, productId, campaignId, req.user.userId);
    const versionDetail = await this.versioningService.getVersion(organizationId, productId, campaignId, artifactId, version);
    return this.readabilityService.getResult(versionDetail.id);
  }

  // Manual recheck: recomputes against this version's own persisted payload
  // — never rebuilds Growth Strategy. No confirmation required since this
  // never calls a paid API.
  @Post('artifacts/:artifactId/versions/:version/readability')
  async recheckReadability(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('artifactId') artifactId: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    await this.campaignsService.findOne(organizationId, productId, campaignId, req.user.userId);
    const versionDetail = await this.versioningService.getVersion(organizationId, productId, campaignId, artifactId, version);
    const result = await this.readabilityService.reviewContentVersion({
      contentVersionId: versionDetail.id,
      artifactId: versionDetail.artifactId,
      organizationId,
      productId,
      campaignId,
      kind: versionDetail.kind,
      payload: versionDetail.payload,
      text: this.readabilityService.extractReadableText(versionDetail.kind, versionDetail.payload),
    });
    await this.recalculateQualityQuietly(versionDetail, organizationId, productId, campaignId);
    return result;
  }

  // Read-only: never rebuilds Growth Strategy. Returns null (not 404) when
  // no brand voice result exists yet for an otherwise-valid version.
  @Get('artifacts/:artifactId/versions/:version/brand-voice')
  async getBrandVoice(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('artifactId') artifactId: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    await this.campaignsService.findOne(organizationId, productId, campaignId, req.user.userId);
    const versionDetail = await this.versioningService.getVersion(organizationId, productId, campaignId, artifactId, version);
    return this.brandVoiceService.getResult(versionDetail.id);
  }

  // Manual recheck: recomputes against this version's own persisted
  // brandVoiceSnapshot — never rebuilds Growth Strategy. No confirmation
  // required since this never calls a paid API.
  @Post('artifacts/:artifactId/versions/:version/brand-voice')
  async recheckBrandVoice(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('artifactId') artifactId: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    await this.campaignsService.findOne(organizationId, productId, campaignId, req.user.userId);
    const versionDetail = await this.versioningService.getVersion(organizationId, productId, campaignId, artifactId, version);
    const result = await this.brandVoiceService.reviewContentVersion({
      contentVersionId: versionDetail.id,
      artifactId: versionDetail.artifactId,
      organizationId,
      productId,
      campaignId,
      kind: versionDetail.kind,
      payload: versionDetail.payload,
      text: extractGroundableText(versionDetail.payload),
      brandVoiceSnapshot: versionDetail.brandVoiceSnapshot,
      generationOptions: versionDetail.generationOptions,
    });
    await this.recalculateQualityQuietly(versionDetail, organizationId, productId, campaignId);
    return result;
  }

  // Read-only: never rebuilds Growth Strategy. Returns null (not 404) when
  // no originality result exists yet for an otherwise-valid version.
  @Get('artifacts/:artifactId/versions/:version/originality')
  async getOriginality(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('artifactId') artifactId: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    await this.campaignsService.findOne(organizationId, productId, campaignId, req.user.userId);
    const versionDetail = await this.versioningService.getVersion(organizationId, productId, campaignId, artifactId, version);
    return this.originalityService.getResult(versionDetail.id);
  }

  // Manual recheck: recomputes against other generated content already
  // stored in GIP (own artifact history + same-campaign/product artifacts)
  // — never rebuilds Growth Strategy, never calls an external plagiarism
  // service. No confirmation required since this never calls a paid API.
  @Post('artifacts/:artifactId/versions/:version/originality')
  async recheckOriginality(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('artifactId') artifactId: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    await this.campaignsService.findOne(organizationId, productId, campaignId, req.user.userId);
    const versionDetail = await this.versioningService.getVersion(organizationId, productId, campaignId, artifactId, version);
    const result = await this.originalityService.reviewContentVersion({
      contentVersionId: versionDetail.id,
      artifactId: versionDetail.artifactId,
      organizationId,
      productId,
      campaignId,
      kind: versionDetail.kind,
      sourceType: versionDetail.sourceType,
      sourceId: versionDetail.sourceId,
      payload: versionDetail.payload,
      text: extractGroundableText(versionDetail.payload),
    });
    await this.recalculateQualityQuietly(versionDetail, organizationId, productId, campaignId);
    return result;
  }

  // Read-only: never rebuilds Growth Strategy. Returns null (not 404) when
  // no quality result exists yet for an otherwise-valid version.
  @Get('artifacts/:artifactId/versions/:version/quality')
  async getQuality(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('artifactId') artifactId: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    await this.campaignsService.findOne(organizationId, productId, campaignId, req.user.userId);
    const versionDetail = await this.versioningService.getVersion(organizationId, productId, campaignId, artifactId, version);
    return this.qualityService.getResult(versionDetail.id);
  }

  // Manual recalculation: reads the latest persisted 16A-16F results for
  // this version and re-aggregates them — never reruns any underlying
  // review, never rebuilds Growth Strategy. No confirmation required since
  // this never calls a paid API.
  @Post('artifacts/:artifactId/versions/:version/quality')
  async recalculateQuality(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('artifactId') artifactId: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    await this.campaignsService.findOne(organizationId, productId, campaignId, req.user.userId);
    const versionDetail = await this.versioningService.getVersion(organizationId, productId, campaignId, artifactId, version);
    return this.qualityService.calculateForVersion({
      contentVersionId: versionDetail.id,
      artifactId: versionDetail.artifactId,
      organizationId,
      productId,
      campaignId,
    });
  }

  // Sprint 16H: exactly one explicit, user-triggered, paid AI call. Never
  // auto-triggered. All tenant/approval/staleness gates and the tenant-safe
  // version load happen inside the service, before the AI call.
  @Post('artifacts/:artifactId/versions/:version/improve')
  async improveVersion(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('artifactId') artifactId: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() body: ContentImprovementOptionsDto,
  ) {
    return this.improvementService.improveVersion({
      organizationId,
      productId,
      campaignId,
      artifactId,
      version,
      userId: req.user.userId,
      focus: body.focus,
      language: body.language,
    });
  }
}
