import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CampaignsService } from '../campaigns/campaigns.service';
import { PublishSocialContentDto } from './dto/publish-social-content.dto';
import { SocialPublishingService } from './services/social-publishing.service';
import type { SocialPlatform } from '../social-integrations/types/social.types';
import type { PublicationStatus } from './schemas/social-publication.schema';

// Tenant safety for GET routes is the same cheap Campaign ownership check
// used throughout Sprint 15-18 (never rebuilds Growth Strategy, never
// calls a provider). The POST route delegates its own paid/external-action
// gating to SocialPublishingService.
@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/campaigns/:campaignId/social-publications')
export class SocialPublishingController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly socialPublishingService: SocialPublishingService,
  ) {}

  @Post(':artifactId/versions/:version/publish')
  publish(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('artifactId') artifactId: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() body: PublishSocialContentDto,
  ) {
    return this.socialPublishingService.publish({
      organizationId,
      productId,
      campaignId,
      artifactId,
      version,
      connectionId: body.connectionId,
      creativeAssetId: body.creativeAssetId,
      idempotencyKey: body.idempotencyKey,
      userId: req.user.userId,
    });
  }

  @Get()
  async list(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Query('platform') platform?: string,
    @Query('status') status?: string,
    @Query('connectionId') connectionId?: string,
    @Query('contentArtifactId') contentArtifactId?: string,
    @Query('limit') limit?: string,
  ) {
    await this.campaignsService.findOne(organizationId, productId, campaignId, req.user.userId);
    return this.socialPublishingService.list(organizationId, productId, campaignId, {
      platform: platform as SocialPlatform | undefined,
      status: status as PublicationStatus | undefined,
      connectionId,
      contentArtifactId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':publicationId')
  async get(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('publicationId') publicationId: string,
  ) {
    await this.campaignsService.findOne(organizationId, productId, campaignId, req.user.userId);
    return this.socialPublishingService.get(organizationId, productId, campaignId, publicationId);
  }
}
