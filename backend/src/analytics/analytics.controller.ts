import { Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalyticsDashboardQueryDto } from './dto/analytics.dto';
import { AnalyticsEventService } from './services/analytics-event.service';
import { AnalyticsFunnelService } from './services/analytics-funnel.service';
import { AnalyticsQueryService } from './services/analytics-query.service';
import { ContentAnalyticsService } from './services/content-analytics.service';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/analytics')
export class AnalyticsController {
  constructor(
    private readonly eventService: AnalyticsEventService,
    private readonly queryService: AnalyticsQueryService,
    private readonly funnelService: AnalyticsFunnelService,
    private readonly contentService: ContentAnalyticsService,
  ) {}

  @Post('backfill')
  backfill(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string) {
    return this.eventService.backfill(organizationId, productId, req.user.userId);
  }

  @Get('dashboard')
  dashboard(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Query() query: AnalyticsDashboardQueryDto) {
    return this.queryService.dashboard(organizationId, productId, req.user.userId, query);
  }

  @Get('summary')
  summary(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Query() query: AnalyticsDashboardQueryDto) {
    return this.queryService.dashboard(organizationId, productId, req.user.userId, query);
  }

  @Get('trends')
  trends(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Query() query: AnalyticsDashboardQueryDto) {
    return this.queryService.dashboard(organizationId, productId, req.user.userId, query);
  }

  @Get('channels')
  channels(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Query() query: AnalyticsDashboardQueryDto) {
    return this.queryService.dashboard(organizationId, productId, req.user.userId, query);
  }

  @Get('campaigns')
  campaigns(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Query() query: AnalyticsDashboardQueryDto) {
    return this.queryService.dashboard(organizationId, productId, req.user.userId, query);
  }

  @Get('funnel')
  funnel(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Query() query: AnalyticsDashboardQueryDto) {
    return this.funnelService.leadFunnel(organizationId, productId, req.user.userId, query);
  }

  @Get('content')
  content(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Query() query: AnalyticsDashboardQueryDto) {
    return this.contentService.content(organizationId, productId, req.user.userId, query);
  }

  @Get('campaign-comparison')
  campaignComparison(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Query() query: AnalyticsDashboardQueryDto) {
    return this.contentService.campaignComparison(organizationId, productId, req.user.userId, query);
  }

  @Get('campaigns/:campaignId')
  campaignDetail(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('campaignId') campaignId: string, @Query() query: AnalyticsDashboardQueryDto) {
    return this.contentService.campaignDetail(organizationId, productId, req.user.userId, campaignId, query);
  }
}
