import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CampaignsService } from '../campaigns/campaigns.service';
import { SocialImageGenerationOptionsDto } from './dto/social-image-generation-options.dto';
import { SocialImageService } from './services/social-image.service';

// Tenant safety for the GET route is the same cheap Campaign ownership
// check used by 15J's read endpoints (content-artifacts.controller.ts) —
// never rebuilds Growth Strategy, never calls the provider. The POST route
// delegates its own (paid-action) gating to SocialImageService.
@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/campaigns/:campaignId/creative')
export class CreativeController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly socialImageService: SocialImageService,
  ) {}

  @Post('social-image/:artifactId/versions/:version')
  generateSocialImage(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('artifactId') artifactId: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() body: SocialImageGenerationOptionsDto,
  ) {
    return this.socialImageService.generate({
      organizationId,
      productId,
      campaignId,
      artifactId,
      version,
      userId: req.user.userId,
      options: body,
    });
  }

  @Get('social-image/:artifactId/versions/:version')
  async listSocialImages(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('artifactId') artifactId: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    await this.campaignsService.findOne(organizationId, productId, campaignId, req.user.userId);
    return this.socialImageService.listForSourceVersion(organizationId, productId, campaignId, artifactId, version);
  }
}
