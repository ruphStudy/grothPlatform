import { Controller, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CampaignsService } from '../campaigns/campaigns.service';
import { ContentGroundingService } from './services/content-grounding.service';
import { ContentVersioningService } from './services/content-versioning.service';
import { extractGroundableText } from './shared/content-grounding-text.util';

// Read-only history/hydration endpoints. Tenant safety is the cheap
// Campaign/Product ownership check already used everywhere else in this
// module — reading history never rebuilds Growth Strategy or touches
// approval/staleness gates, since those only matter for triggering a new
// paid generation, not for viewing what was already generated.
@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/campaigns/:campaignId/content-generation')
export class ContentArtifactsController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly versioningService: ContentVersioningService,
    private readonly groundingService: ContentGroundingService,
  ) {}

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
    return this.groundingService.analyzeContentVersion({
      contentVersionId: versionDetail.id,
      artifactId: versionDetail.artifactId,
      organizationId,
      productId,
      campaignId,
      text: extractGroundableText(versionDetail.payload),
      evidence: versionDetail.groundingEvidenceSnapshot,
    });
  }
}
