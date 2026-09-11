import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Campaign, CampaignDocument } from '../../campaigns/schemas/campaign.schema';
import { CmsPublication, CmsPublicationDocument } from '../../cms-integrations/schemas/cms-publication.schema';
import { ContentHumanReviewResult, ContentHumanReviewResultDocument } from '../../content-generation/schemas/content-human-review-result.schema';
import { ContentQualityResult, ContentQualityResultDocument } from '../../content-generation/schemas/content-quality-result.schema';
import { ContentVersion, ContentVersionDocument } from '../../content-generation/schemas/content-version.schema';
import { CreativeAsset, CreativeAssetDocument } from '../../creative/schemas/creative-asset.schema';
import { EmailEvent, EmailEventDocument } from '../../email/schemas/email-event.schema';
import { EmailMessage, EmailMessageDocument } from '../../email/schemas/email-message.schema';
import { EmailTemplate, EmailTemplateDocument } from '../../email/schemas/email-template.schema';
import { ProductsService } from '../../products/products.service';
import { SocialPublication, SocialPublicationDocument } from '../../social-publishing/schemas/social-publication.schema';
import { AnalyticsDashboardQueryDto } from '../dto/analytics.dto';
import { AnalyticsEvent, AnalyticsEventDocument } from '../schemas/analytics-event.schema';

@Injectable()
export class ContentAnalyticsService {
  constructor(
    @InjectModel(AnalyticsEvent.name) private readonly analyticsEventModel: Model<AnalyticsEventDocument>,
    @InjectModel(ContentVersion.name) private readonly contentVersionModel: Model<ContentVersionDocument>,
    @InjectModel(ContentQualityResult.name) private readonly qualityModel: Model<ContentQualityResultDocument>,
    @InjectModel(ContentHumanReviewResult.name) private readonly humanReviewModel: Model<ContentHumanReviewResultDocument>,
    @InjectModel(CreativeAsset.name) private readonly creativeAssetModel: Model<CreativeAssetDocument>,
    @InjectModel(SocialPublication.name) private readonly socialPublicationModel: Model<SocialPublicationDocument>,
    @InjectModel(CmsPublication.name) private readonly cmsPublicationModel: Model<CmsPublicationDocument>,
    @InjectModel(EmailMessage.name) private readonly emailMessageModel: Model<EmailMessageDocument>,
    @InjectModel(EmailEvent.name) private readonly emailEventModel: Model<EmailEventDocument>,
    @InjectModel(EmailTemplate.name) private readonly emailTemplateModel: Model<EmailTemplateDocument>,
    @InjectModel(Campaign.name) private readonly campaignModel: Model<CampaignDocument>,
    private readonly productsService: ProductsService,
  ) {}

  async content(organizationId: string, productId: string, userId: string, query: AnalyticsDashboardQueryDto & { contentKind?: string }) {
    await this.productsService.findOne(organizationId, productId, userId);
    await this.assertCampaign(organizationId, productId, query.campaignId);
    const range = this.range(query);
    const base = this.base(organizationId, productId, range, query.campaignId);
    const contentMatch = { ...base, ...(query.contentKind ? { kind: query.contentKind } : {}) };
    const [contentKinds, creativeKinds, creativeReview, quality, humanReview, social, cms, email, templatePerformance, channelMix] = await Promise.all([
      this.group(this.contentVersionModel, contentMatch, '$kind'),
      this.group(this.creativeAssetModel, base, '$kind'),
      this.group(this.creativeAssetModel, base, '$reviewStatus'),
      this.quality(organizationId, productId, range, query.campaignId),
      this.humanReview(organizationId, productId, range, query.campaignId),
      this.social(base),
      this.cms(base),
      this.email(base),
      this.templatePerformance(organizationId, productId, base),
      this.channelMix(organizationId, productId, range, query.campaignId),
    ]);
    const versionsGenerated = contentKinds.reduce((sum, item) => sum + item.count, 0);
    const socialPublished = social.find((item) => item.key === 'published')?.count ?? 0;
    const cmsPublished = cms.find((item) => item.key === 'published')?.count ?? 0;
    return {
      summary: {
        versionsGenerated,
        autoImprovedVersions: await this.contentVersionModel.countDocuments({ ...contentMatch, 'generationMetadata.generationReason': 'auto_improved' } as any).exec(),
        creativeAssetsGenerated: creativeKinds.reduce((sum, item) => sum + item.count, 0),
        socialPublications: socialPublished,
        cmsPublications: cmsPublished,
        emailAccepted: email.accepted,
        publicationRate: versionsGenerated ? (socialPublished + cmsPublished) / versionsGenerated : null,
        publicationRateDenominator: 'Content versions generated in selected period',
      },
      contentKindBreakdown: contentKinds,
      quality,
      humanReviewDecisionBreakdown: humanReview,
      creative: { byKind: creativeKinds, reviewStatus: creativeReview },
      publishing: { social, cms, email },
      templatePerformance,
      channelMix,
      attribution: null,
    };
  }

  async campaignDetail(organizationId: string, productId: string, userId: string, campaignId: string, query: AnalyticsDashboardQueryDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    await this.assertCampaign(organizationId, productId, campaignId);
    const range = this.range(query);
    const base = this.base(organizationId, productId, range, campaignId);
    const [events, contentKinds, creativeKinds, social, cms, email, currency, recent] = await Promise.all([
      this.analyticsEventModel.aggregate([{ $match: base }, { $group: { _id: '$eventType', count: { $sum: 1 } } }]).exec(),
      this.group(this.contentVersionModel, base, '$kind'),
      this.group(this.creativeAssetModel, base, '$kind'),
      this.social(base),
      this.cms(base),
      this.email(base),
      this.analyticsEventModel.aggregate([{ $match: { ...base, eventType: 'opportunity_won', numericValue: { $type: 'number' }, currency: { $type: 'string' } } }, { $group: { _id: '$currency', amount: { $sum: '$numericValue' }, count: { $sum: 1 } } }]).exec(),
      this.analyticsEventModel.find(base).sort({ occurredAt: -1 }).limit(20).exec(),
    ]);
    const map = new Map(events.map((item) => [item._id, item.count]));
    return {
      campaignId,
      activity: { total: events.reduce((sum, item) => sum + item.count, 0), recent: recent.map((event) => ({ id: event._id.toString(), eventType: event.eventType, channel: event.channel, occurredAt: event.occurredAt })) },
      content: { generated: map.get('content_generated') ?? 0, byKind: contentKinds },
      creative: { generated: map.get('creative_generated') ?? 0, byKind: creativeKinds },
      publishing: { social, cms },
      email,
      leads: map.get('lead_created') ?? 0,
      qualifiedLeads: map.get('lead_qualified') ?? 0,
      opportunities: map.get('opportunity_created') ?? 0,
      wonOpportunities: map.get('opportunity_won') ?? 0,
      wonOpportunityValueByCurrency: currency.map((item) => ({ currency: item._id, amount: item.amount, count: item.count })),
      attribution: null,
    };
  }

  async campaignComparison(organizationId: string, productId: string, userId: string, query: AnalyticsDashboardQueryDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const range = this.range(query);
    const rows = await this.analyticsEventModel.aggregate([
      { $match: { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), campaignId: { $exists: true }, occurredAt: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: { campaignId: '$campaignId', eventType: '$eventType' }, count: { $sum: 1 } } },
    ]).exec();
    const ids = [...new Set(rows.map((row) => row._id.campaignId.toString()))];
    const campaigns = ids.length ? await this.campaignModel.find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) }, organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).exec() : [];
    const names = new Map(campaigns.map((campaign) => [campaign._id.toString(), campaign.name]));
    const map = new Map<string, Record<string, number | string>>();
    for (const row of rows) {
      const id = row._id.campaignId.toString();
      const current = map.get(id) ?? { campaignId: id, campaignName: names.get(id) || id, contentPieces: 0, publishedSocial: 0, publishedBlog: 0, emailsAccepted: 0, leads: 0, qualified: 0, opportunities: 0, won: 0 };
      if (row._id.eventType === 'content_generated') current.contentPieces = row.count;
      if (row._id.eventType === 'social_published') current.publishedSocial = row.count;
      if (row._id.eventType === 'cms_published') current.publishedBlog = row.count;
      if (row._id.eventType === 'email_accepted') current.emailsAccepted = row.count;
      if (row._id.eventType === 'lead_created') current.leads = row.count;
      if (row._id.eventType === 'lead_qualified') current.qualified = row.count;
      if (row._id.eventType === 'opportunity_created') current.opportunities = row.count;
      if (row._id.eventType === 'opportunity_won') current.won = row.count;
      map.set(id, current);
    }
    return { campaigns: [...map.values()], attribution: null };
  }

  private async quality(organizationId: string, productId: string, range: { from: Date; to: Date }, campaignId?: string) {
    const base = { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), ...(campaignId ? { campaignId: new Types.ObjectId(campaignId) } : {}), calculatedAt: { $gte: range.from, $lte: range.to } };
    const rows = await this.qualityModel.aggregate([{ $match: base }, { $group: { _id: '$status', count: { $sum: 1 }, averageScore: { $avg: '$score' } } }]).exec();
    const scoreRows = await this.qualityModel.aggregate([{ $match: base }, { $group: { _id: null, averageQualityScore: { $avg: '$score' }, sampleSize: { $sum: 1 } } }]).exec();
    return { averageQualityScore: scoreRows[0]?.averageQualityScore ?? null, sampleSize: scoreRows[0]?.sampleSize ?? 0, qualityBandCounts: rows.map((item) => ({ key: item._id, count: item.count, averageScore: item.averageScore })) };
  }

  private async humanReview(organizationId: string, productId: string, range: { from: Date; to: Date }, campaignId?: string) {
    return this.group(this.humanReviewModel, { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), ...(campaignId ? { campaignId: new Types.ObjectId(campaignId) } : {}), evaluatedAt: { $gte: range.from, $lte: range.to } }, '$decision');
  }

  private async social(base: Record<string, unknown>) {
    const statuses = await this.group(this.socialPublicationModel, base, '$status');
    const platforms = await this.group(this.socialPublicationModel, base, '$platform');
    return statuses.map((item) => ({ ...item, platforms }));
  }

  private async cms(base: Record<string, unknown>) {
    return this.group(this.cmsPublicationModel, base, '$status');
  }

  private async email(base: Record<string, unknown>) {
    const messages = await this.emailMessageModel.find(base, { _id: 1, status: 1, deliveryStatus: 1 }).exec();
    const ids = messages.map((message) => message._id);
    const eventCounts = ids.length ? await this.emailEventModel.aggregate([{ $match: { emailMessageId: { $in: ids } } }, { $group: { _id: '$eventType', count: { $sum: 1 }, unique: { $addToSet: '$emailMessageId' } } }]).exec() : [];
    const get = (type: string) => eventCounts.find((item) => item._id === type)?.count ?? 0;
    return {
      accepted: messages.filter((message) => message.status === 'accepted').length,
      delivered: messages.filter((message) => message.deliveryStatus === 'delivered').length || get('delivered'),
      bounced: messages.filter((message) => message.deliveryStatus === 'bounced').length || get('bounced'),
      recordedOpens: get('opened'),
      recordedClicks: get('clicked'),
      unsubscribed: get('unsubscribed'),
      failed: messages.filter((message) => message.status === 'failed').length,
    };
  }

  private async templatePerformance(organizationId: string, productId: string, base: Record<string, unknown>) {
    const messages = await this.emailMessageModel.aggregate([
      { $match: { ...base, templateId: { $exists: true } } },
      { $group: { _id: { templateId: '$templateId', templateVersion: '$templateVersion' }, accepted: { $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] } }, delivered: { $sum: { $cond: [{ $eq: ['$deliveryStatus', 'delivered'] }, 1, 0] } }, bounced: { $sum: { $cond: [{ $eq: ['$deliveryStatus', 'bounced'] }, 1, 0] } }, messageIds: { $addToSet: '$_id' } } },
      { $limit: 25 },
    ]).exec();
    const templateIds = messages.map((row) => row._id.templateId);
    const templates = templateIds.length ? await this.emailTemplateModel.find({ _id: { $in: templateIds }, organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).exec() : [];
    const names = new Map(templates.map((template) => [template._id.toString(), template.name]));
    return Promise.all(messages.map(async (row) => {
      const events = await this.emailEventModel.aggregate([{ $match: { emailMessageId: { $in: row.messageIds } } }, { $group: { _id: '$eventType', count: { $sum: 1 } } }]).exec();
      const event = (type: string) => events.find((item) => item._id === type)?.count ?? 0;
      return { templateId: row._id.templateId.toString(), templateName: names.get(row._id.templateId.toString()) || row._id.templateId.toString(), templateVersion: row._id.templateVersion, accepted: row.accepted, delivered: row.delivered, recordedOpens: event('opened'), recordedClicks: event('clicked'), bounced: row.bounced, unsubscribed: event('unsubscribed') };
    }));
  }

  private async channelMix(organizationId: string, productId: string, range: { from: Date; to: Date }, campaignId?: string) {
    const match: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), occurredAt: { $gte: range.from, $lte: range.to }, ...(campaignId ? { campaignId: new Types.ObjectId(campaignId) } : {}) };
    const rows = await this.analyticsEventModel.aggregate([{ $match: match }, { $group: { _id: '$channel', count: { $sum: 1 } } }]).exec();
    const total = rows.reduce((sum, item) => sum + item.count, 0);
    return rows.map((item) => ({ channel: item._id, activityCount: item.count, activityShare: total ? item.count / total : null, denominator: 'Activity events in selected period' }));
  }

  private async group(model: Model<any>, match: Record<string, unknown>, field: string) {
    const rows = await model.aggregate([{ $match: match }, { $group: { _id: field, count: { $sum: 1 } } }, { $sort: { count: -1 } }]).exec();
    return rows.map((item) => ({ key: item._id || 'unknown', count: item.count }));
  }

  private base(organizationId: string, productId: string, range: { from: Date; to: Date }, campaignId?: string) {
    return { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), ...(campaignId ? { campaignId: new Types.ObjectId(campaignId) } : {}), createdAt: { $gte: range.from, $lte: range.to } };
  }

  private async assertCampaign(organizationId: string, productId: string, campaignId?: string) {
    if (!campaignId) return;
    const exists = await this.campaignModel.exists({ _id: new Types.ObjectId(campaignId), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) });
    if (!exists) throw new BadRequestException('analytics_campaign_scope_invalid');
  }

  private range(query: AnalyticsDashboardQueryDto) {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - (query.range === '7d' ? 7 : query.range === '90d' ? 90 : 30) * 24 * 60 * 60 * 1000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) throw new BadRequestException('analytics_invalid_range');
    return { from, to };
  }
}
