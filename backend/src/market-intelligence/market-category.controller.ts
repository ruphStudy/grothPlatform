import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MarketCategoryService } from './market-category.service';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/market')
export class MarketCategoryController {
  constructor(private readonly marketCategoryService: MarketCategoryService) {}

  @Post('category-preview')
  categoryPreview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    return this.marketCategoryService.discoverForProduct(organizationId, productId, req.user.userId);
  }
}
