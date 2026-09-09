import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CampaignsService } from '../campaigns/campaigns.service';
import { ScheduleCmsBlogDto } from './dto/schedule-cms-blog.dto';
import { UpdateCmsScheduleDto } from './dto/update-cms-schedule.dto';
import { CmsSchedulingService } from './services/cms-scheduling.service';
import type { CmsScheduleStatus } from './schemas/cms-schedule.schema';
import type { CmsPublishMode } from './schemas/cms-publication.schema';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/campaigns/:campaignId/cms-schedules')
export class CmsSchedulesController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly cmsSchedulingService: CmsSchedulingService,
  ) {}

  @Post(':artifactId/versions/:version')
  create(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('artifactId') artifactId: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() body: ScheduleCmsBlogDto,
  ) {
    return this.cmsSchedulingService.create({
      organizationId,
      productId,
      campaignId,
      artifactId,
      version,
      connectionId: body.connectionId,
      mode: body.mode,
      scheduledAt: body.scheduledAt,
      timezone: body.timezone,
      idempotencyKey: body.idempotencyKey,
      featuredCreativeAssetId: body.featuredCreativeAssetId,
      categoryIds: body.categoryIds,
      tagIds: body.tagIds,
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
    @Body() body: UpdateCmsScheduleDto,
  ) {
    return this.cmsSchedulingService.update(organizationId, productId, campaignId, scheduleId, {
      scheduledAt: body.scheduledAt,
      timezone: body.timezone,
      connectionId: body.connectionId,
      mode: body.mode,
      featuredCreativeAssetId: body.featuredCreativeAssetId,
      categoryIds: body.categoryIds,
      tagIds: body.tagIds,
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
    return this.cmsSchedulingService.cancel(organizationId, productId, campaignId, scheduleId);
  }

  @Get()
  async list(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Query('status') status?: string,
    @Query('connectionId') connectionId?: string,
    @Query('mode') mode?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    await this.campaignsService.findOne(organizationId, productId, campaignId, req.user.userId);
    return this.cmsSchedulingService.list(organizationId, productId, campaignId, {
      status: status as CmsScheduleStatus | undefined,
      connectionId,
      mode: mode as CmsPublishMode | undefined,
      start,
      end,
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
    return this.cmsSchedulingService.get(organizationId, productId, campaignId, scheduleId);
  }
}
