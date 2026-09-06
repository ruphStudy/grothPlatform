import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreativeAssetsService } from './creative-assets.service';
import { BrandAsset, BrandAssetDocument } from '../schemas/brand-asset.schema';
import type { BrandAssetResponse, CreateBrandAssetInput, PromoteCreativeToBrandAssetInput, UpdateBrandAssetInput } from '../types/brand-asset.types';

/**
 * 17F: reusable brand reference material (logos, product images,
 * screenshots, etc.) an organization/product maintains. Storage-agnostic —
 * this only persists a metadata/reference record (URL/storageKey), never a
 * base64 payload, and never generates a new image itself. Scoped strictly
 * to organization+product; there is no campaign dimension here.
 */
@Injectable()
export class BrandAssetsService {
  constructor(
    @InjectModel(BrandAsset.name) private readonly brandAssetModel: Model<BrandAssetDocument>,
    private readonly creativeAssetsService: CreativeAssetsService,
  ) {}

  async create(input: CreateBrandAssetInput): Promise<BrandAssetResponse> {
    if (input.usage?.primary) {
      await this.unsetExistingPrimary(input.organizationId, input.productId, input.type);
    }
    const doc = new this.brandAssetModel({
      organizationId: new Types.ObjectId(input.organizationId),
      productId: new Types.ObjectId(input.productId),
      type: input.type,
      name: input.name,
      description: input.description,
      asset: input.asset,
      usage: input.usage,
      metadata: input.metadata,
      createdBy: input.userId ? new Types.ObjectId(input.userId) : undefined,
    });
    await doc.save();
    return this.toResponse(doc);
  }

  async list(organizationId: string, productId: string, type?: string): Promise<BrandAssetResponse[]> {
    const query: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) };
    if (type) query.type = type;
    const docs = await this.brandAssetModel.find(query).sort({ createdAt: -1 }).exec();
    return docs.map((d) => this.toResponse(d));
  }

  async get(organizationId: string, productId: string, brandAssetId: string): Promise<BrandAssetResponse> {
    const doc = await this.findOwned(organizationId, productId, brandAssetId);
    return this.toResponse(doc);
  }

  async update(organizationId: string, productId: string, brandAssetId: string, input: UpdateBrandAssetInput): Promise<BrandAssetResponse> {
    const doc = await this.findOwned(organizationId, productId, brandAssetId);
    if (input.usage?.primary) {
      await this.unsetExistingPrimary(organizationId, productId, doc.type, brandAssetId);
    }
    if (input.name !== undefined) doc.name = input.name;
    if (input.description !== undefined) doc.description = input.description;
    if (input.usage !== undefined) doc.usage = input.usage;
    if (input.metadata !== undefined) doc.metadata = input.metadata;
    await doc.save();
    return this.toResponse(doc);
  }

  async remove(organizationId: string, productId: string, brandAssetId: string): Promise<void> {
    const doc = await this.findOwned(organizationId, productId, brandAssetId);
    // Only ever removes the BrandAsset reference record — never touches the
    // originating CreativeAsset (see spec item 15).
    await this.brandAssetModel.deleteOne({ _id: doc._id }).exec();
  }

  async promoteFromCreativeAsset(input: PromoteCreativeToBrandAssetInput): Promise<BrandAssetResponse> {
    // listForSourceVersion isn't the right lookup for a single known
    // creative asset id, so we go straight to the shared creative model
    // via CreativeAssetsService's own tenant-safe accessor.
    const creativeAsset = await this.creativeAssetsService.getOwned(input.organizationId, input.productId, input.creativeAssetId);

    return this.create({
      organizationId: input.organizationId,
      productId: input.productId,
      type: input.type,
      name: input.name,
      description: input.description,
      asset: {
        url: creativeAsset.asset.url,
        storageKey: creativeAsset.asset.storageKey,
        mimeType: creativeAsset.asset.mimeType,
        width: creativeAsset.asset.width,
        height: creativeAsset.asset.height,
      },
      metadata: { source: 'generated' },
      userId: input.userId,
    });
  }

  private async findOwned(organizationId: string, productId: string, brandAssetId: string): Promise<BrandAssetDocument> {
    let doc: BrandAssetDocument | null;
    try {
      doc = await this.brandAssetModel.findOne({
        _id: new Types.ObjectId(brandAssetId),
        organizationId: new Types.ObjectId(organizationId),
        productId: new Types.ObjectId(productId),
      });
    } catch {
      throw new NotFoundException('Brand asset not found.');
    }
    if (!doc) throw new NotFoundException('Brand asset not found.');
    return doc;
  }

  private async unsetExistingPrimary(organizationId: string, productId: string, type: string, exceptId?: string): Promise<void> {
    const query: Record<string, unknown> = {
      organizationId: new Types.ObjectId(organizationId),
      productId: new Types.ObjectId(productId),
      type,
      'usage.primary': true,
    };
    if (exceptId) query._id = { $ne: new Types.ObjectId(exceptId) };
    await this.brandAssetModel.updateMany(query, { $set: { 'usage.primary': false } }).exec();
  }

  private toResponse(doc: BrandAssetDocument): BrandAssetResponse {
    return {
      id: doc._id.toString(),
      organizationId: doc.organizationId.toString(),
      productId: doc.productId.toString(),
      type: doc.type,
      name: doc.name,
      description: doc.description,
      asset: { url: doc.asset.url, storageKey: doc.asset.storageKey, mimeType: doc.asset.mimeType, width: doc.asset.width, height: doc.asset.height },
      usage: doc.usage ? { primary: doc.usage.primary, allowedCreativeKinds: doc.usage.allowedCreativeKinds } : undefined,
      metadata: doc.metadata ? { source: doc.metadata.source, altText: doc.metadata.altText } : undefined,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
