import { Injectable } from '@nestjs/common';
import { AudienceJtbdService } from '../audience-intelligence/audience-jtbd.service';
import { AudiencePainPointService } from '../audience-intelligence/audience-pain-point.service';
import { AudienceSegmentService } from '../audience-intelligence/audience-segment.service';
import { AudienceSignalService } from '../audience-intelligence/audience-signal.service';
import { BuyerUserMapService } from '../audience-intelligence/buyer-user-map.service';
import { IcpService } from '../audience-intelligence/icp.service';
import { MarketCategoryService } from '../market-intelligence/market-category.service';
import { ProductsService } from '../products/products.service';
import { ProductWebsiteKnowledgeService } from '../website-intelligence/product-website-knowledge.service';
import type { ProductWebsiteKnowledge } from '../website-intelligence/product-website-knowledge.types';
import { KeywordClusterService } from './keyword-cluster.service';
import { KeywordIntentService } from './keyword-intent.service';
import { KeywordSignalService } from './keyword-signal.service';
import type { KeywordClusterResult } from './types/keyword-cluster.types';
import type { KeywordIntentResult } from './types/keyword-intent.types';
import type { KeywordSignalResult } from './types/keyword-signal.types';

/**
 * Single tenant-safe orchestration for keyword signal extraction. Runs one
 * Product lookup, one best-effort website-knowledge build, and the full
 * Sprint 9/10 pure chain (discoverCategory -> extract -> construct -> detect
 * -> map -> identify -> generate) exactly once each — never the *ForProduct()
 * orchestrators, which would redo the lookup/website work. See Sprint 9H.1 /
 * 10H for the same duplicate-work-avoidance pattern.
 */
@Injectable()
export class KeywordIntelligenceService {
  constructor(
    private readonly productsService: ProductsService,
    private readonly productWebsiteKnowledgeService: ProductWebsiteKnowledgeService,
    private readonly marketCategoryService: MarketCategoryService,
    private readonly audienceSignalService: AudienceSignalService,
    private readonly audienceSegmentService: AudienceSegmentService,
    private readonly icpService: IcpService,
    private readonly buyerUserMapService: BuyerUserMapService,
    private readonly audiencePainPointService: AudiencePainPointService,
    private readonly audienceJtbdService: AudienceJtbdService,
    private readonly keywordSignalService: KeywordSignalService,
    private readonly keywordIntentService: KeywordIntentService,
    private readonly keywordClusterService: KeywordClusterService,
  ) {}

  /**
   * Runs the 11A keyword-signal orchestration exactly once, then classifies
   * the result in memory via the pure KeywordIntentService — no repeated
   * product/website/category/audience work, no internal HTTP call to
   * signals-preview.
   */
  async buildIntentsForProduct(organizationId: string, productId: string, userId: string): Promise<KeywordIntentResult> {
    const signals = await this.buildForProduct(organizationId, productId, userId);
    return this.keywordIntentService.classify(signals);
  }

  /**
   * Same single 11A pass, then 11B classify() and 11C cluster() purely in
   * memory — no internal HTTP calls, no repeated orchestration.
   */
  async buildClustersForProduct(organizationId: string, productId: string, userId: string): Promise<KeywordClusterResult> {
    const signals = await this.buildForProduct(organizationId, productId, userId);
    const intents = this.keywordIntentService.classify(signals);
    return this.keywordClusterService.cluster(signals, intents);
  }

  async buildForProduct(organizationId: string, productId: string, userId: string): Promise<KeywordSignalResult> {
    const product = await this.productsService.findOne(organizationId, productId, userId);

    let websiteKnowledge: ProductWebsiteKnowledge | undefined;
    const websiteUrl = product.websiteUrl?.trim();
    if (websiteUrl) {
      try {
        websiteKnowledge = await this.productWebsiteKnowledgeService.buildKnowledge(websiteUrl);
      } catch {
        // fall through — metadata-only fallback remains valid
      }
    }

    const productInput = {
      name: product.name,
      shortDescription: product.shortDescription,
      productType: product.productType,
      primaryGoal: product.primaryGoal,
      targetMarkets: product.targetMarkets,
    };

    const marketCategory = this.marketCategoryService.discoverCategory({ product: productInput, websiteKnowledge });
    const audienceSignals = this.audienceSignalService.extract({ product: productInput, websiteKnowledge, marketCategory });
    const segments = this.audienceSegmentService.construct(audienceSignals);
    const icp = this.icpService.detect({ signals: audienceSignals, segments });
    const buyerUserMap = this.buyerUserMapService.map({ signals: audienceSignals, segments, icp });
    const painPoints = this.audiencePainPointService.identify({ signals: audienceSignals, segments, icp, buyerUserMap });
    const jtbd = this.audienceJtbdService.generate({ signals: audienceSignals, segments, icp, buyerUserMap, painPoints });

    return this.keywordSignalService.extract({
      product: productInput,
      websiteKnowledge,
      marketCategory,
      audienceSignals,
      segments,
      painPoints,
      jtbd,
    });
  }
}
