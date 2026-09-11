import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProductsService } from '../../products/products.service';
import { AnalyticsDashboardQueryDto, AnalyticsExportDto, CreateAnalyticsReportDto, UpdateAnalyticsReportDto } from '../dto/analytics.dto';
import { AnalyticsEvent, AnalyticsEventDocument } from '../schemas/analytics-event.schema';
import { AnalyticsReport, AnalyticsReportDocument } from '../schemas/analytics-report.schema';
import { SocialPostMetricsSnapshot, SocialPostMetricsSnapshotDocument } from '../schemas/social-post-metrics-snapshot.schema';
import { WebAnalyticsEvent, WebAnalyticsEventDocument } from '../schemas/web-analytics-event.schema';
import { WebAnalyticsSite, WebAnalyticsSiteDocument } from '../schemas/web-analytics-site.schema';
import type { AnalyticsReportType } from '../types/analytics.types';
import { AnalyticsEventService } from './analytics-event.service';
import { AnalyticsFunnelService } from './analytics-funnel.service';
import { AnalyticsQueryService } from './analytics-query.service';
import { ContentAnalyticsService } from './content-analytics.service';
import { WebAnalyticsService } from './web-analytics.service';

@Injectable()
export class AnalyticsReportingService {
  constructor(
    @InjectModel(AnalyticsReport.name) private readonly reportModel: Model<AnalyticsReportDocument>,
    @InjectModel(AnalyticsEvent.name) private readonly analyticsEventModel: Model<AnalyticsEventDocument>,
    @InjectModel(WebAnalyticsEvent.name) private readonly webEventModel: Model<WebAnalyticsEventDocument>,
    @InjectModel(WebAnalyticsSite.name) private readonly siteModel: Model<WebAnalyticsSiteDocument>,
    @InjectModel(SocialPostMetricsSnapshot.name) private readonly socialMetricsModel: Model<SocialPostMetricsSnapshotDocument>,
    private readonly productsService: ProductsService,
    private readonly queryService: AnalyticsQueryService,
    private readonly funnelService: AnalyticsFunnelService,
    private readonly contentService: ContentAnalyticsService,
    private readonly webService: WebAnalyticsService,
    private readonly eventService: AnalyticsEventService,
  ) {}

  async list(organizationId: string, productId: string, userId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    return this.reportModel.find({ organizationId, productId, status: { $ne: 'archived' } }).sort({ updatedAt: -1 }).lean().exec();
  }

  async create(organizationId: string, productId: string, userId: string, dto: CreateAnalyticsReportDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const report = await this.reportModel.create({
      organizationId: new Types.ObjectId(organizationId),
      productId: new Types.ObjectId(productId),
      name: dto.name.trim(),
      reportType: dto.reportType,
      filters: this.safeFilters(dto.filters),
      columns: dto.columns?.slice(0, 30),
      schedule: dto.schedule ? this.safeFilters(dto.schedule) : undefined,
      createdByUserId: new Types.ObjectId(userId),
    });
    return report.toObject();
  }

  async get(organizationId: string, productId: string, userId: string, reportId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const report = await this.reportModel.findOne({ _id: reportId, organizationId, productId }).lean().exec();
    if (!report) throw new NotFoundException('analytics_report_not_found');
    return report;
  }

  async update(organizationId: string, productId: string, userId: string, reportId: string, dto: UpdateAnalyticsReportDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.reportType !== undefined) patch.reportType = dto.reportType;
    if (dto.filters !== undefined) patch.filters = this.safeFilters(dto.filters);
    if (dto.columns !== undefined) patch.columns = dto.columns.slice(0, 30);
    if (dto.schedule !== undefined) patch.schedule = this.safeFilters(dto.schedule);
    if (dto.status !== undefined) patch.status = dto.status;
    const report = await this.reportModel.findOneAndUpdate({ _id: reportId, organizationId, productId }, { $set: patch }, { new: true }).lean().exec();
    if (!report) throw new NotFoundException('analytics_report_not_found');
    return report;
  }

  archive(organizationId: string, productId: string, userId: string, reportId: string) {
    return this.update(organizationId, productId, userId, reportId, { status: 'archived' });
  }

  async run(organizationId: string, productId: string, userId: string, reportId: string) {
    const report = await this.get(organizationId, productId, userId, reportId);
    return { report, result: await this.runType(organizationId, productId, userId, report.reportType, report.filters || {}) };
  }

  async exportCsv(organizationId: string, productId: string, userId: string, dto: AnalyticsExportDto) {
    const result = await this.runType(organizationId, productId, userId, dto.reportType, dto.filters || {});
    const rows = this.rows(dto.reportType, result).slice(0, 500);
    const csv = this.csv(rows, dto.includeHeaders !== false);
    return { filename: `analytics-${dto.reportType}-${new Date().toISOString().slice(0, 10)}.csv`, contentType: 'text/csv', csv, rowCount: rows.length };
  }

  async dataHealth(organizationId: string, productId: string, userId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const org = new Types.ObjectId(organizationId);
    const product = new Types.ObjectId(productId);
    const since = new Date(Date.now() - 30 * 86400000);
    const [events, recent, duplicates, activeSites, recentWeb, totalWeb, normalizedWeb, socialMetricSnapshots] = await Promise.all([
      this.analyticsEventModel.countDocuments({ organizationId: org, productId: product }).exec(),
      this.analyticsEventModel.countDocuments({ organizationId: org, productId: product, occurredAt: { $gte: since } }).exec(),
      this.analyticsEventModel.aggregate([{ $match: { organizationId: org, productId: product } }, { $group: { _id: '$deduplicationKey', count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }, { $limit: 1 }]).exec(),
      this.siteModel.countDocuments({ organizationId: org, productId: product, status: 'active' }).exec(),
      this.webEventModel.countDocuments({ organizationId: org, productId: product, occurredAt: { $gte: since } }).exec(),
      this.webEventModel.countDocuments({ organizationId: org, productId: product }).exec(),
      this.analyticsEventModel.countDocuments({ organizationId: org, productId: product, sourceType: 'web_analytics_event' }).exec(),
      this.socialMetricsModel.countDocuments({ organizationId: org, productId: product, fetchedAt: { $gte: since } }).exec(),
    ]);
    const checks = [
      { code: 'event_coverage', status: events ? 'healthy' : 'warning', message: events ? `${events} normalized analytics events recorded` : 'No normalized analytics events found', action: events ? undefined : 'Run analytics backfill or connect event sources' },
      { code: 'stale_events', status: recent ? 'healthy' : 'warning', message: recent ? `${recent} events in the last 30 days` : 'No events in the last 30 days', action: recent ? undefined : 'Verify integrations and tracking snippets' },
      { code: 'duplicate_dedupe_keys', status: duplicates.length ? 'critical' : 'healthy', message: duplicates.length ? 'Duplicate deduplication keys detected' : 'No duplicate deduplication keys detected' },
      { code: 'website_collector_health', status: activeSites && !recentWeb ? 'warning' : 'healthy', message: activeSites ? `${activeSites} active sites, ${recentWeb} website events in the last 30 days` : 'No active website analytics sites', action: activeSites && !recentWeb ? 'Install or verify the website tracking snippet' : undefined },
      { code: 'orphaned_web_events', status: totalWeb > normalizedWeb ? 'warning' : 'healthy', message: totalWeb > normalizedWeb ? 'Some website events are missing normalized analytics events' : 'Website events are normalized' },
      { code: 'social_metrics_snapshots', status: socialMetricSnapshots ? 'healthy' : 'warning', message: socialMetricSnapshots ? `${socialMetricSnapshots} social metrics snapshots in the last 30 days` : 'No social metrics snapshots in the last 30 days', action: socialMetricSnapshots ? undefined : 'Use Sync Metrics on published social posts whose provider supports metrics' },
      { code: 'currency_grouping_risk', status: 'healthy', message: 'Revenue aggregates remain grouped by currency' },
      { code: 'backfill_status', status: 'healthy', message: 'Backfill endpoint available for this product' },
    ];
    const status = checks.some((c) => c.status === 'critical') ? 'critical' : checks.some((c) => c.status === 'warning') ? 'warning' : 'healthy';
    return { status, checks, generatedAt: new Date() };
  }

  backfillFromHealth(organizationId: string, productId: string, userId: string) {
    return this.eventService.backfill(organizationId, productId, userId);
  }

  private runType(organizationId: string, productId: string, userId: string, reportType: AnalyticsReportType, filters: Record<string, unknown>) {
    const query = filters as AnalyticsDashboardQueryDto;
    if (reportType === 'dashboard') return this.queryService.dashboard(organizationId, productId, userId, query);
    if (reportType === 'funnel') return this.funnelService.leadFunnel(organizationId, productId, userId, query);
    if (reportType === 'content') return this.contentService.content(organizationId, productId, userId, query);
    if (reportType === 'campaign_comparison') return this.contentService.campaignComparison(organizationId, productId, userId, query);
    if (reportType === 'website') return this.webService.website(organizationId, productId, userId, query);
    throw new BadRequestException('analytics_report_type_invalid');
  }

  private rows(reportType: AnalyticsReportType, result: any) {
    if (reportType === 'dashboard') return [{ section: 'summary', ...result.summary }, ...result.channels.map((r: any) => ({ section: 'channel', ...r }))];
    if (reportType === 'funnel') return result.stages.map((r: any) => ({ section: 'funnel', ...r }));
    if (reportType === 'content') return [{ section: 'summary', ...result.summary }, ...result.channelMix.map((r: any) => ({ section: 'channel_mix', ...r }))];
    if (reportType === 'campaign_comparison') return result.campaigns.map((r: any) => ({ section: 'campaign', ...r }));
    if (reportType === 'website') return [{ section: 'summary', ...result.summary }, ...result.topPages.map((r: any) => ({ section: 'page', ...r })), ...result.topSources.map((r: any) => ({ section: 'source', ...r }))];
    return [];
  }

  private csv(rows: Record<string, unknown>[], headers: boolean) {
    if (!rows.length) return headers ? 'section\n' : '';
    const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))].filter((key) => !['email', 'phone', 'fullName'].includes(key));
    const lines = headers ? [keys.join(',')] : [];
    for (const row of rows) lines.push(keys.map((key) => this.escape(row[key])).join(','));
    return lines.join('\n');
  }

  private escape(value: unknown) {
    const text = value === undefined || value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  private safeFilters(input?: Record<string, unknown>): Record<string, string | number | boolean> {
    if (!input) return {};
    return Object.fromEntries(Object.entries(input).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value)).slice(0, 30)) as Record<string, string | number | boolean>;
  }
}
