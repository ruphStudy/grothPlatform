import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProductsService } from '../../products/products.service';
import { SocialConnectionsService } from '../../social-integrations/connections/services/social-connections.service';
import { SocialEngineService } from '../../social-integrations/engine/social-engine.service';
import { SocialCapabilityUnsupportedError } from '../../social-integrations/errors/social.errors';
import { SOCIAL_PLATFORMS } from '../../social-integrations/types/social.types';
import type { SocialPlatform, SocialPostMetricKey, SocialPostMetrics } from '../../social-integrations/types/social.types';
import { SocialPublication, SocialPublicationDocument } from '../../social-publishing/schemas/social-publication.schema';
import { AnalyticsDashboardQueryDto } from '../dto/analytics.dto';
import { SocialPostMetricsSnapshot, SocialPostMetricsSnapshotDocument } from '../schemas/social-post-metrics-snapshot.schema';

const METRIC_KEYS: SocialPostMetricKey[] = ['impressions', 'reach', 'likes', 'reactions', 'comments', 'shares', 'reposts', 'clicks', 'videoViews'];

@Injectable()
export class SocialAnalyticsService {
  constructor(
    @InjectModel(SocialPostMetricsSnapshot.name) private readonly snapshotModel: Model<SocialPostMetricsSnapshotDocument>,
    @InjectModel(SocialPublication.name) private readonly publicationModel: Model<SocialPublicationDocument>,
    private readonly productsService: ProductsService,
    private readonly socialConnectionsService: SocialConnectionsService,
    private readonly socialEngine: SocialEngineService,
  ) {}

  async overview(organizationId: string, productId: string, userId: string, query: AnalyticsDashboardQueryDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const range = this.range(query);
    const base = this.base(organizationId, productId, range, query);
    const publications = await this.publicationModel.find(base as Record<string, unknown>).sort({ publishedAt: -1, createdAt: -1 }).limit(100).exec();
    const latest = await this.latestSnapshots(organizationId, productId, publications.map((item) => item._id));
    const posts = publications.map((publication) => this.postRow(publication, latest.get(publication._id.toString())));
    const totals = this.sum(posts.map((post) => post.metrics));
    const byPlatform = SOCIAL_PLATFORMS.map((platform) => {
      const platformPosts = posts.filter((post) => post.platform === platform);
      return {
        platform,
        postsPublished: platformPosts.length,
        postsWithMetrics: platformPosts.filter((post) => post.lastSyncedAt).length,
        metrics: this.sum(platformPosts.map((post) => post.metrics)),
        availableMetrics: this.available(platformPosts.map((post) => post.metrics)),
      };
    });
    return {
      summary: {
        postsPublished: publications.length,
        postsWithMetrics: posts.filter((post) => post.lastSyncedAt).length,
        metrics: totals,
        availableMetrics: this.available(posts.map((post) => post.metrics)),
      },
      platforms: byPlatform,
      posts,
    };
  }

  async posts(organizationId: string, productId: string, userId: string, query: AnalyticsDashboardQueryDto) {
    return (await this.overview(organizationId, productId, userId, query)).posts;
  }

  async post(organizationId: string, productId: string, userId: string, publicationId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const publication = await this.findPublication(organizationId, productId, publicationId);
    const [snapshot] = await this.latestSnapshots(organizationId, productId, [publication._id]).then((map) => [map.get(publication._id.toString())]);
    return this.postRow(publication, snapshot);
  }

  async syncPost(organizationId: string, productId: string, userId: string, publicationId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const publication = await this.findPublication(organizationId, productId, publicationId);
    if (publication.status !== 'published') throw new ConflictException('social_publication_not_published');
    if (!publication.providerPostId) throw new BadRequestException('social_publication_missing_external_post_id');
    const connection = await this.socialConnectionsService.findOwnedDocument(organizationId, productId, publication.connectionId.toString());
    if (connection.status !== 'active') throw new ConflictException('social_connection_not_active');
    if (connection.platform !== publication.platform) throw new ConflictException('social_connection_platform_mismatch');
    const provider = this.socialEngine.resolveProvider(publication.platform);
    if (!provider.getCapabilities().fetchPostMetrics) throw new SocialCapabilityUnsupportedError(`The ${publication.platform} provider does not support post metrics.`);
    const accessToken = await this.socialConnectionsService.ensureValidAccessToken(connection);
    const result = await this.socialEngine.getPostMetrics(publication.platform, { accessToken, externalPostId: publication.providerPostId });
    const snapshot = await this.snapshotModel.create({
      organizationId: publication.organizationId,
      productId: publication.productId,
      socialPublicationId: publication._id,
      socialConnectionId: publication.connectionId,
      platform: publication.platform,
      externalPostId: result.externalPostId,
      metrics: result.metrics,
      fetchedAt: result.fetchedAt,
      providerMetricAvailability: result.availableMetrics,
    });
    return snapshot.toObject();
  }

  private async findPublication(organizationId: string, productId: string, publicationId: string) {
    let publication: SocialPublicationDocument | null = null;
    try {
      publication = await this.publicationModel.findOne({ _id: new Types.ObjectId(publicationId), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).exec();
    } catch {
      throw new NotFoundException('social_publication_not_found');
    }
    if (!publication) throw new NotFoundException('social_publication_not_found');
    return publication;
  }

  private async latestSnapshots(organizationId: string, productId: string, publicationIds: Types.ObjectId[]) {
    if (!publicationIds.length) return new Map<string, SocialPostMetricsSnapshotDocument>();
    const rows = await this.snapshotModel.aggregate([
      { $match: { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), socialPublicationId: { $in: publicationIds } } },
      { $sort: { fetchedAt: -1 } },
      { $group: { _id: '$socialPublicationId', doc: { $first: '$$ROOT' } } },
    ]).exec();
    return new Map(rows.map((row) => [row._id.toString(), row.doc as SocialPostMetricsSnapshotDocument]));
  }

  private postRow(publication: SocialPublicationDocument, snapshot?: SocialPostMetricsSnapshotDocument) {
    return {
      publicationId: publication._id.toString(),
      campaignId: publication.campaignId.toString(),
      platform: publication.platform,
      status: publication.status,
      externalPostId: publication.providerPostId,
      providerPostUrl: publication.providerPostUrl,
      publishedAt: publication.publishedAt,
      metrics: snapshot?.metrics || {},
      availableMetrics: snapshot?.providerMetricAvailability || [],
      lastSyncedAt: snapshot?.fetchedAt || null,
    };
  }

  private sum(items: SocialPostMetrics[]) {
    const totals: SocialPostMetrics = {};
    for (const key of METRIC_KEYS) {
      const values = items.map((item) => item?.[key]).filter((value): value is number => typeof value === 'number');
      if (values.length) totals[key] = values.reduce((sum, value) => sum + value, 0);
    }
    return totals;
  }

  private available(items: SocialPostMetrics[]) {
    return METRIC_KEYS.filter((key) => items.some((item) => typeof item?.[key] === 'number'));
  }

  private base(organizationId: string, productId: string, range: { from: Date; to: Date }, query: AnalyticsDashboardQueryDto): Record<string, unknown> {
    return {
      organizationId: new Types.ObjectId(organizationId),
      productId: new Types.ObjectId(productId),
      status: 'published',
      ...(query.campaignId ? { campaignId: new Types.ObjectId(query.campaignId) } : {}),
      ...(query.platform ? { platform: query.platform as SocialPlatform } : {}),
      publishedAt: { $gte: range.from, $lte: range.to },
    };
  }

  private range(query: AnalyticsDashboardQueryDto) {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - (query.range === '7d' ? 7 : query.range === '90d' ? 90 : 30) * 86400000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) throw new BadRequestException('analytics_invalid_range');
    return { from, to };
  }
}
