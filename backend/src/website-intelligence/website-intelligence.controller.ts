import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FetchTestDto } from './dto/fetch-test.dto';
import { WebsiteContentExtractorService } from './website-content-extractor.service';
import { WebsiteFetchService } from './website-fetch.service';
import { WebsitePageDiscoveryService } from './website-page-discovery.service';

@UseGuards(JwtAuthGuard)
@Controller('website-intelligence')
export class WebsiteIntelligenceController {
  constructor(
    private readonly websiteFetchService: WebsiteFetchService,
    private readonly websiteContentExtractorService: WebsiteContentExtractorService,
    private readonly websitePageDiscoveryService: WebsitePageDiscoveryService,
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
}
