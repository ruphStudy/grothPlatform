import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CampaignReviewService } from '../../campaigns/campaign-review.service';
import { CreativeAssetsService } from '../../creative/services/creative-assets.service';
import { ContentVersioningService } from '../../content-generation/services/content-versioning.service';
import type { ContentVersionDetail } from '../../content-generation/types/content-versioning.types';
import { GrowthStrategyReviewService } from '../../growth-strategy/growth-strategy-review.service';
import { ProductsService } from '../../products/products.service';
import { WebsiteUrlSecurityService } from '../../website-intelligence/website-url-security.service';
import { CmsConnectionsService } from '../connections/services/cms-connections.service';
import { CmsEngineService } from '../engine/cms-engine.service';
import { CmsCapabilityUnsupportedError, CmsConfigurationError, CmsProviderError } from '../errors/cms.errors';
import { CmsPublication, CmsPublicationDocument } from '../schemas/cms-publication.schema';
import type { CmsPublicationListFilter, CmsPublicationResponse, PublishCmsBlogInput } from '../types/cms-publication.types';
import type { CmsCredential, CmsRemotePostStatus, CmsSeoMetadata, CmsTaxonomyItem } from '../types/cms.types';

const DEFAULT_MEDIA_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_TAXONOMY_MAX_ITEMS = 100;
const DEFAULT_META_DESCRIPTION_MAX_CHARS = 160;
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const HTML_BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'pre']);

interface BlogSnapshot {
  title: string;
  contentHtml: string;
  excerpt?: string;
  slug: string;
  seo: CmsSeoMetadata;
}

interface BlogPublicationIntent {
  sourceVersion: ContentVersionDetail;
  connection: Awaited<ReturnType<CmsConnectionsService['findOwnedDocument']>>;
  credential: CmsCredential;
  blog: BlogSnapshot;
  categoryIds: number[];
  tagIds: number[];
  featuredCreativeAssetId?: Types.ObjectId;
}

@Injectable()
export class CmsPublicationsService {
  private readonly logger = new Logger(CmsPublicationsService.name);

  constructor(
    @InjectModel(CmsPublication.name) private readonly publicationModel: Model<CmsPublicationDocument>,
    private readonly configService: ConfigService,
    private readonly productsService: ProductsService,
    private readonly campaignReviewService: CampaignReviewService,
    private readonly growthStrategyReviewService: GrowthStrategyReviewService,
    private readonly versioningService: ContentVersioningService,
    private readonly creativeAssetsService: CreativeAssetsService,
    private readonly cmsConnectionsService: CmsConnectionsService,
    private readonly cmsEngine: CmsEngineService,
    private readonly urlSecurity: WebsiteUrlSecurityService,
  ) {}

  async publishBlog(
    organizationId: string,
    productId: string,
    campaignId: string,
    artifactId: string,
    version: number,
    userId: string,
    input: PublishCmsBlogInput,
  ): Promise<CmsPublicationResponse> {
    const intent = await this.validateBlogPublicationIntent(organizationId, productId, campaignId, artifactId, version, userId, input);
    const { sourceVersion, connection, credential, blog, categoryIds, tagIds } = intent;

    const existing = await this.publicationModel.findOne({
      organizationId: new Types.ObjectId(organizationId),
      productId: new Types.ObjectId(productId),
      platform: 'wordpress',
      idempotencyKey: input.idempotencyKey,
    });
    if (existing) {
      this.assertSameRequest(existing, sourceVersion, input);
      return this.toResponse(existing);
    }

    let featuredCreativeAssetId = intent.featuredCreativeAssetId;
    let externalMediaId: string | undefined;
    if (input.featuredCreativeAssetId) {
      const creative = await this.validateFeaturedCreativeIntent(organizationId, productId, campaignId, input.featuredCreativeAssetId, sourceVersion);
      const creativeUrl = creative.asset.url!;
      const media = await this.fetchCreativeImage(creativeUrl, creative.asset.mimeType);
      const uploaded = await this.cmsEngine.uploadMedia('wordpress', {
        siteUrl: connection.siteUrl,
        credential,
        filename: this.filenameFromUrl(creativeUrl, media.mimeType),
        mimeType: media.mimeType,
        bytes: media.bytes,
      });
      externalMediaId = uploaded.externalMediaId;
    }

    let doc: CmsPublicationDocument;
    try {
      doc = await new this.publicationModel({
        organizationId: new Types.ObjectId(organizationId),
        productId: new Types.ObjectId(productId),
        campaignId: new Types.ObjectId(campaignId),
        cmsConnectionId: new Types.ObjectId(input.connectionId),
        platform: 'wordpress',
        contentArtifactId: new Types.ObjectId(artifactId),
        contentVersionId: new Types.ObjectId(sourceVersion.id),
        contentVersion: sourceVersion.version,
        status: 'publishing',
        publishMode: input.mode,
        titleSnapshot: blog.title,
        contentSnapshot: blog.contentHtml,
        excerptSnapshot: blog.excerpt,
        slugSnapshot: blog.slug,
        seo: blog.seo,
        featuredCreativeAssetId,
        externalMediaId,
        categoryIds,
        tagIds,
        providerName: 'wordpress',
        attemptCount: 1,
        lastAttemptAt: new Date(),
        idempotencyKey: input.idempotencyKey,
        createdBy: new Types.ObjectId(userId),
      }).save();
    } catch {
      const raced = await this.publicationModel.findOne({
        organizationId: new Types.ObjectId(organizationId),
        productId: new Types.ObjectId(productId),
        platform: 'wordpress',
        idempotencyKey: input.idempotencyKey,
      });
      if (raced) {
        this.assertSameRequest(raced, sourceVersion, input);
        return this.toResponse(raced);
      }
      throw new ConflictException('Failed to create the CMS publication record.');
    }

    try {
      const result = await this.cmsEngine.createPost('wordpress', {
        siteUrl: connection.siteUrl,
        credential,
        title: blog.title,
        content: blog.contentHtml,
        excerpt: blog.excerpt,
        slug: blog.slug,
        status: input.mode,
        featuredMediaId: externalMediaId,
        categoryIds,
        tagIds,
        seo: blog.seo,
      });
      doc.status = input.mode === 'publish' ? 'published' : 'draft_created';
      doc.externalPostId = result.externalPostId;
      doc.externalPostUrl = result.externalPostUrl;
      doc.remoteStatus = result.status;
      doc.remoteStatusCheckedAt = new Date();
      doc.remoteStatusErrorCode = undefined;
      doc.publishedAt = result.publishedAt ?? (input.mode === 'publish' ? new Date() : undefined);
      doc.errorCode = undefined;
      this.logger.log(`cmsPublicationId=${doc._id.toString()} platform=wordpress status=${doc.status} externalPostId=${result.externalPostId}`);
    } catch (err) {
      doc.status = 'failed';
      doc.errorCode = this.extractErrorCode(err);
      this.logger.warn(`cmsPublicationId=${doc._id.toString()} platform=wordpress status=failed errorCode=${doc.errorCode}`);
    }
    doc.lastAttemptAt = new Date();
    await doc.save();
    return this.toResponse(doc);
  }

  async validateBlogPublicationIntent(
    organizationId: string,
    productId: string,
    campaignId: string,
    artifactId: string,
    version: number,
    userId: string,
    input: PublishCmsBlogInput,
  ): Promise<BlogPublicationIntent> {
    const sourceVersion = await this.versioningService.getVersion(organizationId, productId, campaignId, artifactId, version);
    if (sourceVersion.kind !== 'blog') {
      throw new BadRequestException('Only blog content versions can be sent to WordPress.');
    }
    await this.assertExternalActionApproved(organizationId, productId, campaignId, userId);
    this.assertHumanReviewAllowsPublish(sourceVersion);

    const connection = await this.cmsConnectionsService.findOwnedDocument(organizationId, productId, input.connectionId);
    if (connection.platform !== 'wordpress') {
      throw new BadRequestException('The selected CMS connection is not WordPress.');
    }
    if (connection.status !== 'active') {
      throw new ConflictException('The selected WordPress connection is not active.');
    }
    const credential = this.cmsConnectionsService.decryptCredential(connection);
    const categoryIds = this.normalizeIdList(input.categoryIds, 20, 'categories');
    const tagIds = this.normalizeIdList(input.tagIds, 30, 'tags');
    await this.validateTaxonomy(connection.siteUrl, credential, categoryIds, tagIds);
    const featuredCreativeAssetId = input.featuredCreativeAssetId
      ? new Types.ObjectId((await this.validateFeaturedCreativeIntent(organizationId, productId, campaignId, input.featuredCreativeAssetId, sourceVersion)).id)
      : undefined;

    return {
      sourceVersion,
      connection,
      credential,
      blog: this.buildBlogSnapshot(sourceVersion),
      categoryIds,
      tagIds,
      featuredCreativeAssetId,
    };
  }

  async list(organizationId: string, productId: string, campaignId: string, filter?: CmsPublicationListFilter): Promise<CmsPublicationResponse[]> {
    const query: Record<string, unknown> = {
      organizationId: new Types.ObjectId(organizationId),
      productId: new Types.ObjectId(productId),
      campaignId: new Types.ObjectId(campaignId),
    };
    const localStatus = filter?.localStatus ?? filter?.status;
    if (localStatus) query.status = localStatus;
    if (filter?.remoteStatus) query.remoteStatus = filter.remoteStatus;
    if (filter?.mode) query.publishMode = filter.mode;
    if (filter?.connectionId) query.cmsConnectionId = new Types.ObjectId(filter.connectionId);
    if (filter?.contentArtifactId) query.contentArtifactId = new Types.ObjectId(filter.contentArtifactId);
    if (filter?.start || filter?.end) {
      const range: Record<string, Date> = {};
      if (filter.start) range.$gte = new Date(filter.start);
      if (filter.end) range.$lte = new Date(filter.end);
      query.createdAt = range;
    }
    const docs = await this.publicationModel.find(query).sort({ createdAt: -1 }).exec();
    return docs.map((d) => this.toResponse(d));
  }

  async get(organizationId: string, productId: string, campaignId: string, publicationId: string): Promise<CmsPublicationResponse> {
    let doc: CmsPublicationDocument | null;
    try {
      doc = await this.publicationModel.findOne({
        _id: new Types.ObjectId(publicationId),
        organizationId: new Types.ObjectId(organizationId),
        productId: new Types.ObjectId(productId),
        campaignId: new Types.ObjectId(campaignId),
      });
    } catch {
      throw new NotFoundException('CMS publication not found.');
    }
    if (!doc) throw new NotFoundException('CMS publication not found.');
    return this.toResponse(doc);
  }

  async syncRemoteStatus(organizationId: string, productId: string, campaignId: string, publicationId: string): Promise<CmsPublicationResponse> {
    const doc = await this.findOwnedPublication(organizationId, productId, campaignId, publicationId);
    if (!doc.externalPostId) throw new ConflictException('This CMS publication does not have a remote WordPress post id.');
    const connection = await this.cmsConnectionsService.findOwnedDocument(organizationId, productId, doc.cmsConnectionId.toString());
    if (connection.platform !== 'wordpress') throw new BadRequestException('The selected CMS connection is not WordPress.');
    if (connection.status !== 'active') throw new ConflictException('The selected WordPress connection is not active.');
    try {
      const result = await this.cmsEngine.getPostStatus('wordpress', {
        siteUrl: connection.siteUrl,
        credential: this.cmsConnectionsService.decryptCredential(connection),
        externalPostId: doc.externalPostId,
      });
      doc.remoteStatus = result.status;
      doc.remoteStatusCheckedAt = result.checkedAt;
      doc.remoteStatusErrorCode = undefined;
      if (result.externalPostUrl) doc.externalPostUrl = result.externalPostUrl;
    } catch (err) {
      doc.remoteStatusCheckedAt = new Date();
      doc.remoteStatusErrorCode = this.extractErrorCode(err);
    }
    await doc.save();
    return this.toResponse(doc);
  }

  async listCategories(organizationId: string, productId: string, connectionId: string): Promise<CmsTaxonomyItem[]> {
    const connection = await this.cmsConnectionsService.findOwnedDocument(organizationId, productId, connectionId);
    if (connection.platform !== 'wordpress' || connection.status !== 'active') throw new ConflictException('The selected WordPress connection is not active.');
    return this.cmsEngine.listCategories('wordpress', { siteUrl: connection.siteUrl, credential: this.cmsConnectionsService.decryptCredential(connection), limit: this.getTaxonomyMaxItems() });
  }

  async listTags(organizationId: string, productId: string, connectionId: string): Promise<CmsTaxonomyItem[]> {
    const connection = await this.cmsConnectionsService.findOwnedDocument(organizationId, productId, connectionId);
    if (connection.platform !== 'wordpress' || connection.status !== 'active') throw new ConflictException('The selected WordPress connection is not active.');
    return this.cmsEngine.listTags('wordpress', { siteUrl: connection.siteUrl, credential: this.cmsConnectionsService.decryptCredential(connection), limit: this.getTaxonomyMaxItems() });
  }

  private async assertExternalActionApproved(organizationId: string, productId: string, campaignId: string, userId: string): Promise<void> {
    const campaignApproval = await this.campaignReviewService.isCampaignApprovedForCurrentVersion(organizationId, productId, campaignId, userId);
    if (!campaignApproval.approved) throw new ConflictException(campaignApproval.reason ?? 'Approve this campaign before publishing.');
    const strategyReview = await this.growthStrategyReviewService.getReview(organizationId, productId, userId);
    if (strategyReview.status !== 'approved') throw new ConflictException('Approve the current Growth Strategy before publishing.');
    const product = await this.productsService.findOne(organizationId, productId, userId);
    const productUpdatedAt: Date = (product as { updatedAt?: Date }).updatedAt ?? new Date(0);
    const stillApproved = await this.growthStrategyReviewService.isStrategyApprovedForCurrentVersion(organizationId, productId, userId, productUpdatedAt);
    if (!stillApproved) throw new ConflictException('The product has changed since the Growth Strategy was last approved. Review and approve it again before publishing.');
  }

  private assertHumanReviewAllowsPublish(sourceVersion: ContentVersionDetail): void {
    if (!sourceVersion.humanReview) throw new ConflictException('Human Review has not been evaluated for this content yet; publishing is blocked until it has.');
    if (sourceVersion.humanReview.decision === 'review_required') throw new ConflictException('Human review is required before publishing.');
  }

  private async validateFeaturedCreativeIntent(
    organizationId: string,
    productId: string,
    campaignId: string,
    creativeAssetId: string,
    sourceVersion: ContentVersionDetail,
  ) {
    const creative = await this.creativeAssetsService.getOwnedForCampaign(organizationId, productId, campaignId, creativeAssetId);
    if (creative.kind !== 'blog_hero') {
      throw new BadRequestException('Only blog hero creative assets can be used as a WordPress featured image.');
    }
    if (creative.source.contentArtifactId !== sourceVersion.artifactId || creative.source.contentVersionId !== sourceVersion.id) {
      throw new BadRequestException('The selected featured image does not belong to this blog version.');
    }
    if (creative.reviewStatus === 'rejected') {
      throw new ConflictException('This creative asset has been marked rejected and cannot be published.');
    }
    if (!creative.asset.url) {
      throw new BadRequestException('The selected featured image has no retrievable URL.');
    }
    return creative;
  }

  private buildBlogSnapshot(version: ContentVersionDetail): BlogSnapshot {
    const title = this.normalizePlainText(version.payload.title ?? version.sourceSnapshot?.title ?? '').slice(0, 200);
    if (!title) throw new BadRequestException('This blog version has no publishable title.');
    const rawContent = version.payload.content ?? '';
    if (!rawContent.trim()) throw new BadRequestException('This blog version has no publishable content.');
    const contentHtml = this.sanitizeHtml(version.payload.format === 'plain_text' ? this.plainTextToHtml(rawContent) : this.markdownToHtml(rawContent));
    const excerpt = this.deriveExcerpt(rawContent);
    const slug = this.slugify(version.sourceSnapshot?.title ?? title);
    const focusKeyword = version.groundingEvidenceSnapshot?.keywords?.find((k) => k.trim().length > 0);
    return {
      title,
      contentHtml,
      excerpt,
      slug,
      seo: {
        metaTitle: title,
        metaDescription: excerpt,
        focusKeyword,
      },
    };
  }

  private markdownToHtml(markdown: string): string {
    const lines = markdown.replace(/\r\n/g, '\n').split('\n');
    const html: string[] = [];
    let listOpen = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (listOpen) {
          html.push('</ul>');
          listOpen = false;
        }
        continue;
      }
      const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
      if (bullet) {
        if (!listOpen) {
          html.push('<ul>');
          listOpen = true;
        }
        html.push(`<li>${this.escapeHtml(this.stripInlineMarkdown(bullet[1]))}</li>`);
        continue;
      }
      if (listOpen) {
        html.push('</ul>');
        listOpen = false;
      }
      const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
      if (heading) {
        const level = heading[1].length;
        html.push(`<h${level}>${this.escapeHtml(this.stripInlineMarkdown(heading[2]))}</h${level}>`);
      } else {
        html.push(`<p>${this.escapeHtml(this.stripInlineMarkdown(trimmed))}</p>`);
      }
    }
    if (listOpen) html.push('</ul>');
    return html.join('\n');
  }

  private plainTextToHtml(text: string): string {
    return text
      .split(/\n{2,}/)
      .map((p) => `<p>${this.escapeHtml(p.replace(/\s+/g, ' ').trim())}</p>`)
      .join('\n');
  }

  private sanitizeHtml(html: string): string {
    return html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\s+(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, '')
      .replace(/<\/?(iframe|object|embed)\b[^>]*>/gi, '')
      .replace(/<\/?([a-z0-9-]+)(?:\s[^>]*)?>/gi, (tag, name: string) => (HTML_BLOCK_TAGS.has(name.toLowerCase()) ? tag : ''));
  }

  private deriveExcerpt(content: string): string | undefined {
    const text = this.normalizePlainText(content.replace(/^#+\s+/gm, '').replace(/[-*]\s+/g, ''));
    if (!text) return undefined;
    return this.trimAtWord(text, this.getMetaDescriptionMaxChars());
  }

  private async validateTaxonomy(siteUrl: string, credential: ReturnType<CmsConnectionsService['decryptCredential']>, categoryIds: number[], tagIds: number[]): Promise<void> {
    if (categoryIds.length > 0) {
      const categories = await this.cmsEngine.listCategories('wordpress', { siteUrl, credential, limit: this.getTaxonomyMaxItems() });
      this.assertKnownTaxonomyIds(categoryIds, categories, 'category');
    }
    if (tagIds.length > 0) {
      const tags = await this.cmsEngine.listTags('wordpress', { siteUrl, credential, limit: this.getTaxonomyMaxItems() });
      this.assertKnownTaxonomyIds(tagIds, tags, 'tag');
    }
  }

  private assertKnownTaxonomyIds(ids: number[], items: CmsTaxonomyItem[], label: string): void {
    const known = new Set(items.map((i) => i.externalId));
    const missing = ids.filter((id) => !known.has(id));
    if (missing.length > 0) throw new BadRequestException(`Unknown WordPress ${label} id: ${missing[0]}.`);
  }

  private async fetchCreativeImage(urlValue: string, expectedMime?: string): Promise<{ bytes: Buffer; mimeType: string }> {
    let url: URL;
    try {
      url = new URL(urlValue);
    } catch {
      throw new BadRequestException('The featured image URL is not valid.');
    }
    await this.urlSecurity.validateDestination(url);
    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(this.getCmsTimeoutMs()),
      });
    } catch {
      throw new CmsProviderError('cms_timeout', 'The featured image could not be fetched in time.');
    }
    if (response.status >= 300 && response.status < 400) throw new BadRequestException('The featured image redirected unexpectedly.');
    if (!response.ok) throw new BadRequestException('The featured image could not be fetched.');
    const mimeType = (response.headers.get('content-type') ?? expectedMime ?? '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) throw new BadRequestException('The featured image type is not supported.');
    const contentLength = Number(response.headers.get('content-length'));
    const maxBytes = this.getMediaMaxBytes();
    if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new BadRequestException('The featured image is too large.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxBytes) throw new BadRequestException('The featured image is too large.');
    return { bytes, mimeType };
  }

  private assertSameRequest(existing: CmsPublicationDocument, sourceVersion: ContentVersionDetail, input: PublishCmsBlogInput): void {
    const sameContent = existing.contentVersionId.toString() === sourceVersion.id;
    const sameConnection = existing.cmsConnectionId.toString() === input.connectionId;
    const sameMode = existing.publishMode === input.mode;
    const sameCreative = (existing.featuredCreativeAssetId?.toString() ?? undefined) === (input.featuredCreativeAssetId ?? undefined);
    const sameCategories = this.sameNumberList(existing.categoryIds, input.categoryIds ?? []);
    const sameTags = this.sameNumberList(existing.tagIds, input.tagIds ?? []);
    if (!sameContent || !sameConnection || !sameMode || !sameCreative || !sameCategories || !sameTags) {
      throw new ConflictException('This idempotency key was already used for a different CMS publication request.');
    }
  }

  private toResponse(doc: CmsPublicationDocument): CmsPublicationResponse {
    return {
      id: doc._id.toString(),
      platform: doc.platform,
      cmsConnectionId: doc.cmsConnectionId.toString(),
      contentArtifactId: doc.contentArtifactId.toString(),
      contentVersionId: doc.contentVersionId.toString(),
      contentVersion: doc.contentVersion,
      status: doc.status,
      publishMode: doc.publishMode,
      externalPostId: doc.externalPostId,
      externalPostUrl: doc.externalPostUrl,
      remoteStatus: doc.remoteStatus,
      remoteStatusCheckedAt: doc.remoteStatusCheckedAt,
      remoteStatusErrorCode: doc.remoteStatusErrorCode,
      titleSnapshot: doc.titleSnapshot,
      excerptSnapshot: doc.excerptSnapshot,
      slugSnapshot: doc.slugSnapshot,
      seo: doc.seo,
      featuredCreativeAssetId: doc.featuredCreativeAssetId?.toString(),
      externalMediaId: doc.externalMediaId,
      categoryIds: doc.categoryIds ?? [],
      tagIds: doc.tagIds ?? [],
      providerName: doc.providerName,
      attemptCount: doc.attemptCount,
      lastAttemptAt: doc.lastAttemptAt,
      errorCode: doc.errorCode,
      publishedAt: doc.publishedAt,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }

  private extractErrorCode(err: unknown): string {
    if (err instanceof CmsProviderError || err instanceof CmsCapabilityUnsupportedError || err instanceof CmsConfigurationError) return err.code;
    if (err instanceof BadRequestException) return 'cms_provider_request_failed';
    return 'cms_provider_request_failed';
  }

  private async findOwnedPublication(organizationId: string, productId: string, campaignId: string, publicationId: string): Promise<CmsPublicationDocument> {
    let doc: CmsPublicationDocument | null;
    try {
      doc = await this.publicationModel.findOne({
        _id: new Types.ObjectId(publicationId),
        organizationId: new Types.ObjectId(organizationId),
        productId: new Types.ObjectId(productId),
        campaignId: new Types.ObjectId(campaignId),
      });
    } catch {
      throw new NotFoundException('CMS publication not found.');
    }
    if (!doc) throw new NotFoundException('CMS publication not found.');
    return doc;
  }

  private normalizeIdList(items: number[] | undefined, max: number, label: string): number[] {
    const normalized = Array.from(new Set((items ?? []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)));
    if ((items ?? []).length !== normalized.length) throw new BadRequestException(`Invalid WordPress ${label} selection.`);
    if (normalized.length > max) throw new BadRequestException(`Too many WordPress ${label} selected.`);
    return normalized;
  }

  private slugify(value: string): string {
    const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-');
    return slug.slice(0, 80).replace(/-+$/g, '') || 'blog-post';
  }

  private stripInlineMarkdown(value: string): string {
    return value.replace(/[`*_~[\]()]/g, '');
  }

  private escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  private normalizePlainText(value: string): string {
    return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private trimAtWord(value: string, maxChars: number): string {
    if (value.length <= maxChars) return value;
    const clipped = value.slice(0, maxChars + 1);
    const idx = clipped.lastIndexOf(' ');
    return `${(idx > 40 ? clipped.slice(0, idx) : clipped.slice(0, maxChars)).trim().replace(/[.,;:!?-]+$/g, '')}.`;
  }

  private sameNumberList(a: number[], b: number[]): boolean {
    const left = [...a].sort((x, y) => x - y);
    const right = [...b].sort((x, y) => x - y);
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  private filenameFromUrl(value: string, mimeType: string): string {
    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    try {
      const name = new URL(value).pathname.split('/').pop() ?? '';
      const cleaned = name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
      return cleaned || `featured-image.${ext}`;
    } catch {
      return `featured-image.${ext}`;
    }
  }

  private getTaxonomyMaxItems(): number {
    return this.getEnvNumber('WORDPRESS_TAXONOMY_MAX_ITEMS', DEFAULT_TAXONOMY_MAX_ITEMS);
  }

  private getMediaMaxBytes(): number {
    return this.getEnvNumber('WORDPRESS_MEDIA_MAX_BYTES', DEFAULT_MEDIA_MAX_BYTES);
  }

  private getMetaDescriptionMaxChars(): number {
    return this.getEnvNumber('WORDPRESS_META_DESCRIPTION_MAX_CHARS', DEFAULT_META_DESCRIPTION_MAX_CHARS);
  }

  private getCmsTimeoutMs(): number {
    return this.getEnvNumber('CMS_HTTP_TIMEOUT_MS', 10000);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const parsed = Number(this.configService.get<string>(key));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
