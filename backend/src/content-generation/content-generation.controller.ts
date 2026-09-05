import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BlogGenerationService } from './adapters/blog-generation.service';
import { FacebookGenerationService } from './adapters/facebook-generation.service';
import { InstagramGenerationService } from './adapters/instagram-generation.service';
import { LinkedInGenerationService } from './adapters/linkedin-generation.service';
import { NewsletterGenerationService } from './adapters/newsletter-generation.service';
import { XGenerationService } from './adapters/x-generation.service';
import { BlogGenerationOptionsDto } from './dto/blog-generation-options.dto';
import { FacebookGenerationOptionsDto } from './dto/facebook-generation-options.dto';
import { InstagramGenerationOptionsDto } from './dto/instagram-generation-options.dto';
import { LinkedInGenerationOptionsDto } from './dto/linkedin-generation-options.dto';
import { NewsletterGenerationOptionsDto } from './dto/newsletter-generation-options.dto';
import { XGenerationOptionsDto } from './dto/x-generation-options.dto';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/campaigns/:campaignId/content-generation')
export class ContentGenerationController {
  constructor(
    private readonly blogGenerationService: BlogGenerationService,
    private readonly linkedInGenerationService: LinkedInGenerationService,
    private readonly xGenerationService: XGenerationService,
    private readonly facebookGenerationService: FacebookGenerationService,
    private readonly instagramGenerationService: InstagramGenerationService,
    private readonly newsletterGenerationService: NewsletterGenerationService,
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

  @Post('x/:socialCalendarItemId')
  generateXDraft(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('socialCalendarItemId') socialCalendarItemId: string,
    @Body() body: XGenerationOptionsDto,
  ) {
    return this.xGenerationService.generateXDraft(organizationId, productId, campaignId, socialCalendarItemId, req.user.userId, body);
  }

  @Post('facebook/:socialCalendarItemId')
  generateFacebookDraft(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('socialCalendarItemId') socialCalendarItemId: string,
    @Body() body: FacebookGenerationOptionsDto,
  ) {
    return this.facebookGenerationService.generateFacebookDraft(organizationId, productId, campaignId, socialCalendarItemId, req.user.userId, body);
  }

  @Post('instagram/:socialCalendarItemId')
  generateInstagramCaption(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('socialCalendarItemId') socialCalendarItemId: string,
    @Body() body: InstagramGenerationOptionsDto,
  ) {
    return this.instagramGenerationService.generateInstagramCaption(organizationId, productId, campaignId, socialCalendarItemId, req.user.userId, body);
  }

  @Post('newsletter/:sourceType/:sourceId')
  generateNewsletterDraft(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('sourceType') sourceType: string,
    @Param('sourceId') sourceId: string,
    @Body() body: NewsletterGenerationOptionsDto,
  ) {
    return this.newsletterGenerationService.generateNewsletterDraft(organizationId, productId, campaignId, sourceType, sourceId, req.user.userId, body);
  }
}
