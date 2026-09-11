import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalyticsDashboardQueryDto } from './dto/analytics.dto';
import { AnalyticsEventService } from './services/analytics-event.service';
import { AnalyticsQueryService } from './services/analytics-query.service';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/analytics')
export class AnalyticsController {
  constructor(private readonly eventService: AnalyticsEventService, private readonly queryService: AnalyticsQueryService) {}

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
}
