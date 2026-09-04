import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GrowthStrategyService } from './growth-strategy.service';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/growth-strategy')
export class GrowthStrategyController {
  constructor(private readonly growthStrategyService: GrowthStrategyService) {}

  @Post('signals-preview')
  signalsPreview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    return this.growthStrategyService.buildSignalsForProduct(organizationId, productId, req.user.userId);
  }

  @Post('objectives-preview')
  objectivesPreview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    return this.growthStrategyService.buildObjectivesForProduct(organizationId, productId, req.user.userId);
  }

  @Post('channels-preview')
  channelsPreview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    return this.growthStrategyService.buildChannelsForProduct(organizationId, productId, req.user.userId);
  }

  @Post('motions-preview')
  motionsPreview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    return this.growthStrategyService.buildMotionsForProduct(organizationId, productId, req.user.userId);
  }

  @Post('funnel-preview')
  funnelPreview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    return this.growthStrategyService.buildFunnelForProduct(organizationId, productId, req.user.userId);
  }

  @Post('overview-preview')
  overviewPreview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    return this.growthStrategyService.buildOverviewForProduct(organizationId, productId, req.user.userId);
  }

  @Post('messaging-preview')
  messagingPreview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    return this.growthStrategyService.buildMessagingForProduct(organizationId, productId, req.user.userId);
  }

  @Post('content-preview')
  contentPreview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    return this.growthStrategyService.buildContentForProduct(organizationId, productId, req.user.userId);
  }

  @Post('acquisition-preview')
  acquisitionPreview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    return this.growthStrategyService.buildAcquisitionForProduct(organizationId, productId, req.user.userId);
  }

  @Post('conversion-preview')
  conversionPreview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    return this.growthStrategyService.buildConversionForProduct(organizationId, productId, req.user.userId);
  }

  @Post('plan-preview')
  planPreview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    return this.growthStrategyService.buildPlanForProduct(organizationId, productId, req.user.userId);
  }
}
