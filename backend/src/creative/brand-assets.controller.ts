import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProductsService } from '../products/products.service';
import { CreateBrandAssetDto } from './dto/create-brand-asset.dto';
import { PromoteCreativeToBrandAssetDto } from './dto/promote-creative-to-brand-asset.dto';
import { UpdateBrandAssetDto } from './dto/update-brand-asset.dto';
import { BrandAssetsService } from './services/brand-assets.service';

// Brand assets are scoped strictly to organization+product — no campaign
// dimension. Tenant safety is the same cheap Product ownership check used
// everywhere else (never rebuilds Growth Strategy, never calls a provider).
@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/brand-assets')
export class BrandAssetsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly brandAssetsService: BrandAssetsService,
  ) {}

  @Post()
  async create(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Body() body: CreateBrandAssetDto,
  ) {
    await this.productsService.findOne(organizationId, productId, req.user.userId);
    return this.brandAssetsService.create({ organizationId, productId, ...body, userId: req.user.userId });
  }

  @Get()
  async list(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Query('type') type?: string,
  ) {
    await this.productsService.findOne(organizationId, productId, req.user.userId);
    return this.brandAssetsService.list(organizationId, productId, type);
  }

  @Get(':brandAssetId')
  async get(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('brandAssetId') brandAssetId: string,
  ) {
    await this.productsService.findOne(organizationId, productId, req.user.userId);
    return this.brandAssetsService.get(organizationId, productId, brandAssetId);
  }

  @Patch(':brandAssetId')
  async update(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('brandAssetId') brandAssetId: string,
    @Body() body: UpdateBrandAssetDto,
  ) {
    await this.productsService.findOne(organizationId, productId, req.user.userId);
    return this.brandAssetsService.update(organizationId, productId, brandAssetId, body);
  }

  @Delete(':brandAssetId')
  async remove(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('brandAssetId') brandAssetId: string,
  ) {
    await this.productsService.findOne(organizationId, productId, req.user.userId);
    await this.brandAssetsService.remove(organizationId, productId, brandAssetId);
    return { removed: true };
  }

  // Promotes an existing 17C-17E CreativeAsset (referenced only by id) into
  // a reusable BrandAsset — never duplicates binary content, only the safe
  // URL/storageKey reference. Rejects cross-product attempts with the same
  // tenant-mismatch NotFoundException used everywhere else.
  @Post('from-creative/:creativeAssetId')
  async promoteFromCreative(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('creativeAssetId') creativeAssetId: string,
    @Body() body: PromoteCreativeToBrandAssetDto,
  ) {
    await this.productsService.findOne(organizationId, productId, req.user.userId);
    return this.brandAssetsService.promoteFromCreativeAsset({ organizationId, productId, creativeAssetId, ...body, userId: req.user.userId });
  }
}
