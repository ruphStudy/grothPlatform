import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FetchTestDto } from './dto/fetch-test.dto';
import { WebsiteContentExtractorService } from './website-content-extractor.service';
import { WebsiteCorePageExtractionService } from './website-core-page-extraction.service';
import { WebsiteFetchService } from './website-fetch.service';
import { WebsitePageDiscoveryService } from './website-page-discovery.service';
import { WebsitePageSelectionService } from './website-page-selection.service';
import { WebsiteSupportPageExtractionService } from './website-support-page-extraction.service';
import { ProductWebsiteKnowledgeService } from './product-website-knowledge.service';

@UseGuards(JwtAuthGuard)
@Controller('website-intelligence')
export class WebsiteIntelligenceController {
  constructor(
    private readonly websiteFetchService: WebsiteFetchService,
    private readonly websiteContentExtractorService: WebsiteContentExtractorService,
    private readonly websitePageDiscoveryService: WebsitePageDiscoveryService,
    private readonly websitePageSelectionService: WebsitePageSelectionService,
    private readonly websiteCorePageExtractionService: WebsiteCorePageExtractionService,
    private readonly websiteSupportPageExtractionService: WebsiteSupportPageExtractionService,
    private readonly productWebsiteKnowledgeService: ProductWebsiteKnowledgeService,
  ) {}

  /**
   * TEMPORARY development-only endpoint for Sprint 7A verification.
   * Not tied to Organization/Product. Remove once website extraction is
   * integrated with Product Intelligence.
   */
  @Post('fetch-test')
  async fetchTest(@Body() dto: FetchTestDto) {
    const result = await this.websiteFetchService.fetchWebsite(dto.url);
    return {
      finalUrl: result.finalUrl,
      statusCode: result.statusCode,
      contentType: result.contentType,
      contentLength: result.contentLength,
      fetchedAt: result.fetchedAt,
      bodyPreview: result.body.slice(0, 1000),
    };
  }

  /**
   * TEMPORARY development-only endpoint for Sprint 7D verification.
   * Not tied to Organization/Product. Remove once website extraction is
   * integrated with Product Intelligence.
   */
  @Post('extract-test')
  async extractTest(@Body() dto: FetchTestDto) {
    const fetchResult = await this.websiteFetchService.fetchWebsite(dto.url);
    const extracted = this.websiteContentExtractorService.extract(fetchResult);
    return {
      url: extracted.url,
      title: extracted.title,
      metaDescription: extracted.metaDescription,
      headings: extracted.headings,
      paragraphs: extracted.paragraphs,
      listItems: extracted.listItems,
      ctas: extracted.ctas,
      textContentPreview: extracted.textContent.slice(0, 5000),
      extraction: extracted.extraction,
    };
  }

  /**
   * TEMPORARY development-only endpoint for Sprint 8A verification.
   * Not tied to Organization/Product. Discovery only — does not fetch
   * discovered pages.
   */
  @Post('discover-test')
  async discoverTest(@Body() dto: FetchTestDto) {
    const fetchResult = await this.websiteFetchService.fetchWebsite(dto.url);
    const pages = this.websitePageDiscoveryService.discoverPages(fetchResult);
    return {
      sourceUrl: dto.url,
      finalUrl: fetchResult.finalUrl,
      pages,
    };
  }

  /**
   * TEMPORARY development-only endpoint for Sprint 8B verification.
   * Not tied to Organization/Product. Selection only — does not fetch
   * selected pages.
   */
  @Post('select-pages-test')
  async selectPagesTest(@Body() dto: FetchTestDto) {
    const fetchResult = await this.websiteFetchService.fetchWebsite(dto.url);
    const discovered = this.websitePageDiscoveryService.discoverPages(fetchResult);
    const selected = this.websitePageSelectionService.selectImportantPages(discovered);
    return {
      sourceUrl: dto.url,
      finalUrl: fetchResult.finalUrl,
      discoveredCount: discovered.length,
      selectedCount: selected.length,
      pages: selected,
    };
  }

  /**
   * TEMPORARY development-only endpoint for Sprint 8C verification.
   * Not tied to Organization/Product. Extracts deterministic knowledge from
   * selected about/product/features/pricing pages only.
   */
  @Post('core-pages-test')
  async corePagesTest(@Body() dto: FetchTestDto) {
    const result = await this.websiteCorePageExtractionService.extractFromHomepage(dto.url);
    return {
      sourceUrl: dto.url,
      finalUrl: result.homepageFetchResult.finalUrl,
      discoveredCount: result.discovered.length,
      selectedCount: result.selected.length,
      attemptedCount: result.extraction.pages.length + result.extraction.failures.length,
      extractedCount: result.extraction.pages.length,
      pages: result.extraction.pages,
      failures: result.extraction.failures,
    };
  }

  /**
   * TEMPORARY development-only endpoint for Sprint 8D verification.
   * Not tied to Organization/Product. Extracts deterministic knowledge from
   * selected faq/docs pages only.
   */
  @Post('support-pages-test')
  async supportPagesTest(@Body() dto: FetchTestDto) {
    const result = await this.websiteSupportPageExtractionService.extractFromHomepage(dto.url);
    return {
      sourceUrl: dto.url,
      finalUrl: result.homepageFetchResult.finalUrl,
      discoveredCount: result.discovered.length,
      selectedCount: result.selected.length,
      attemptedCount: result.extraction.pages.length + result.extraction.failures.length,
      extractedCount: result.extraction.pages.length,
      pages: result.extraction.pages,
      failures: result.extraction.failures,
    };
  }

  /**
   * TEMPORARY development-only endpoint for Sprint 8E verification.
   * Not tied to Organization/Product. Consolidates homepage + core + support
   * page knowledge into a single deterministic ProductWebsiteKnowledge object.
   */
  @Post('product-knowledge-test')
  async productKnowledgeTest(@Body() dto: FetchTestDto) {
    const knowledge = await this.productWebsiteKnowledgeService.buildKnowledge(dto.url);
    return {
      source: knowledge.source,
      pagesAnalyzed: knowledge.pagesAnalyzed,
      identity: knowledge.identity,
      features: knowledge.features,
      pricing: knowledge.pricing,
      faqs: knowledge.faqs,
      documentation: knowledge.documentation,
      callsToAction: knowledge.callsToAction,
      combinedTextPreview: knowledge.combinedText.slice(0, 5000),
      combinedTextLength: knowledge.combinedText.length,
      combinedTextTruncated: knowledge.combinedTextTruncated,
      extractionStats: knowledge.extractionStats,
      failures: knowledge.failures,
      assessment: knowledge.assessment,
    };
  }
}
