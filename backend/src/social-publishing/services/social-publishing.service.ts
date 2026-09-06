import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CampaignReviewService } from '../../campaigns/campaign-review.service';
import { CampaignsService } from '../../campaigns/campaigns.service';
import { CreativeAssetsService } from '../../creative/services/creative-assets.service';
import { ContentVersioningService } from '../../content-generation/services/content-versioning.service';
import type { ContentGenerationKind } from '../../content-generation/types/content-generation.types';
import type { ContentVersionDetail } from '../../content-generation/types/content-versioning.types';
import { GrowthStrategyReviewService } from '../../growth-strategy/growth-strategy-review.service';
import { ProductsService } from '../../products/products.service';
import { SocialCapabilityUnsupportedError, SocialProviderError } from '../../social-integrations/errors/social.errors';
import { SocialEngineService } from '../../social-integrations/engine/social-engine.service';
import { SocialConnectionsService } from '../../social-integrations/connections/services/social-connections.service';
import { SocialConnectionDocument } from '../../social-integrations/connections/schemas/social-connection.schema';
import type { SocialPlatform, SocialPublishRequest } from '../../social-integrations/types/social.types';
import { PublicationReviewStatusUnavailableError } from '../errors/social-publishing.errors';
import { SocialPublication, SocialPublicationDocument } from '../schemas/social-publication.schema';
import type { PublishSocialContentInput, SocialPublicationListFilter, SocialPublicationResponse } from '../types/social-publishing.types';

const CONTENT_KIND_TO_PLATFORM: Partial<Record<ContentGenerationKind, SocialPlatform>> = {
  linkedin: 'linkedin',
  x: 'x',
  facebook: 'facebook',
  instagram: 'instagram',
};

interface PublishPlan {
  mode: 'single' | 'thread' | 'image';
  texts: string[];
  mediaUrl?: string;
}

/**
 * 19A/19B: the ONE place that orchestrates immediate social publishing.
 * Never lives inside a platform adapter/controller — it resolves the
 * persisted ContentVersion, applies the same paid/external-action gates
 * as every other Sprint 15-18 workflow, resolves the connection/creative
 * server-side, and calls SocialEngineService.publish() the minimum number
 * of times the content actually requires (exactly one, except an X
 * thread's inherently sequential per-post calls).
 */
@Injectable()
export class SocialPublishingService {
  private readonly logger = new Logger(SocialPublishingService.name);

  constructor(
    @InjectModel(SocialPublication.name) private readonly publicationModel: Model<SocialPublicationDocument>,
    private readonly campaignsService: CampaignsService,
    private readonly campaignReviewService: CampaignReviewService,
    private readonly growthStrategyReviewService: GrowthStrategyReviewService,
    private readonly productsService: ProductsService,
    private readonly versioningService: ContentVersioningService,
    private readonly creativeAssetsService: CreativeAssetsService,
    private readonly socialEngine: SocialEngineService,
    private readonly socialConnectionsService: SocialConnectionsService,
  ) {}

  async publish(input: PublishSocialContentInput): Promise<SocialPublicationResponse> {
    // Tenant-safe load first — throws NotFoundException on any org/product/
    // campaign/artifact/version mismatch, before any other work.
    const sourceVersion = await this.versioningService.getVersion(input.organizationId, input.productId, input.campaignId, input.artifactId, input.version);

    const platform = CONTENT_KIND_TO_PLATFORM[sourceVersion.kind];
    if (!platform) {
      throw new BadRequestException('Social publishing is only supported for LinkedIn, X, Facebook, or Instagram content.');
    }

    // Fast path (item 12/D): an already-completed or in-flight request for
    // the same idempotency key returns the existing record — no provider
    // call, no duplicate post.
    const existing = await this.publicationModel.findOne({
      organizationId: new Types.ObjectId(input.organizationId),
      productId: new Types.ObjectId(input.productId),
      platform,
      idempotencyKey: input.idempotencyKey,
    });
    if (existing) {
      this.assertSameRequest(existing, sourceVersion, input); // item 13/E
      return this.toResponse(existing);
    }

    // Same paid/external-action gates as 15C-15I/16H/17C-17E.
    await this.assertExternalActionApproved(input);

    // Human Review gate (item 28/29) — never publish with no review result,
    // never publish when review_required.
    if (!sourceVersion.humanReview) {
      throw new PublicationReviewStatusUnavailableError('Human Review has not been evaluated for this content yet; publishing is blocked until it has.');
    }
    if (sourceVersion.humanReview.decision === 'review_required') {
      throw new ConflictException('Human review is required before this content can be published.');
    }
    // review_recommended / auto_clear both proceed — auto_clear only means
    // the mandatory-review threshold wasn't triggered, never that a human
    // approved it; the frontend still shows a warning for review_recommended.

    // Connection resolution (item 8) — platform match + active status.
    const connectionDoc = await this.socialConnectionsService.findOwnedDocument(input.organizationId, input.productId, input.connectionId);
    if (connectionDoc.platform !== platform) {
      throw new BadRequestException(`The selected connection is for ${connectionDoc.platform}, not ${platform}.`);
    }
    if (connectionDoc.status !== 'active') {
      throw new ConflictException('The selected social connection is not active.');
    }

    // Creative resolution (item 27) — tenant/campaign/source-linked, and
    // never a rejected asset (item 31/T).
    let creativeAssetId: string | undefined;
    let creativeImageUrl: string | undefined;
    if (input.creativeAssetId) {
      const creative = await this.creativeAssetsService.getOwnedForCampaign(input.organizationId, input.productId, input.campaignId, input.creativeAssetId);
      if (creative.source.contentArtifactId !== input.artifactId || creative.source.contentVersionId !== sourceVersion.id) {
        throw new BadRequestException('The selected creative asset does not belong to this content version.');
      }
      if (creative.reviewStatus === 'rejected') {
        throw new ConflictException('This creative asset has been marked rejected and cannot be published.');
      }
      creativeAssetId = creative.id;
      creativeImageUrl = creative.asset.url;
    }

    const plan = this.buildPublishPlan(platform, sourceVersion, creativeImageUrl, input.creativeAssetId);
    this.assertCapabilityForPlan(platform, plan);

    // Claim the idempotency key atomically via the unique index — under a
    // genuine race, only one request wins create(); the loser returns the
    // winner's record instead of calling the provider again.
    let doc: SocialPublicationDocument;
    try {
      doc = await this.createPublicationRecord(input, platform, sourceVersion, plan);
    } catch {
      const raced = await this.publicationModel.findOne({
        organizationId: new Types.ObjectId(input.organizationId),
        productId: new Types.ObjectId(input.productId),
        platform,
        idempotencyKey: input.idempotencyKey,
      });
      if (raced) {
        this.assertSameRequest(raced, sourceVersion, input);
        return this.toResponse(raced);
      }
      throw new ConflictException('Failed to create the publication record.');
    }

    const accessToken = await this.socialConnectionsService.ensureValidAccessToken(connectionDoc);

    if (plan.mode === 'thread') {
      await this.publishThread(doc, platform, connectionDoc, accessToken, plan);
    } else {
      await this.publishSingle(doc, platform, connectionDoc, accessToken, plan);
    }
    return this.toResponse(doc);
  }

  async list(organizationId: string, productId: string, campaignId: string, filter?: SocialPublicationListFilter): Promise<SocialPublicationResponse[]> {
    const query: Record<string, unknown> = {
      organizationId: new Types.ObjectId(organizationId),
      productId: new Types.ObjectId(productId),
      campaignId: new Types.ObjectId(campaignId),
    };
    if (filter?.platform) query.platform = filter.platform;
    if (filter?.status) query.status = filter.status;
    if (filter?.connectionId) query.connectionId = new Types.ObjectId(filter.connectionId);
    if (filter?.contentArtifactId) query.contentArtifactId = new Types.ObjectId(filter.contentArtifactId);

    let cursor = this.publicationModel.find(query).sort({ createdAt: -1 });
    if (filter?.limit) cursor = cursor.limit(filter.limit);
    const docs = await cursor.exec();
    return docs.map((d) => this.toResponse(d));
  }

  async get(organizationId: string, productId: string, campaignId: string, publicationId: string): Promise<SocialPublicationResponse> {
    const doc = await this.findOwned(organizationId, productId, campaignId, publicationId);
    return this.toResponse(doc);
  }

  // ---------------------------------------------------------------------
  // Publish execution
  // ---------------------------------------------------------------------

  private async publishSingle(doc: SocialPublicationDocument, platform: SocialPlatform, connection: SocialConnectionDocument, accessToken: string, plan: PublishPlan): Promise<void> {
    const startedAt = Date.now();
    try {
      const request: SocialPublishRequest = {
        accessToken,
        externalAccountId: connection.externalAccountId,
        text: plan.texts[0],
        media: plan.mode === 'image' && plan.mediaUrl ? { type: 'image', url: plan.mediaUrl } : undefined,
      };
      const result = await this.socialEngine.publish(platform, request);
      if (!result.providerPostId) {
        throw new SocialProviderError('social_provider_request_failed', 'The provider did not return a post id.');
      }
      doc.status = 'published';
      doc.providerPostId = result.providerPostId;
      doc.providerPostIds = [result.providerPostId];
      doc.providerPostUrl = result.providerPostUrl;
      doc.publishedAt = result.publishedAt ?? new Date();
      this.logOutcome(platform, doc._id.toString(), Date.now() - startedAt, true);
    } catch (err) {
      doc.status = 'failed';
      doc.errorCode = err instanceof SocialProviderError || err instanceof SocialCapabilityUnsupportedError ? (err as { code?: string }).code ?? 'social_provider_request_failed' : 'social_provider_request_failed';
      this.logOutcome(platform, doc._id.toString(), Date.now() - startedAt, false);
    }
    doc.lastAttemptAt = new Date();
    await doc.save();
  }

  // 19B item 19: the only exception to "one provider operation" — a thread
  // inherently requires one provider call per post. Publishes
  // sequentially, uses each post's id as the next post's reply parent,
  // stops immediately on the first failure, and records exactly what
  // actually succeeded (item 20).
  private async publishThread(doc: SocialPublicationDocument, platform: SocialPlatform, connection: SocialConnectionDocument, accessToken: string, plan: PublishPlan): Promise<void> {
    const postIds: string[] = [];
    let inReplyToId: string | undefined;
    let failureCode: string | undefined;

    for (const text of plan.texts) {
      const startedAt = Date.now();
      try {
        const result = await this.socialEngine.publish(platform, { accessToken, externalAccountId: connection.externalAccountId, text, inReplyToId });
        if (!result.providerPostId) {
          throw new SocialProviderError('social_provider_request_failed', 'The provider did not return a post id.');
        }
        postIds.push(result.providerPostId);
        inReplyToId = result.providerPostId;
        this.logOutcome(platform, doc._id.toString(), Date.now() - startedAt, true);
      } catch (err) {
        failureCode = err instanceof SocialProviderError ? err.code : 'social_provider_request_failed';
        this.logOutcome(platform, doc._id.toString(), Date.now() - startedAt, false);
        break; // no auto-retry on the failed segment (item 19)
      }
    }

    doc.providerPostIds = postIds;
    doc.providerPostId = postIds[0];
    if (failureCode || postIds.length < plan.texts.length) {
      doc.status = 'failed';
      doc.errorCode = failureCode ?? 'social_provider_request_failed';
    } else {
      doc.status = 'published';
      doc.publishedAt = new Date();
    }
    doc.lastAttemptAt = new Date();
    await doc.save();
  }

  // ---------------------------------------------------------------------
  // Validation helpers
  // ---------------------------------------------------------------------

  // Same paid/external-action gates as 15C-15I / 16H / 17C-17E.
  private async assertExternalActionApproved(input: PublishSocialContentInput): Promise<void> {
    const campaignApproval = await this.campaignReviewService.isCampaignApprovedForCurrentVersion(input.organizationId, input.productId, input.campaignId, input.userId);
    if (!campaignApproval.approved) {
      throw new ConflictException(campaignApproval.reason ?? 'Approve this campaign before publishing.');
    }
    const strategyReview = await this.growthStrategyReviewService.getReview(input.organizationId, input.productId, input.userId);
    if (strategyReview.status !== 'approved') {
      throw new ConflictException('Approve the current Growth Strategy before publishing.');
    }
    const product = await this.productsService.findOne(input.organizationId, input.productId, input.userId);
    const productUpdatedAt: Date = (product as { updatedAt?: Date }).updatedAt ?? new Date(0);
    const strategyStillApproved = await this.growthStrategyReviewService.isStrategyApprovedForCurrentVersion(input.organizationId, input.productId, input.userId, productUpdatedAt);
    if (!strategyStillApproved) {
      throw new ConflictException('The product has changed since the Growth Strategy was last approved. Review and approve it again before publishing.');
    }
  }

  // Extracts the exact user-visible copy for the target platform (item
  // 18/19/23/24) — never accepted from the client, always derived from the
  // already-persisted, already-approved ContentVersion payload.
  private buildPublishPlan(platform: SocialPlatform, sourceVersion: ContentVersionDetail, creativeImageUrl: string | undefined, creativeAssetId: string | undefined): PublishPlan {
    if (platform === 'instagram') {
      if (!creativeAssetId) {
        throw new BadRequestException('Instagram publishing requires an eligible image creative.');
      }
      if (!creativeImageUrl) {
        throw new ConflictException('The selected creative asset has no publicly accessible image URL.');
      }
      return { mode: 'image', texts: [sourceVersion.payload.content ?? ''], mediaUrl: creativeImageUrl };
    }

    // LinkedIn/X/Facebook: text-only in 19B — a supplied creative is
    // rejected cleanly rather than silently ignored (item 26).
    if (creativeAssetId) {
      throw new SocialCapabilityUnsupportedError(`${platform} image publishing is not supported yet — publish without a creative asset.`);
    }

    if (platform === 'x' && sourceVersion.payload.mode === 'thread') {
      const posts = sourceVersion.payload.posts ?? [];
      if (posts.length === 0) {
        throw new BadRequestException('This X thread has no posts to publish.');
      }
      return { mode: 'thread', texts: posts };
    }

    const text = sourceVersion.payload.content;
    if (!text) {
      throw new BadRequestException('This content has no publishable text.');
    }
    return { mode: 'single', texts: [text] };
  }

  private assertCapabilityForPlan(platform: SocialPlatform, plan: PublishPlan): void {
    const provider = this.socialEngine.resolveProvider(platform);
    const capabilities = provider.getCapabilities();
    const required = plan.mode === 'image' ? 'publishImage' : 'publishText';
    if (!capabilities[required]) {
      throw new SocialCapabilityUnsupportedError(`The ${platform} provider does not support publishing yet.`);
    }
  }

  private async createPublicationRecord(input: PublishSocialContentInput, platform: SocialPlatform, sourceVersion: ContentVersionDetail, plan: PublishPlan): Promise<SocialPublicationDocument> {
    const doc = new this.publicationModel({
      organizationId: new Types.ObjectId(input.organizationId),
      productId: new Types.ObjectId(input.productId),
      campaignId: new Types.ObjectId(input.campaignId),
      platform,
      connectionId: new Types.ObjectId(input.connectionId),
      contentArtifactId: new Types.ObjectId(input.artifactId),
      contentVersionId: new Types.ObjectId(sourceVersion.id),
      contentVersion: sourceVersion.version,
      creativeAssetId: input.creativeAssetId ? new Types.ObjectId(input.creativeAssetId) : undefined,
      status: 'publishing',
      providerName: platform,
      contentSnapshot: {
        kind: sourceVersion.kind,
        text: plan.texts.join('\n\n'),
        mediaType: plan.mode === 'image' ? 'image' : undefined,
      },
      attemptCount: 1,
      idempotencyKey: input.idempotencyKey,
      createdBy: new Types.ObjectId(input.userId),
    });
    await doc.save();
    return doc;
  }

  // Item 13: reusing the same idempotency key for genuinely different
  // content/connection/creative is a conflict, not a silent duplicate.
  private assertSameRequest(existing: SocialPublicationDocument, sourceVersion: ContentVersionDetail, input: PublishSocialContentInput): void {
    const sameContent = existing.contentVersionId.toString() === sourceVersion.id;
    const sameConnection = existing.connectionId.toString() === input.connectionId;
    const sameCreative = (existing.creativeAssetId?.toString() ?? undefined) === (input.creativeAssetId ?? undefined);
    if (!sameContent || !sameConnection || !sameCreative) {
      throw new ConflictException('This idempotency key was already used for a different publication request.');
    }
  }

  private async findOwned(organizationId: string, productId: string, campaignId: string, publicationId: string): Promise<SocialPublicationDocument> {
    let doc: SocialPublicationDocument | null;
    try {
      doc = await this.publicationModel.findOne({
        _id: new Types.ObjectId(publicationId),
        organizationId: new Types.ObjectId(organizationId),
        productId: new Types.ObjectId(productId),
        campaignId: new Types.ObjectId(campaignId),
      });
    } catch {
      throw new NotFoundException('Social publication not found.');
    }
    if (!doc) throw new NotFoundException('Social publication not found.');
    return doc;
  }

  private toResponse(doc: SocialPublicationDocument): SocialPublicationResponse {
    return {
      id: doc._id.toString(),
      platform: doc.platform,
      connectionId: doc.connectionId.toString(),
      contentArtifactId: doc.contentArtifactId.toString(),
      contentVersionId: doc.contentVersionId.toString(),
      contentVersion: doc.contentVersion,
      creativeAssetId: doc.creativeAssetId?.toString(),
      status: doc.status,
      providerName: doc.providerName,
      providerPostId: doc.providerPostId,
      providerPostUrl: doc.providerPostUrl,
      providerPostIds: doc.providerPostIds,
      contentSnapshot: { kind: doc.contentSnapshot.kind, text: doc.contentSnapshot.text, mediaType: doc.contentSnapshot.mediaType },
      publishedAt: doc.publishedAt,
      attemptCount: doc.attemptCount,
      lastAttemptAt: doc.lastAttemptAt,
      errorCode: doc.errorCode,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }

  // Logs publicationId/platform/latency/success only — never the
  // published text, a token, or a raw provider payload (item 47).
  private logOutcome(platform: SocialPlatform, publicationId: string, latencyMs: number, success: boolean): void {
    this.logger.log(`platform=${platform} publicationId=${publicationId} success=${success} latencyMs=${latencyMs}`);
  }
}
