import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompetitorDiscoveryService } from './competitor-discovery.service';
import { CompetitorFeatureComparisonService } from './competitor-feature-comparison.service';
import { CompetitorPositioningService } from './competitor-positioning.service';
import { CompetitorWebsiteAnalysisService } from './competitor-website-analysis.service';
import { MarketCategoryService } from './market-category.service';
import { MarketGapService } from './market-gap.service';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/market')
export class MarketCategoryController {
  constructor(
    private readonly marketCategoryService: MarketCategoryService,
    private readonly competitorDiscoveryService: CompetitorDiscoveryService,
    private readonly competitorWebsiteAnalysisService: CompetitorWebsiteAnalysisService,
    private readonly competitorFeatureComparisonService: CompetitorFeatureComparisonService,
    private readonly competitorPositioningService: CompetitorPositioningService,
    private readonly marketGapService: MarketGapService,
  ) {}

  @Post('category-preview')
  categoryPreview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    return this.marketCategoryService.discoverForProduct(organizationId, productId, req.user.userId);
  }

  @Post('competitors-preview')
  competitorsPreview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    return this.competitorDiscoveryService.discoverForProduct(organizationId, productId, req.user.userId);
  }

  @Post('competitors-analysis-preview')
  competitorsAnalysisPreview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    return this.competitorWebsiteAnalysisService.analyzeForProduct(organizationId, productId, req.user.userId);
  }

  @Post('feature-comparison-preview')
  featureComparisonPreview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    return this.competitorFeatureComparisonService.compareForProduct(organizationId, productId, req.user.userId);
  }

  @Post('positioning-preview')
  positioningPreview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    return this.competitorPositioningService.analyzeForProduct(organizationId, productId, req.user.userId);
  }

  @Post('gaps-preview')
  gapsPreview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    return this.marketGapService.analyzeForProduct(organizationId, productId, req.user.userId);
  }
}
