import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FetchTestDto } from './dto/fetch-test.dto';
import { WebsiteFetchService } from './website-fetch.service';

@UseGuards(JwtAuthGuard)
@Controller('website-intelligence')
export class WebsiteIntelligenceController {
  constructor(private readonly websiteFetchService: WebsiteFetchService) {}

  /**
   * TEMPORARY development-only endpoint for Sprint 7A verification.
   * Not tied to Organization/Product. Remove once HTML extraction (Sprint 7B)
   * is integrated with Product Intelligence.
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
}
