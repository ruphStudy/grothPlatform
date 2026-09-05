import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ContentVersionPersistenceError } from '../errors/content-generation.errors';
import { ContentArtifact, ContentArtifactDocument } from '../schemas/content-artifact.schema';
import { ContentVersion, ContentVersionDocument } from '../schemas/content-version.schema';
import { ContentGroundingService } from './content-grounding.service';
import { extractGroundableText } from '../shared/content-grounding-text.util';
import type { ContentGenerationKind } from '../types/content-generation.types';
import type {
  ArtifactWithLatestVersion,
  ContentArtifactResponse,
  ContentVersionDetail,
  ContentVersionSummary,
  SaveGeneratedVersionInput,
  SavedVersionResult,
} from '../types/content-versioning.types';

const DEFAULT_HISTORY_LIMIT = 20;
const DEFAULT_HISTORY_MAX_LIMIT = 100;

export interface ArtifactFilter {
  kind?: string;
  sourceType?: string;
  sourceId?: string;
}

/**
 * Persists every successful generation as an immutable ContentVersion under
 * a stable ContentArtifact (one per organization/product/campaign/kind/
 * sourceType/sourceId). Regeneration never creates a new artifact — it
 * only appends a new version and advances the artifact's latest pointers.
 *
 * Concurrency safety: the artifact's `latestVersion` is advanced via a
 * single atomic `findOneAndUpdate` `$inc`, so two simultaneous requests for
 * the same artifact can never receive the same version number — MongoDB
 * serializes `$inc` on one document. The unique {artifactId, version} index
 * is a second safety net. This repo's standalone (non-replica-set) MongoDB
 * does not support multi-document transactions, so the increment and the
 * version-document insert are two separate operations: if the insert fails
 * after the increment succeeds, `latestVersion` can be left ahead of the
 * last actually-persisted version (a documented gap), and a clear
 * `ContentVersionPersistenceError` is thrown rather than reporting success.
 */
@Injectable()
export class ContentVersioningService {
  private readonly logger = new Logger(ContentVersioningService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(ContentArtifact.name) private readonly artifactModel: Model<ContentArtifactDocument>,
    @InjectModel(ContentVersion.name) private readonly versionModel: Model<ContentVersionDocument>,
    private readonly groundingService: ContentGroundingService,
  ) {}

  async saveGeneratedVersion(input: SaveGeneratedVersionInput): Promise<SavedVersionResult> {
    const organizationId = new Types.ObjectId(input.organizationId);
    const productId = new Types.ObjectId(input.productId);
    const campaignId = new Types.ObjectId(input.campaignId);
    const userId = input.userId ? new Types.ObjectId(input.userId) : undefined;

    const artifact = await this.artifactModel.findOneAndUpdate(
      { organizationId, productId, campaignId, kind: input.kind, sourceType: input.sourceType, sourceId: input.sourceId },
      { $inc: { latestVersion: 1 }, $setOnInsert: { createdBy: userId }, $set: { updatedBy: userId } },
      { upsert: true, new: true },
    );

    const version = artifact.latestVersion;

    let versionDoc: ContentVersionDocument;
    try {
      versionDoc = await this.versionModel.create({
        artifactId: artifact._id,
        organizationId,
        productId,
        campaignId,
        version,
        kind: input.kind,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        payload: input.payload,
        generationMetadata: input.generationMetadata,
        generationOptions: input.generationOptions,
        sourceSnapshot: input.sourceSnapshot,
        groundingEvidenceSnapshot: input.groundingEvidenceSnapshot,
        createdBy: userId,
      });
    } catch {
      throw new ContentVersionPersistenceError(`Failed to persist generated content version ${version} for artifact ${artifact._id.toString()}.`);
    }

    await this.artifactModel.updateOne({ _id: artifact._id }, { $set: { latestVersionId: versionDoc._id } });

    // Deterministic, no-paid-API grounding runs automatically after every
    // successful save. A failure here must never discard the generated
    // version — it's logged and surfaced as a warning instead.
    let grounding: SavedVersionResult['grounding'];
    try {
      const result = await this.groundingService.analyzeContentVersion({
        contentVersionId: versionDoc._id.toString(),
        artifactId: artifact._id.toString(),
        organizationId: input.organizationId,
        productId: input.productId,
        campaignId: input.campaignId,
        text: extractGroundableText(input.payload),
        evidence: input.groundingEvidenceSnapshot,
      });
      grounding = { status: result.status, score: result.score, unsupportedClaimCount: result.unsupportedClaimCount, uncertainClaimCount: result.uncertainClaimCount };
    } catch (err) {
      this.logger.warn(`contentVersionId=${versionDoc._id.toString()} kind=grounding success=false reason=${(err as Error).message}`);
    }

    return { artifactId: artifact._id.toString(), versionId: versionDoc._id.toString(), version, grounding };
  }

  async listArtifacts(organizationId: string, productId: string, campaignId: string, filter?: ArtifactFilter): Promise<ContentArtifactResponse[]> {
    const query: Record<string, unknown> = {
      organizationId: new Types.ObjectId(organizationId),
      productId: new Types.ObjectId(productId),
      campaignId: new Types.ObjectId(campaignId),
    };
    if (filter?.kind) query.kind = filter.kind;
    if (filter?.sourceType) query.sourceType = filter.sourceType;
    if (filter?.sourceId) query.sourceId = filter.sourceId;

    const artifacts = await this.artifactModel.find(query).sort({ updatedAt: -1 }).exec();
    return artifacts.map((a) => this.toArtifactResponse(a));
  }

  async getArtifactById(organizationId: string, productId: string, campaignId: string, artifactId: string): Promise<ContentArtifactDocument> {
    let artifact: ContentArtifactDocument | null;
    try {
      artifact = await this.artifactModel.findOne({
        _id: new Types.ObjectId(artifactId),
        organizationId: new Types.ObjectId(organizationId),
        productId: new Types.ObjectId(productId),
        campaignId: new Types.ObjectId(campaignId),
      });
    } catch {
      throw new NotFoundException('Content artifact not found.');
    }
    if (!artifact) throw new NotFoundException('Content artifact not found.');
    return artifact;
  }

  async listVersions(
    organizationId: string,
    productId: string,
    campaignId: string,
    artifactId: string,
    options?: { limit?: number; beforeVersion?: number },
  ): Promise<ContentVersionSummary[]> {
    const artifact = await this.getArtifactById(organizationId, productId, campaignId, artifactId);
    const limit = Math.min(options?.limit ?? this.getDefaultHistoryLimit(), this.getMaxHistoryLimit());

    const query: Record<string, unknown> = { artifactId: artifact._id };
    if (options?.beforeVersion !== undefined) query.version = { $lt: options.beforeVersion };

    const versions = await this.versionModel.find(query).sort({ version: -1 }).limit(limit).exec();
    const summaries = versions.map((v) => this.toVersionSummary(v));
    const groundingByVersionId = await this.groundingService.getSummariesByVersionIds(summaries.map((s) => s.id));
    return summaries.map((s) => ({ ...s, grounding: groundingByVersionId.get(s.id) }));
  }

  async getVersion(organizationId: string, productId: string, campaignId: string, artifactId: string, version: number): Promise<ContentVersionDetail> {
    const artifact = await this.getArtifactById(organizationId, productId, campaignId, artifactId);
    const versionDoc = await this.versionModel.findOne({ artifactId: artifact._id, version });
    if (!versionDoc) throw new NotFoundException('Content version not found.');
    const detail = this.toVersionDetail(versionDoc);
    const grounding = await this.groundingService.getSummary(detail.id);
    return { ...detail, grounding };
  }

  async getLatestByCriteria(organizationId: string, productId: string, campaignId: string, kind: ContentGenerationKind, sourceType: string, sourceId: string): Promise<ArtifactWithLatestVersion | null> {
    const artifact = await this.artifactModel.findOne({
      organizationId: new Types.ObjectId(organizationId),
      productId: new Types.ObjectId(productId),
      campaignId: new Types.ObjectId(campaignId),
      kind,
      sourceType,
      sourceId,
    });
    if (!artifact || !artifact.latestVersionId) return null;
    const versionDoc = await this.versionModel.findById(artifact.latestVersionId);
    if (!versionDoc) return null;
    const detail = this.toVersionDetail(versionDoc);
    const grounding = await this.groundingService.getSummary(detail.id);
    return { artifact: this.toArtifactResponse(artifact), latestVersion: { ...detail, grounding } };
  }

  async listLatestForCampaign(organizationId: string, productId: string, campaignId: string, filter?: ArtifactFilter): Promise<ArtifactWithLatestVersion[]> {
    const artifacts = await this.listArtifactDocs(organizationId, productId, campaignId, filter);
    const latestVersionIds = artifacts.map((a) => a.latestVersionId).filter((id): id is Types.ObjectId => !!id);
    const versions = await this.versionModel.find({ _id: { $in: latestVersionIds } }).exec();
    const versionById = new Map(versions.map((v) => [v._id.toString(), v]));
    const groundingByVersionId = await this.groundingService.getSummariesByVersionIds(versions.map((v) => v._id.toString()));

    return artifacts.map((artifact) => {
      const versionDoc = artifact.latestVersionId ? versionById.get(artifact.latestVersionId.toString()) : undefined;
      if (!versionDoc) return { artifact: this.toArtifactResponse(artifact), latestVersion: undefined };
      const detail = this.toVersionDetail(versionDoc);
      return { artifact: this.toArtifactResponse(artifact), latestVersion: { ...detail, grounding: groundingByVersionId.get(detail.id) } };
    });
  }

  private async listArtifactDocs(organizationId: string, productId: string, campaignId: string, filter?: ArtifactFilter): Promise<ContentArtifactDocument[]> {
    const query: Record<string, unknown> = {
      organizationId: new Types.ObjectId(organizationId),
      productId: new Types.ObjectId(productId),
      campaignId: new Types.ObjectId(campaignId),
    };
    if (filter?.kind) query.kind = filter.kind;
    if (filter?.sourceType) query.sourceType = filter.sourceType;
    if (filter?.sourceId) query.sourceId = filter.sourceId;
    return this.artifactModel.find(query).sort({ updatedAt: -1 }).exec();
  }

  // ---------------------------------------------------------------------
  // Response mapping
  // ---------------------------------------------------------------------

  private toArtifactResponse(artifact: ContentArtifactDocument): ContentArtifactResponse {
    return {
      id: artifact._id.toString(),
      kind: artifact.kind,
      sourceType: artifact.sourceType,
      sourceId: artifact.sourceId,
      latestVersion: artifact.latestVersion,
      latestVersionId: artifact.latestVersionId?.toString(),
      createdAt: artifact.createdAt as Date,
      updatedAt: artifact.updatedAt as Date,
    };
  }

  private toVersionSummary(version: ContentVersionDocument): ContentVersionSummary {
    return {
      id: version._id.toString(),
      version: version.version,
      kind: version.kind,
      generatedAt: version.generationMetadata.generatedAt,
      provider: version.generationMetadata.provider,
      model: version.generationMetadata.model,
      wordCount: version.payload.wordCount ?? version.payload.estimatedWordCount,
      characterCount: version.payload.characterCount,
      cost: version.generationMetadata.cost,
      warningsCount: version.generationMetadata.warnings.length,
    };
  }

  private toVersionDetail(version: ContentVersionDocument): ContentVersionDetail {
    return {
      ...this.toVersionSummary(version),
      artifactId: version.artifactId.toString(),
      sourceType: version.sourceType,
      sourceId: version.sourceId,
      payload: version.payload,
      generationMetadata: version.generationMetadata,
      generationOptions: version.generationOptions,
      sourceSnapshot: version.sourceSnapshot,
    };
  }

  // ---------------------------------------------------------------------
  // Config-driven defaults
  // ---------------------------------------------------------------------

  private getDefaultHistoryLimit(): number {
    return this.getEnvNumber('CONTENT_VERSION_HISTORY_DEFAULT_LIMIT', DEFAULT_HISTORY_LIMIT);
  }

  private getMaxHistoryLimit(): number {
    return this.getEnvNumber('CONTENT_VERSION_HISTORY_MAX_LIMIT', DEFAULT_HISTORY_MAX_LIMIT);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
