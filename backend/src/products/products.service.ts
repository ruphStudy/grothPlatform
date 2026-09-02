import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OrganizationsService } from '../organizations/organizations.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product, ProductDocument } from './schemas/product.schema';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    private readonly organizationsService: OrganizationsService,
  ) {}

  private toSafeProduct(product: ProductDocument) {
    return {
      id: product._id,
      organizationId: product.organizationId,
      name: product.name,
      slug: product.slug,
      websiteUrl: product.websiteUrl,
      shortDescription: product.shortDescription,
      productType: product.productType,
      primaryGoal: product.primaryGoal,
      targetMarkets: product.targetMarkets,
      status: product.status,
      createdAt: (product as any).createdAt,
      updatedAt: (product as any).updatedAt,
    };
  }

  private async ensureUniqueSlug(organizationId: string, base: string, excludeId?: string): Promise<string> {
    let slug = base;
    let counter = 2;
    while (
      await this.productModel.exists({
        organizationId: new Types.ObjectId(organizationId),
        slug,
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
      })
    ) {
      slug = `${base}-${counter}`;
      counter += 1;
    }
    return slug;
  }

  private async findProductDoc(organizationId: string, productId: string) {
    if (!Types.ObjectId.isValid(productId)) {
      throw new NotFoundException('Product not found');
    }
    const product = await this.productModel
      .findOne({ _id: productId, organizationId: new Types.ObjectId(organizationId) })
      .exec();
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  async create(organizationId: string, ownerUserId: string, dto: CreateProductDto) {
    await this.organizationsService.findOneOwned(organizationId, ownerUserId);

    const baseSlug = slugify(dto.name);
    const slug = await this.ensureUniqueSlug(organizationId, baseSlug);
    const product = await new this.productModel({
      organizationId: new Types.ObjectId(organizationId),
      name: dto.name,
      slug,
      websiteUrl: dto.websiteUrl,
      shortDescription: dto.shortDescription,
      productType: dto.productType,
      primaryGoal: dto.primaryGoal,
      targetMarkets: dto.targetMarkets ?? [],
      status: 'active',
    }).save();
    return this.toSafeProduct(product);
  }

  async findAll(organizationId: string, ownerUserId: string) {
    await this.organizationsService.findOneOwned(organizationId, ownerUserId);
    const products = await this.productModel.find({ organizationId: new Types.ObjectId(organizationId) }).exec();
    return products.map((product) => this.toSafeProduct(product));
  }

  async findOne(organizationId: string, productId: string, ownerUserId: string) {
    await this.organizationsService.findOneOwned(organizationId, ownerUserId);
    const product = await this.findProductDoc(organizationId, productId);
    return this.toSafeProduct(product);
  }

  async update(organizationId: string, productId: string, ownerUserId: string, dto: UpdateProductDto) {
    await this.organizationsService.findOneOwned(organizationId, ownerUserId);
    const product = await this.findProductDoc(organizationId, productId);

    if (dto.name && dto.name !== product.name) {
      const baseSlug = slugify(dto.name);
      product.slug = await this.ensureUniqueSlug(organizationId, baseSlug, String(product._id));
      product.name = dto.name;
    }

    if (dto.websiteUrl !== undefined) product.websiteUrl = dto.websiteUrl;
    if (dto.shortDescription !== undefined) product.shortDescription = dto.shortDescription;
    if (dto.productType !== undefined) product.productType = dto.productType;
    if (dto.primaryGoal !== undefined) product.primaryGoal = dto.primaryGoal;
    if (dto.targetMarkets !== undefined) product.targetMarkets = dto.targetMarkets;
    if (dto.status !== undefined) product.status = dto.status;

    await product.save();
    return this.toSafeProduct(product);
  }
}
