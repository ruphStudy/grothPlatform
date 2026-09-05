import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BlogGenerationService } from './adapters/blog-generation.service';
import { LinkedInGenerationService } from './adapters/linkedin-generation.service';
import { BlogGenerationOptionsDto } from './dto/blog-generation-options.dto';
import { LinkedInGenerationOptionsDto } from './dto/linkedin-generation-options.dto';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/campaigns/:campaignId/content-generation')
export class ContentGenerationController {
  constructor(
    private readonly blogGenerationService: BlogGenerationService,
    private readonly linkedInGenerationService: LinkedInGenerationService,
  ) {}

  // One paid generation call per request — never auto-triggered, only ever
  // called from an explicit user action.
  @Post('blog/:blogCalendarItemId')
  generateBlogDraft(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('blogCalendarItemId') blogCalendarItemId: string,
    @Body() body: BlogGenerationOptionsDto,
  ) {
    return this.blogGenerationService.generateBlogDraft(organizationId, productId, campaignId, blogCalendarItemId, req.user.userId, body);
  }

  @Post('linkedin/:socialCalendarItemId')
  generateLinkedInDraft(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('socialCalendarItemId') socialCalendarItemId: string,
    @Body() body: LinkedInGenerationOptionsDto,
  ) {
    return this.linkedInGenerationService.generateLinkedInDraft(organizationId, productId, campaignId, socialCalendarItemId, req.user.userId, body);
  }
}
