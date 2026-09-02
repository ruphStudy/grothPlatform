import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  create(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.create(organizationId, req.user.userId, dto);
  }

  @Get()
  findAll(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string) {
    return this.productsService.findAll(organizationId, req.user.userId);
  }

  @Get(':productId')
  findOne(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    return this.productsService.findOne(organizationId, productId, req.user.userId);
  }

  @Patch(':productId')
  update(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(organizationId, productId, req.user.userId, dto);
  }
}
