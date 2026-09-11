import { Body, Controller, Get, Header, Headers, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalyticsDashboardQueryDto, AnalyticsExportDto, CollectWebAnalyticsEventDto, CreateAnalyticsReportDto, CreateWebAnalyticsSiteDto, UpdateAnalyticsReportDto, UpdateWebAnalyticsSiteDto } from './dto/analytics.dto';
import { AnalyticsEventService } from './services/analytics-event.service';
import { AnalyticsFunnelService } from './services/analytics-funnel.service';
import { AnalyticsQueryService } from './services/analytics-query.service';
import { AnalyticsReportingService } from './services/analytics-reporting.service';
import { ContentAnalyticsService } from './services/content-analytics.service';
import { SocialAnalyticsService } from './services/social-analytics.service';
import { WebAnalyticsService } from './services/web-analytics.service';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/analytics')
export class AnalyticsController {
  constructor(
    private readonly eventService: AnalyticsEventService,
    private readonly queryService: AnalyticsQueryService,
    private readonly funnelService: AnalyticsFunnelService,
    private readonly contentService: ContentAnalyticsService,
    private readonly webAnalyticsService: WebAnalyticsService,
    private readonly reportingService: AnalyticsReportingService,
    private readonly socialAnalyticsService: SocialAnalyticsService,
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

  @Get('sites')
  sites(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string) {
    return this.webAnalyticsService.listSites(organizationId, productId, req.user.userId);
  }

  @Post('sites')
  createSite(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Body() body: CreateWebAnalyticsSiteDto) {
    return this.webAnalyticsService.createSite(organizationId, productId, req.user.userId, body);
  }

  @Patch('sites/:siteId')
  updateSite(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('siteId') siteId: string, @Body() body: UpdateWebAnalyticsSiteDto) {
    return this.webAnalyticsService.updateSite(organizationId, productId, req.user.userId, siteId, body);
  }

  @Post('sites/:siteId/disable')
  disableSite(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('siteId') siteId: string) {
    return this.webAnalyticsService.disableSite(organizationId, productId, req.user.userId, siteId);
  }

  @Get('sites/:siteId/snippet')
  snippet(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('siteId') siteId: string) {
    return this.webAnalyticsService.snippet(organizationId, productId, req.user.userId, siteId);
  }

  @Get('website')
  website(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Query() query: AnalyticsDashboardQueryDto) {
    return this.webAnalyticsService.website(organizationId, productId, req.user.userId, query);
  }

  @Get('social')
  social(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Query() query: AnalyticsDashboardQueryDto) {
    return this.socialAnalyticsService.overview(organizationId, productId, req.user.userId, query);
  }

  @Get('social/posts')
  socialPosts(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Query() query: AnalyticsDashboardQueryDto) {
    return this.socialAnalyticsService.posts(organizationId, productId, req.user.userId, query);
  }

  @Get('social/posts/:publicationId')
  socialPost(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('publicationId') publicationId: string) {
    return this.socialAnalyticsService.post(organizationId, productId, req.user.userId, publicationId);
  }

  @Post('social/posts/:publicationId/sync')
  syncSocialPost(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('publicationId') publicationId: string) {
    return this.socialAnalyticsService.syncPost(organizationId, productId, req.user.userId, publicationId);
  }

  @Get('reports')
  reports(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string) {
    return this.reportingService.list(organizationId, productId, req.user.userId);
  }

  @Post('reports')
  createReport(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Body() body: CreateAnalyticsReportDto) {
    return this.reportingService.create(organizationId, productId, req.user.userId, body);
  }

  @Get('reports/:reportId')
  report(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('reportId') reportId: string) {
    return this.reportingService.get(organizationId, productId, req.user.userId, reportId);
  }

  @Patch('reports/:reportId')
  updateReport(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('reportId') reportId: string, @Body() body: UpdateAnalyticsReportDto) {
    return this.reportingService.update(organizationId, productId, req.user.userId, reportId, body);
  }

  @Post('reports/:reportId/archive')
  archiveReport(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('reportId') reportId: string) {
    return this.reportingService.archive(organizationId, productId, req.user.userId, reportId);
  }

  @Post('reports/:reportId/run')
  runReport(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('reportId') reportId: string) {
    return this.reportingService.run(organizationId, productId, req.user.userId, reportId);
  }

  @Post('export')
  export(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Body() body: AnalyticsExportDto) {
    return this.reportingService.exportCsv(organizationId, productId, req.user.userId, body);
  }

  @Get('data-health')
  dataHealth(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string) {
    return this.reportingService.dataHealth(organizationId, productId, req.user.userId);
  }

  @Post('data-health/backfill')
  dataHealthBackfill(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string) {
    return this.reportingService.backfillFromHealth(organizationId, productId, req.user.userId);
  }
}

@Controller('public/analytics')
export class PublicAnalyticsController {
  constructor(private readonly webAnalyticsService: WebAnalyticsService) {}

  @Get('analytics.js')
  @Header('Content-Type', 'application/javascript; charset=utf-8')
  script() {
    return this.webAnalyticsService.script();
  }

  @Post('collect')
  collect(@Body() body: CollectWebAnalyticsEventDto, @Headers('origin') origin?: string) {
    return this.webAnalyticsService.collect(body, origin);
  }
}
