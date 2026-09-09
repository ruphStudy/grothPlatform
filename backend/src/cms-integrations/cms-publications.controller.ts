import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProductsService } from '../products/products.service';
import { PublishCmsBlogDto } from './dto/publish-cms-blog.dto';
import { CmsPublicationsService } from './services/cms-publications.service';
import type { CmsPublicationListFilter } from './types/cms-publication.types';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/campaigns/:campaignId/cms-publications')
export class CmsPublicationsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly cmsPublicationsService: CmsPublicationsService,
  ) {}

  @Post(':artifactId/versions/:version')
  async publishBlog(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('artifactId') artifactId: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() body: PublishCmsBlogDto,
  ) {
    await this.productsService.findOne(organizationId, productId, req.user.userId);
    return this.cmsPublicationsService.publishBlog(organizationId, productId, campaignId, artifactId, version, req.user.userId, body);
  }

  @Get()
  async list(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Query('status') status?: CmsPublicationListFilter['status'],
    @Query('localStatus') localStatus?: CmsPublicationListFilter['localStatus'],
    @Query('remoteStatus') remoteStatus?: CmsPublicationListFilter['remoteStatus'],
    @Query('connectionId') connectionId?: string,
    @Query('mode') mode?: CmsPublicationListFilter['mode'],
    @Query('contentArtifactId') contentArtifactId?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    await this.productsService.findOne(organizationId, productId, req.user.userId);
    return this.cmsPublicationsService.list(organizationId, productId, campaignId, { status, localStatus, remoteStatus, connectionId, mode, contentArtifactId, start, end });
  }

  @Post(':publicationId/sync-status')
  async syncStatus(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('publicationId') publicationId: string,
  ) {
    await this.productsService.findOne(organizationId, productId, req.user.userId);
    return this.cmsPublicationsService.syncRemoteStatus(organizationId, productId, campaignId, publicationId);
  }

  @Get(':publicationId')
  async get(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Param('publicationId') publicationId: string,
  ) {
    await this.productsService.findOne(organizationId, productId, req.user.userId);
    return this.cmsPublicationsService.get(organizationId, productId, campaignId, publicationId);
  }
}
