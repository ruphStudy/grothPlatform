import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreativeAssetPersistenceError } from '../errors/creative.errors';
import { CreativeAsset, CreativeAssetDocument, CreativeAssetReviewStatus } from '../schemas/creative-asset.schema';
import type { CreativeKind } from '../types/creative.types';
import type { CreateCreativeAssetInput, CreativeAssetListFilter, CreativeAssetResponse } from '../types/creative-asset.types';

/**
 * Thin persistence layer for CreativeAsset (17C). Every explicit "Generate
 * Image" action creates exactly one new document — never overwrites or
 * updates a previous one, so multiple generations for the same source
 * version simply accumulate for later review (17G).
 */
@Injectable()
export class CreativeAssetsService {
  constructor(@InjectModel(CreativeAsset.name) private readonly assetModel: Model<CreativeAssetDocument>) {}

  async createGenerated(input: CreateCreativeAssetInput): Promise<CreativeAssetResponse> {
    const userId = input.userId ? new Types.ObjectId(input.userId) : undefined;
    let doc: CreativeAssetDocument;
    try {
      // `.create()` is typed against Mongoose's Document.model() method and
      // spuriously rejects a plain `model` field in the input object —
      // constructing + saving side-steps that overload collision.
      doc = new this.assetModel({
        organizationId: new Types.ObjectId(input.organizationId),
        productId: new Types.ObjectId(input.productId),
        campaignId: new Types.ObjectId(input.campaignId),
        kind: input.kind,
        source: {
          contentArtifactId: new Types.ObjectId(input.contentArtifactId),
          contentVersionId: new Types.ObjectId(input.contentVersionId),
          contentVersion: input.contentVersion,
          contentKind: input.contentKind,
          platform: input.platform,
        },
        provider: input.provider,
        model: input.model,
        asset: input.asset,
        promptSnapshot: input.promptSnapshot,
        usage: input.usage,
        cost: input.cost,
        status: 'generated',
        createdBy: userId,
      });
      await doc.save();
    } catch {
      throw new CreativeAssetPersistenceError('Failed to persist the generated creative asset.');
    }
    return this.toResponse(doc);
  }

  // `kind` is required — a single ContentVersion (e.g. a blog) can have
  // both `blog_hero` and `thumbnail` assets, and each feature's GET route
  // must only ever return its own kind.
  async listForSourceVersion(organizationId: string, productId: string, campaignId: string, kind: CreativeKind, contentArtifactId: string, contentVersionId: string): Promise<CreativeAssetResponse[]> {
    const docs = await this.assetModel
      .find({
        organizationId: new Types.ObjectId(organizationId),
        productId: new Types.ObjectId(productId),
        campaignId: new Types.ObjectId(campaignId),
        kind,
        'source.contentArtifactId': new Types.ObjectId(contentArtifactId),
        'source.contentVersionId': new Types.ObjectId(contentVersionId),
      })
      .sort({ createdAt: -1 })
      .exec();
    return docs.map((d) => this.toResponse(d));
  }

  // 17G: campaign-wide creative review list across every kind
  // (social_image/blog_hero/thumbnail), newest first. Read-only, no
  // provider call, no per-item enrichment lookups — everything returned
  // already lives on the CreativeAsset document itself.
  async listForCampaign(organizationId: string, productId: string, campaignId: string, filter?: CreativeAssetListFilter): Promise<CreativeAssetResponse[]> {
    const query: Record<string, unknown> = {
      organizationId: new Types.ObjectId(organizationId),
      productId: new Types.ObjectId(productId),
      campaignId: new Types.ObjectId(campaignId),
    };
    if (filter?.kind) query.kind = filter.kind;
    if (filter?.contentArtifactId) query['source.contentArtifactId'] = new Types.ObjectId(filter.contentArtifactId);
    if (filter?.contentVersionId) query['source.contentVersionId'] = new Types.ObjectId(filter.contentVersionId);
    if (filter?.platform) query['source.platform'] = filter.platform;

    let cursor = this.assetModel.find(query).sort({ createdAt: -1 });
    if (filter?.limit) cursor = cursor.limit(filter.limit);
    const docs = await cursor.exec();
    return docs.map((d) => this.toResponse(d));
  }

  // Tenant-safe single lookup constrained to organization+product only (no
  // campaign requirement) — used by 17F's promote-to-brand-asset flow,
  // which addresses a creative asset directly by id.
  async getOwned(organizationId: string, productId: string, creativeAssetId: string): Promise<CreativeAssetResponse> {
    let doc: CreativeAssetDocument | null;
    try {
      doc = await this.assetModel.findOne({
        _id: new Types.ObjectId(creativeAssetId),
        organizationId: new Types.ObjectId(organizationId),
        productId: new Types.ObjectId(productId),
      });
    } catch {
      throw new NotFoundException('Creative asset not found.');
    }
    if (!doc) throw new NotFoundException('Creative asset not found.');
    return this.toResponse(doc);
  }

  // 17G: creative *selection* only (unreviewed/preferred/rejected) —
  // deliberately distinct from Sprint 16 Human Review and Sprint 28
  // approval. Never deletes, never touches the source ContentVersion.
  async updateReviewStatus(organizationId: string, productId: string, campaignId: string, assetId: string, status: CreativeAssetReviewStatus): Promise<CreativeAssetResponse> {
    let doc: CreativeAssetDocument | null;
    try {
      doc = await this.assetModel.findOne({
        _id: new Types.ObjectId(assetId),
        organizationId: new Types.ObjectId(organizationId),
        productId: new Types.ObjectId(productId),
        campaignId: new Types.ObjectId(campaignId),
      });
    } catch {
      throw new NotFoundException('Creative asset not found.');
    }
    if (!doc) throw new NotFoundException('Creative asset not found.');

    // Optional rule (item 28): at most one `preferred` asset per source +
    // kind — enforced only because it's simple and deterministic.
    if (status === 'preferred') {
      await this.assetModel
        .updateMany(
          {
            organizationId: doc.organizationId,
            productId: doc.productId,
            campaignId: doc.campaignId,
            kind: doc.kind,
            'source.contentArtifactId': doc.source.contentArtifactId,
            'source.contentVersionId': doc.source.contentVersionId,
            _id: { $ne: doc._id },
            reviewStatus: 'preferred',
          },
          { $set: { reviewStatus: 'unreviewed' } },
        )
        .exec();
    }

    doc.reviewStatus = status;
    await doc.save();
    return this.toResponse(doc);
  }

  private toResponse(doc: CreativeAssetDocument): CreativeAssetResponse {
    return {
      id: doc._id.toString(),
      kind: doc.kind,
      source: {
        contentArtifactId: doc.source.contentArtifactId.toString(),
        contentVersionId: doc.source.contentVersionId.toString(),
        contentVersion: doc.source.contentVersion,
        contentKind: doc.source.contentKind,
        platform: doc.source.platform,
      },
      provider: doc.provider,
      model: doc.model,
      asset: {
        type: doc.asset.type,
        url: doc.asset.url,
        storageKey: doc.asset.storageKey,
        mimeType: doc.asset.mimeType,
        width: doc.asset.width,
        height: doc.asset.height,
      },
      promptSnapshot: {
        promptVersion: doc.promptSnapshot.promptVersion,
        aspectRatio: doc.promptSnapshot.aspectRatio,
        styleDirection: doc.promptSnapshot.styleDirection,
        textOverlayEnabled: doc.promptSnapshot.textOverlayEnabled,
      },
      usage: doc.usage ? { imageCount: doc.usage.imageCount } : undefined,
      cost: doc.cost ? { currency: doc.cost.currency, estimated: doc.cost.estimated } : undefined,
      status: doc.status,
      reviewStatus: doc.reviewStatus ?? 'unreviewed',
      createdAt: doc.createdAt as Date,
    };
  }
}
