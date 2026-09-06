import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CampaignsService } from '../campaigns/campaigns.service';
import { BlogHeroGenerationOptionsDto } from './dto/blog-hero-generation-options.dto';
import { SocialImageGenerationOptionsDto } from './dto/social-image-generation-options.dto';
import { ThumbnailGenerationOptionsDto } from './dto/thumbnail-generation-options.dto';
import { UpdateCreativeAssetReviewDto } from './dto/update-creative-asset-review.dto';
import { CreativeAssetsService } from './services/creative-assets.service';
import { CreativeGenerationService } from './services/creative-generation.service';
import type { CreativeKind } from './types/creative.types';

// Tenant safety for every GET route is the same cheap Campaign ownership
// check used by 15J's read endpoints (content-artifacts.controller.ts) —
// never rebuilds Growth Strategy, never calls the provider. Every POST
// route delegates its own (paid-action) gating to CreativeGenerationService.
@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/campaigns/:campaignId/creative')
export class CreativeController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly creativeGenerationService: CreativeGenerationService,
    private readonly creativeAssetsService: CreativeAssetsService,
  ) {}

  // 17G: consolidated creative review list across every kind
  // (social_image/blog_hero/thumbnail). Read-only, no provider call.
  @Get('assets')
  async listAssets(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Query('kind') kind?: string,
    @Query('contentArtifactId') contentArtifactId?: string,
    @Query('contentVersionId') contentVersionId?: string,
    @Query('platform') platform?: string,
    @Query('limit') limit?: string,
  ) {
    await this.campaignsService.findOne(organizationId, productId, campaignId, req.user.userId);
    return this.creativeAssetsService.listForCampaign(organizationId, productId, campaignId, {
      kind: kind as CreativeKind | undefined,
      contentArtifactId,
      contentVersionId,
      platform,
      limit: limit ? Number(limit) : undefined,
    });
  }

  // 17G: creative *selection* only (unreviewed/preferred/rejected) — never
  // deletes, never touches the source ContentVersion, independent of
  // Sprint 16 Human Review and any future Sprint 28 approval workflow.
  @Patch('assets/:assetId/review')
  async updateAssetReview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('assetId') assetId: string,
    @Body() body: UpdateCreativeAssetReviewDto,
  ) {
    await this.campaignsService.findOne(organizationId, productId, campaignId, req.user.userId);
    return this.creativeAssetsService.updateReviewStatus(organizationId, productId, campaignId, assetId, body.status);
  }

  @Post('social-image/:artifactId/versions/:version')
  generateSocialImage(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('artifactId') artifactId: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() body: SocialImageGenerationOptionsDto,
  ) {
    return this.creativeGenerationService.generateSocialImage({ organizationId, productId, campaignId, artifactId, version, userId: req.user.userId, options: body });
  }

  @Get('social-image/:artifactId/versions/:version')
  async listSocialImages(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('artifactId') artifactId: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    await this.campaignsService.findOne(organizationId, productId, campaignId, req.user.userId);
    return this.creativeGenerationService.listSocialImages(organizationId, productId, campaignId, artifactId, version);
  }

  @Post('blog-hero/:artifactId/versions/:version')
  generateBlogHero(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('artifactId') artifactId: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() body: BlogHeroGenerationOptionsDto,
  ) {
    return this.creativeGenerationService.generateBlogHero({ organizationId, productId, campaignId, artifactId, version, userId: req.user.userId, options: body });
  }

  @Get('blog-hero/:artifactId/versions/:version')
  async listBlogHeroes(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('artifactId') artifactId: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    await this.campaignsService.findOne(organizationId, productId, campaignId, req.user.userId);
    return this.creativeGenerationService.listBlogHeroes(organizationId, productId, campaignId, artifactId, version);
  }

  @Post('thumbnail/:artifactId/versions/:version')
  generateThumbnail(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('artifactId') artifactId: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() body: ThumbnailGenerationOptionsDto,
  ) {
    return this.creativeGenerationService.generateThumbnail({ organizationId, productId, campaignId, artifactId, version, userId: req.user.userId, options: body });
  }

  @Get('thumbnail/:artifactId/versions/:version')
  async listThumbnails(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('artifactId') artifactId: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    await this.campaignsService.findOne(organizationId, productId, campaignId, req.user.userId);
    return this.creativeGenerationService.listThumbnails(organizationId, productId, campaignId, artifactId, version);
  }
}
