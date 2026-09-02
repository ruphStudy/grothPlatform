import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProductIntelligenceService } from './product-intelligence.service';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/intelligence')
export class ProductIntelligenceController {
  constructor(private readonly productIntelligenceService: ProductIntelligenceService) {}

  @Post('analyze')
  analyze(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    return this.productIntelligenceService.analyze(organizationId, productId, req.user.userId);
  }

  @Get()
  getProfile(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    return this.productIntelligenceService.getProfile(organizationId, productId, req.user.userId);
  }
}
