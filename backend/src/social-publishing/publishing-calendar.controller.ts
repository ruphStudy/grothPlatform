import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CampaignsService } from '../campaigns/campaigns.service';
import { PublishingCalendarService } from './services/publishing-calendar.service';
import type { SocialPlatform } from '../social-integrations/types/social.types';
import type { PublishingCalendarStatus } from './types/publishing-calendar.types';

// 19E: read-only. Tenant safety is the same cheap Campaign ownership
// check used throughout Sprint 15-19 — this never rebuilds Growth
// Strategy and never calls a social provider.
@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/campaigns/:campaignId/publishing-calendar')
export class PublishingCalendarController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly publishingCalendarService: PublishingCalendarService,
  ) {}

  @Get()
  async getCalendar(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Query('start') start: string,
    @Query('end') end: string,
    @Query('platform') platform?: string,
    @Query('status') status?: string,
    @Query('connectionId') connectionId?: string,
  ) {
    await this.campaignsService.findOne(organizationId, productId, campaignId, req.user.userId);
    return this.publishingCalendarService.getCalendar(organizationId, productId, campaignId, {
      start,
      end,
      platform: platform as SocialPlatform | undefined,
      status: status as PublishingCalendarStatus | undefined,
      connectionId,
    });
  }
}
