import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { KeywordIntelligenceService } from './keyword-intelligence.service';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/keywords')
export class KeywordIntelligenceController {
  constructor(private readonly keywordIntelligenceService: KeywordIntelligenceService) {}

  @Post('signals-preview')
  signalsPreview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    return this.keywordIntelligenceService.buildForProduct(organizationId, productId, req.user.userId);
  }

  @Post('intents-preview')
  intentsPreview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    return this.keywordIntelligenceService.buildIntentsForProduct(organizationId, productId, req.user.userId);
  }

  @Post('clusters-preview')
  clustersPreview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    return this.keywordIntelligenceService.buildClustersForProduct(organizationId, productId, req.user.userId);
  }

  @Post('opportunities-preview')
  opportunitiesPreview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    return this.keywordIntelligenceService.buildOpportunitiesForProduct(organizationId, productId, req.user.userId);
  }

  @Post('competitor-gaps-preview')
  competitorGapsPreview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    return this.keywordIntelligenceService.buildCompetitorGapsForProduct(organizationId, productId, req.user.userId);
  }

  @Post('long-tail-preview')
  longTailPreview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    return this.keywordIntelligenceService.buildLongTailForProduct(organizationId, productId, req.user.userId);
  }

  @Post('audience-map-preview')
  audienceMapPreview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    return this.keywordIntelligenceService.buildAudienceMapForProduct(organizationId, productId, req.user.userId);
  }

  @Post('intelligence-preview')
  intelligencePreview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    return this.keywordIntelligenceService.buildFullIntelligenceForProduct(organizationId, productId, req.user.userId);
  }
}
