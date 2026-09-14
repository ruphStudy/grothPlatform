import { Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AttributionQueryDto } from './dto/attribution.dto';
import { AttributionService } from './services/attribution.service';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/attribution')
export class AttributionController {
  constructor(private readonly attributionService: AttributionService) {}

  @Post('backfill')
  backfill(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string) {
    return this.attributionService.backfill(organizationId, productId, req.user.userId);
  }

  @Get('dashboard')
  dashboard(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Query() query: AttributionQueryDto) {
    return this.attributionService.dashboard(organizationId, productId, req.user.userId, query);
  }

  @Get('utm')
  utm(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Query() query: AttributionQueryDto) {
    return this.attributionService.utm(organizationId, productId, req.user.userId, query);
  }

  @Get('content')
  content(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Query() query: AttributionQueryDto) {
    return this.attributionService.content(organizationId, productId, req.user.userId, query);
  }

  @Get('campaigns')
  campaigns(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Query() query: AttributionQueryDto) {
    return this.attributionService.campaigns(organizationId, productId, req.user.userId, query);
  }

  @Get('revenue-map')
  revenueMap(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Query() query: AttributionQueryDto) {
    return this.attributionService.revenueMap(organizationId, productId, req.user.userId, query);
  }

  @Get('opportunities/:opportunityId/journey')
  journey(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('opportunityId') opportunityId: string, @Query() query: AttributionQueryDto) {
    return this.attributionService.journey(organizationId, productId, req.user.userId, opportunityId, query);
  }
}
