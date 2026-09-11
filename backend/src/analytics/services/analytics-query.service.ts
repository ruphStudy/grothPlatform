import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Campaign, CampaignDocument } from '../../campaigns/schemas/campaign.schema';
import { ProductsService } from '../../products/products.service';
import { AnalyticsDashboardQueryDto } from '../dto/analytics.dto';
import { AnalyticsEvent, AnalyticsEventDocument } from '../schemas/analytics-event.schema';
import type { AnalyticsBucket, AnalyticsChannel, AnalyticsEventType } from '../types/analytics.types';

const MAX_RANGE_DAYS = 365;

const EVENT_SUMMARY_KEYS: Record<AnalyticsEventType, string> = {
  lead_created: 'leadsCreated',
  lead_capture: 'leadCaptures',
  lead_qualified: 'qualifiedLeads',
  opportunity_created: 'opportunitiesCreated',
  opportunity_won: 'opportunitiesWon',
  opportunity_lost: 'opportunitiesLost',
  email_accepted: 'emailsAccepted',
  email_delivered: 'emailsDelivered',
  email_opened: 'recordedEmailOpens',
  email_clicked: 'recordedEmailClicks',
  email_bounced: 'emailsBounced',
  email_unsubscribed: 'emailsUnsubscribed',
  social_published: 'socialPostsPublished',
  cms_draft_created: 'cmsDraftsCreated',
  cms_published: 'cmsPostsPublished',
  content_generated: 'contentGenerated',
  creative_generated: 'creativeGenerated',
  web_page_view: 'webPageViews',
  web_cta_click: 'webCtaClicks',
  web_form_view: 'webFormViews',
  web_form_submit: 'webFormSubmits',
  web_custom_conversion: 'webCustomConversions',
};

@Injectable()
export class AnalyticsQueryService {
  constructor(
    @InjectModel(AnalyticsEvent.name) private readonly analyticsEventModel: Model<AnalyticsEventDocument>,
    @InjectModel(Campaign.name) private readonly campaignModel: Model<CampaignDocument>,
    private readonly productsService: ProductsService,
  ) {}

  async dashboard(organizationId: string, productId: string, userId: string, query: AnalyticsDashboardQueryDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const range = this.range(query);
    const timezone = this.timezone(query.timezone);
    const bucket = query.bucket || this.defaultBucket(range.from, range.to);
    const base = this.baseMatch(organizationId, productId, range, query);
    const [summary, trends, channels, campaigns, recent, latest] = await Promise.all([
      this.summary(base),
      this.trends(base, bucket, timezone),
      this.channels(base),
      this.campaigns(organizationId, productId, base),
      this.recent(base),
      this.analyticsEventModel.findOne(base).sort({ occurredAt: -1 }).exec(),
    ]);
    return {
      range: { from: range.from, to: range.to, timezone, bucket },
      summary,
      trends,
      channels,
      campaigns,
      recentActivity: recent,
      analyticsCoverageStatus: 'partial',
      lastUpdatedAt: latest?.occurredAt ?? null,
      attribution: null,
    };
  }

  private async summary(base: Record<string, unknown>) {
    const [counts, currency] = await Promise.all([
      this.analyticsEventModel.aggregate([{ $match: base }, { $group: { _id: '$eventType', count: { $sum: 1 }, uniqueLeads: { $addToSet: '$leadId' }, uniqueOpportunities: { $addToSet: '$opportunityId' } } }]).exec(),
      this.analyticsEventModel.aggregate([{ $match: { ...base, eventType: 'opportunity_won', numericValue: { $type: 'number' }, currency: { $type: 'string' } } }, { $group: { _id: '$currency', amount: { $sum: '$numericValue' }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]).exec(),
    ]);
    const summary: Record<string, any> = {
      leadsCreated: 0,
      leadCaptures: 0,
      qualifiedLeads: 0,
      opportunitiesCreated: 0,
      opportunitiesWon: 0,
      opportunitiesLost: 0,
      closedOpportunityWinRate: null,
      socialPostsPublished: 0,
      cmsDraftsCreated: 0,
      cmsPostsPublished: 0,
      emailsAccepted: 0,
      emailsDelivered: 0,
      recordedEmailOpens: 0,
      recordedEmailClicks: 0,
      emailsBounced: 0,
      emailsUnsubscribed: 0,
      emailDeliveryRate: null,
      emailBounceRate: null,
      recordedEmailOpenRate: null,
      recordedEmailClickRate: null,
      contentGenerated: 0,
      creativeGenerated: 0,
      webPageViews: 0,
      webCtaClicks: 0,
      webFormViews: 0,
      webFormSubmits: 0,
      webCustomConversions: 0,
      wonOpportunityValueByCurrency: currency.map((item) => ({ currency: item._id, amount: item.amount, count: item.count })),
    };
    for (const item of counts) {
      const key = EVENT_SUMMARY_KEYS[item._id as AnalyticsEventType];
      if (key) summary[key] = item.count;
    }
    const closed = summary.opportunitiesWon + summary.opportunitiesLost;
    summary.closedOpportunityWinRate = closed ? summary.opportunitiesWon / closed : null;
    summary.emailDeliveryRate = summary.emailsAccepted ? summary.emailsDelivered / summary.emailsAccepted : null;
    summary.emailBounceRate = summary.emailsAccepted ? summary.emailsBounced / summary.emailsAccepted : null;
    summary.recordedEmailOpenRate = summary.emailsDelivered ? summary.recordedEmailOpens / summary.emailsDelivered : summary.emailsAccepted ? summary.recordedEmailOpens / summary.emailsAccepted : null;
    summary.recordedEmailClickRate = summary.emailsDelivered ? summary.recordedEmailClicks / summary.emailsDelivered : summary.emailsAccepted ? summary.recordedEmailClicks / summary.emailsAccepted : null;
    return summary;
  }

  private async trends(base: Record<string, unknown>, bucket: AnalyticsBucket, timezone: string) {
    const format = bucket === 'month' ? '%Y-%m' : bucket === 'week' ? '%G-W%V' : '%Y-%m-%d';
    const rows = await this.analyticsEventModel.aggregate([
      { $match: base },
      { $group: { _id: { period: { $dateToString: { format, date: '$occurredAt', timezone } }, eventType: '$eventType' }, count: { $sum: 1 } } },
      { $sort: { '_id.period': 1 } },
    ]).exec();
    const map = new Map<string, Record<string, number | string>>();
    for (const row of rows) {
      const period = row._id.period;
      const current = map.get(period) ?? { period, leadsCreated: 0, qualifiedLeads: 0, opportunitiesCreated: 0, opportunitiesWon: 0, socialPostsPublished: 0, cmsPostsPublished: 0, emailsAccepted: 0 };
      const key = EVENT_SUMMARY_KEYS[row._id.eventType as AnalyticsEventType];
      if (key && key in current) current[key] = row.count;
      map.set(period, current);
    }
    return [...map.values()];
  }

  private async channels(base: Record<string, unknown>) {
    const rows = await this.analyticsEventModel.aggregate([
      { $match: base },
      { $group: { _id: { channel: '$channel', eventType: '$eventType' }, count: { $sum: 1 } } },
      { $sort: { '_id.channel': 1 } },
    ]).exec();
    const map = new Map<string, Record<string, number | string>>();
    for (const row of rows) {
      const channel = row._id.channel;
      const current = map.get(channel) ?? { channel, activityCount: 0, leadsCreated: 0, leadCaptures: 0, qualifiedLeads: 0, opportunitiesCreated: 0, opportunitiesWon: 0 };
      current.activityCount = Number(current.activityCount) + row.count;
      const key = EVENT_SUMMARY_KEYS[row._id.eventType as AnalyticsEventType];
      if (key && key in current) current[key] = row.count;
      map.set(channel, current);
    }
    return [...map.values()];
  }

  private async campaigns(organizationId: string, productId: string, base: Record<string, unknown>) {
    const rows = await this.analyticsEventModel.aggregate([
      { $match: { ...base, campaignId: { $exists: true } } },
      { $group: { _id: { campaignId: '$campaignId', eventType: '$eventType' }, count: { $sum: 1 } } },
    ]).exec();
    const ids = [...new Set(rows.map((row) => row._id.campaignId.toString()))];
    const campaignDocs = ids.length ? await this.campaignModel.find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) }, organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).exec() : [];
    const names = new Map(campaignDocs.map((campaign) => [campaign._id.toString(), campaign.name]));
    const map = new Map<string, Record<string, number | string>>();
    for (const row of rows) {
      const campaignId = row._id.campaignId.toString();
      const current = map.get(campaignId) ?? { campaignId, campaignName: names.get(campaignId) || campaignId, activityCount: 0, contentGenerated: 0, socialPublished: 0, blogPublished: 0, emailSent: 0, leads: 0, qualifiedLeads: 0, opportunities: 0, wonOpportunities: 0 };
      current.activityCount = Number(current.activityCount) + row.count;
      if (row._id.eventType === 'content_generated') current.contentGenerated = row.count;
      if (row._id.eventType === 'social_published') current.socialPublished = row.count;
      if (row._id.eventType === 'cms_published') current.blogPublished = row.count;
      if (row._id.eventType === 'email_accepted') current.emailSent = row.count;
      if (row._id.eventType === 'lead_created') current.leads = row.count;
      if (row._id.eventType === 'lead_qualified') current.qualifiedLeads = row.count;
      if (row._id.eventType === 'opportunity_created') current.opportunities = row.count;
      if (row._id.eventType === 'opportunity_won') current.wonOpportunities = row.count;
      map.set(campaignId, current);
    }
    return [...map.values()].sort((a, b) => Number(b.activityCount) - Number(a.activityCount));
  }

  private async recent(base: Record<string, unknown>) {
    const docs = await this.analyticsEventModel.find(base).sort({ occurredAt: -1 }).limit(15).exec();
    return docs.map((event) => ({ id: event._id.toString(), eventType: event.eventType, channel: event.channel, platform: event.platform, campaignId: event.campaignId?.toString(), entityType: event.entityType, entityId: event.entityId.toString(), occurredAt: event.occurredAt }));
  }

  private baseMatch(organizationId: string, productId: string, range: { from: Date; to: Date }, query: AnalyticsDashboardQueryDto) {
    const base: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), occurredAt: { $gte: range.from, $lte: range.to } };
    if (query.campaignId) base.campaignId = new Types.ObjectId(query.campaignId);
    if (query.channel) base.channel = query.channel as AnalyticsChannel;
    if (query.platform) base.platform = query.platform;
    return base;
  }

  private range(query: AnalyticsDashboardQueryDto) {
    const to = query.to ? new Date(query.to) : new Date();
    let from: Date;
    if (query.range === '7d') from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (query.range === '90d') from = new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
    else if (query.range === 'custom' && query.from) from = new Date(query.from);
    else from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) throw new BadRequestException('analytics_invalid_range');
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) throw new BadRequestException('analytics_range_too_large');
    return { from, to };
  }

  private timezone(timezone?: string) {
    if (!timezone) return 'UTC';
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return timezone;
    } catch {
      throw new BadRequestException('analytics_invalid_range');
    }
  }

  private defaultBucket(from: Date, to: Date): AnalyticsBucket {
    const days = Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
    if (days > 120) return 'month';
    if (days > 45) return 'week';
    return 'day';
  }
}
