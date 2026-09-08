import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ProductsService } from '../../products/products.service';
import { ConnectWordPressDto } from './dto/connect-wordpress.dto';
import { UpdateCmsConnectionDto } from './dto/update-cms-connection.dto';
import { CmsConnectionsService } from './services/cms-connections.service';
import { CmsPublicationsService } from '../services/cms-publications.service';

// Tenant safety: the same cheap Product ownership check used by
// SocialConnectionsController — connections are product-scoped only, no
// campaign dimension (item 11/40 pattern reused from Sprint 18).
@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/cms-connections')
export class CmsConnectionsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly cmsConnectionsService: CmsConnectionsService,
    private readonly cmsPublicationsService: CmsPublicationsService,
  ) {}

  @Post('wordpress')
  async connectWordPress(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Body() body: ConnectWordPressDto,
  ) {
    await this.productsService.findOne(organizationId, productId, req.user.userId);
    return this.cmsConnectionsService.connectWordPress(organizationId, productId, body, req.user.userId);
  }

  @Get()
  async list(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string) {
    await this.productsService.findOne(organizationId, productId, req.user.userId);
    return this.cmsConnectionsService.list(organizationId, productId);
  }

  @Get(':connectionId/categories')
  async categories(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('connectionId') connectionId: string,
  ) {
    await this.productsService.findOne(organizationId, productId, req.user.userId);
    return this.cmsPublicationsService.listCategories(organizationId, productId, connectionId);
  }

  @Get(':connectionId/tags')
  async tags(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('connectionId') connectionId: string,
  ) {
    await this.productsService.findOne(organizationId, productId, req.user.userId);
    return this.cmsPublicationsService.listTags(organizationId, productId, connectionId);
  }

  @Get(':connectionId')
  async get(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('connectionId') connectionId: string,
  ) {
    await this.productsService.findOne(organizationId, productId, req.user.userId);
    return this.cmsConnectionsService.get(organizationId, productId, connectionId);
  }

  @Post(':connectionId/validate')
  async validate(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('connectionId') connectionId: string,
  ) {
    await this.productsService.findOne(organizationId, productId, req.user.userId);
    return this.cmsConnectionsService.validate(organizationId, productId, connectionId);
  }

  @Patch(':connectionId')
  async update(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('connectionId') connectionId: string,
    @Body() body: UpdateCmsConnectionDto,
  ) {
    await this.productsService.findOne(organizationId, productId, req.user.userId);
    return this.cmsConnectionsService.update(organizationId, productId, connectionId, body);
  }

  @Delete(':connectionId')
  async disconnect(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('connectionId') connectionId: string,
  ) {
    await this.productsService.findOne(organizationId, productId, req.user.userId);
    return this.cmsConnectionsService.disconnect(organizationId, productId, connectionId);
  }
}
