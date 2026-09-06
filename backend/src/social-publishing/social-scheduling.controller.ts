import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CampaignsService } from '../campaigns/campaigns.service';
import { ScheduleSocialContentDto } from './dto/schedule-social-content.dto';
import { UpdateSocialScheduleDto } from './dto/update-social-schedule.dto';
import { SocialSchedulingService } from './services/social-scheduling.service';
import type { SocialPlatform } from '../social-integrations/types/social.types';
import type { SocialScheduleStatus } from './schemas/social-schedule.schema';

// Create/update delegate their own tenant + external-action gating to
// SocialSchedulingService (via SocialPublishingService's shared gates,
// same as immediate publishing). GET/cancel routes use the same cheap
// Campaign ownership check as every other Sprint 15-19 read/mutation
// route that doesn't itself run those gates.
@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/campaigns/:campaignId/social-schedules')
export class SocialSchedulingController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly socialSchedulingService: SocialSchedulingService,
  ) {}

  @Post(':artifactId/versions/:version')
  create(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('artifactId') artifactId: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() body: ScheduleSocialContentDto,
  ) {
    return this.socialSchedulingService.create({
      organizationId,
      productId,
      campaignId,
      artifactId,
      version,
      connectionId: body.connectionId,
      creativeAssetId: body.creativeAssetId,
      scheduledAt: body.scheduledAt,
      timezone: body.timezone,
      idempotencyKey: body.idempotencyKey,
      userId: req.user.userId,
    });
  }

  @Patch(':scheduleId')
  update(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('scheduleId') scheduleId: string,
    @Body() body: UpdateSocialScheduleDto,
  ) {
    return this.socialSchedulingService.update(organizationId, productId, campaignId, scheduleId, {
      scheduledAt: body.scheduledAt,
      timezone: body.timezone,
      connectionId: body.connectionId,
      creativeAssetId: body.creativeAssetId,
      userId: req.user.userId,
    });
  }

  @Post(':scheduleId/cancel')
  async cancel(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('scheduleId') scheduleId: string,
  ) {
    await this.campaignsService.findOne(organizationId, productId, campaignId, req.user.userId);
    return this.socialSchedulingService.cancel(organizationId, productId, campaignId, scheduleId);
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
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    await this.campaignsService.findOne(organizationId, productId, campaignId, req.user.userId);
    return this.socialSchedulingService.list(organizationId, productId, campaignId, {
      platform: platform as SocialPlatform | undefined,
      status: status as SocialScheduleStatus | undefined,
      connectionId,
      contentArtifactId,
      from,
      to,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':scheduleId')
  async get(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('scheduleId') scheduleId: string,
  ) {
    await this.campaignsService.findOne(organizationId, productId, campaignId, req.user.userId);
    return this.socialSchedulingService.get(organizationId, productId, campaignId, scheduleId);
  }
}
