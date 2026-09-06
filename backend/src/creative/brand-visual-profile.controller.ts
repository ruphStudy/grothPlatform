import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProductsService } from '../products/products.service';
import { UpdateBrandVisualProfileDto } from './dto/brand-visual-profile.dto';
import { BrandVisualProfileService } from './services/brand-visual-profile.service';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/brand-visual-profile')
export class BrandVisualProfileController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly brandVisualProfileService: BrandVisualProfileService,
  ) {}

  @Get()
  async get(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string) {
    await this.productsService.findOne(organizationId, productId, req.user.userId);
    return this.brandVisualProfileService.get(organizationId, productId);
  }

  @Put()
  async upsert(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Body() body: UpdateBrandVisualProfileDto,
  ) {
    await this.productsService.findOne(organizationId, productId, req.user.userId);
    return this.brandVisualProfileService.upsert(organizationId, productId, body);
  }
}
