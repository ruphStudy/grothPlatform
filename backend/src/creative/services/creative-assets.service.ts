import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreativeAssetPersistenceError } from '../errors/creative.errors';
import { CreativeAsset, CreativeAssetDocument } from '../schemas/creative-asset.schema';
import type { CreativeKind } from '../types/creative.types';
import type { CreateCreativeAssetInput, CreativeAssetResponse } from '../types/creative-asset.types';

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
      createdAt: doc.createdAt as Date,
    };
  }
}
