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
}
