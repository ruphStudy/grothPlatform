import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AnalyticsEvent, AnalyticsEventDocument } from '../../analytics/schemas/analytics-event.schema';
import { SocialPostMetricsSnapshot, SocialPostMetricsSnapshotDocument } from '../../analytics/schemas/social-post-metrics-snapshot.schema';
import { WebAnalyticsEvent, WebAnalyticsEventDocument } from '../../analytics/schemas/web-analytics-event.schema';
import { AttributionTouchpoint, AttributionTouchpointDocument } from '../../attribution/schemas/attribution-touchpoint.schema';
import { CmsPublication, CmsPublicationDocument } from '../../cms-integrations/schemas/cms-publication.schema';
import { ContentVersion, ContentVersionDocument } from '../../content-generation/schemas/content-version.schema';
import { ContentQualityResult, ContentQualityResultDocument } from '../../content-generation/schemas/content-quality-result.schema';
import { CrmOpportunity, CrmOpportunityDocument } from '../../crm/schemas/crm-opportunity.schema';
import { EmailEvent, EmailEventDocument } from '../../email/schemas/email-event.schema';
import { Lead, LeadDocument } from '../../leads/schemas/lead.schema';
import { ProductsService } from '../../products/products.service';
import { GrowthStrategyReview, GrowthStrategyReviewDocument } from '../../growth-strategy/schemas/growth-strategy-review.schema';
import { SocialPublication, SocialPublicationDocument } from '../../social-publishing/schemas/social-publication.schema';
import { LearningQueryDto } from '../dto/learning.dto';
import {
  LEARNING_ALGORITHM_VERSION,
  LEARNING_STALE_DAYS,
  PROMPT_OPTIMIZATION_VERSION,
  STRATEGY_ADJUSTMENT_VERSION,
  LearningInsight,
  LearningInsightDocument,
  LearningObservation,
  LearningObservationDocument,
  LearningRecommendation,
  LearningRecommendationDocument,
  LearningRun,
  LearningRunDocument,
  StrategyAdjustmentProposal,
  StrategyAdjustmentProposalDocument,
} from '../schemas/learning.schema';

type ObservationInput = {
  domain: string;
  subjectType: string;
  subjectId?: string;
  subjectKey: string;
  metric: string;
  value: number | null;
  numerator?: number | null;
  denominator?: number | null;
  sampleSize: number;
  currency?: string;
  attributionModel?: string;
  sourceReferences: { sourceType: string; sourceId?: string; details?: Record<string, unknown> }[];
};

const METRIC_REGISTRY = [
  { metric: 'publication_rate', label: 'Publication Rate', domain: 'content', valueType: 'rate', supported: true, numeratorEvent: 'published', denominatorEvent: 'content_generated' },
  { metric: 'qualified_lead_rate', label: 'Qualified Lead Rate', domain: 'channel', valueType: 'rate', supported: true, numeratorEvent: 'lead_qualified', denominatorEvent: 'lead_created' },
  { metric: 'lead_to_opportunity_rate', label: 'Lead To Opportunity Rate', domain: 'conversion', valueType: 'rate', supported: true, numeratorEvent: 'opportunity_created', denominatorEvent: 'lead_created' },
  { metric: 'lead_to_won_rate', label: 'Lead To Won Rate', domain: 'conversion', valueType: 'rate', supported: true, numeratorEvent: 'opportunity_won', denominatorEvent: 'lead_created' },
  { metric: 'recorded_open_rate', label: 'Recorded Open Rate', domain: 'email', valueType: 'rate', supported: true, numeratorEvent: 'opened', denominatorEvent: 'delivered' },
  { metric: 'recorded_click_rate', label: 'Recorded Click Rate', domain: 'email', valueType: 'rate', supported: true, numeratorEvent: 'clicked', denominatorEvent: 'delivered' },
  { metric: 'form_submit_rate', label: 'Form Submit Rate', domain: 'website', valueType: 'rate', supported: true, numeratorEvent: 'form_submit', denominatorEvent: 'page_view' },
  { metric: 'cta_click_rate', label: 'CTA Click Rate', domain: 'cta', valueType: 'rate', supported: true, numeratorEvent: 'cta_click', denominatorEvent: 'page_view' },
  { metric: 'social_impressions', label: 'Social Impressions', domain: 'social', valueType: 'count', supported: true },
  { metric: 'social_clicks', label: 'Social Clicks', domain: 'social', valueType: 'count', supported: true },
  { metric: 'social_engagement', label: 'Social Engagement', domain: 'social', valueType: 'count', supported: true },
  { metric: 'attributed_wins', label: 'Attributed Wins', domain: 'revenue_attribution', valueType: 'count', supported: true },
  { metric: 'attributed_won_value', label: 'Attributed Won Value', domain: 'revenue_attribution', valueType: 'currency', supported: true },
  { metric: 'content_quality_score', label: 'Content Quality Score', domain: 'content', valueType: 'score', supported: true },
];

const MIN_WINNER_SAMPLE = 3;
const MIN_PROMPT_SAMPLE = 4;
const MIN_STRATEGY_CONFIDENCE = 0.45;

@Injectable()
export class LearningService {
  constructor(
    @InjectModel(LearningRun.name) private readonly runModel: Model<LearningRunDocument>,
    @InjectModel(LearningObservation.name) private readonly observationModel: Model<LearningObservationDocument>,
    @InjectModel(LearningInsight.name) private readonly insightModel: Model<LearningInsightDocument>,
    @InjectModel(LearningRecommendation.name) private readonly recommendationModel: Model<LearningRecommendationDocument>,
    @InjectModel(StrategyAdjustmentProposal.name) private readonly proposalModel: Model<StrategyAdjustmentProposalDocument>,
    @InjectModel(AnalyticsEvent.name) private readonly analyticsModel: Model<AnalyticsEventDocument>,
    @InjectModel(WebAnalyticsEvent.name) private readonly webEventModel: Model<WebAnalyticsEventDocument>,
    @InjectModel(SocialPostMetricsSnapshot.name) private readonly socialMetricModel: Model<SocialPostMetricsSnapshotDocument>,
    @InjectModel(SocialPublication.name) private readonly socialPublicationModel: Model<SocialPublicationDocument>,
    @InjectModel(AttributionTouchpoint.name) private readonly touchpointModel: Model<AttributionTouchpointDocument>,
    @InjectModel(CmsPublication.name) private readonly cmsPublicationModel: Model<CmsPublicationDocument>,
    @InjectModel(ContentVersion.name) private readonly contentVersionModel: Model<ContentVersionDocument>,
    @InjectModel(ContentQualityResult.name) private readonly qualityModel: Model<ContentQualityResultDocument>,
    @InjectModel(CrmOpportunity.name) private readonly opportunityModel: Model<CrmOpportunityDocument>,
    @InjectModel(EmailEvent.name) private readonly emailEventModel: Model<EmailEventDocument>,
    @InjectModel(Lead.name) private readonly leadModel: Model<LeadDocument>,
    @InjectModel(GrowthStrategyReview.name) private readonly strategyReviewModel: Model<GrowthStrategyReviewDocument>,
    private readonly productsService: ProductsService,
  ) {}

  async dashboard(organizationId: string, productId: string, userId: string, query: LearningQueryDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const range = this.range(query);
    const observations = await this.buildObservations(organizationId, productId, range, query.model || 'first_touch');
    const [promptSuggestions, strategyAdjustments] = await Promise.all([
      this.promptSuggestions(organizationId, productId, userId, query),
      this.strategyAdjustments(organizationId, productId, userId, query),
    ]);
    return {
      modelVersion: LEARNING_ALGORITHM_VERSION,
      promptOptimizationVersion: PROMPT_OPTIMIZATION_VERSION,
      strategyAdjustmentVersion: STRATEGY_ADJUSTMENT_VERSION,
      disclaimer: 'Learning observations are deterministic historical comparisons. They describe observed association, not causation or guaranteed future performance.',
      range,
      metricRegistry: METRIC_REGISTRY,
      observations,
      overview: this.overview(observations),
      winningContent: this.winners(observations, 'content', query.metric || 'content_quality_score'),
      winningChannels: this.winners(observations, 'channel', query.metric || 'qualified_lead_rate'),
      ctas: this.winners(observations, 'cta', 'cta_click_rate'),
      topics: this.winners(observations, 'topic', query.metric || 'content_quality_score'),
      promptSuggestions: promptSuggestions.recommendations,
      strategyAdjustments: strategyAdjustments.proposals,
    };
  }

  async aggregate(organizationId: string, productId: string, userId: string, query: LearningQueryDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const range = this.range(query);
    const observations = await this.buildObservations(organizationId, productId, range, query.model || 'first_touch');
    const run = await this.runModel.create({
      organizationId: new Types.ObjectId(organizationId),
      productId: new Types.ObjectId(productId),
      from: range.from,
      to: range.to,
      attributionModel: query.model || 'first_touch',
      algorithmVersion: LEARNING_ALGORITHM_VERSION,
      metricRegistry: METRIC_REGISTRY.map((metric) => ({ ...metric })),
      dataHealth: this.dataHealth(observations),
      status: 'completed',
    } as Partial<LearningRun>);
    await this.observationModel.deleteMany({ organizationId: run.organizationId, productId: run.productId, from: range.from, to: range.to, algorithmVersion: LEARNING_ALGORITHM_VERSION }).exec();
    if (observations.length) {
      await this.observationModel.insertMany(observations.map((obs) => ({
        ...obs,
        organizationId: run.organizationId,
        productId: run.productId,
        runId: run._id,
        from: range.from,
        to: range.to,
        calculatedAt: new Date(),
        algorithmVersion: LEARNING_ALGORITHM_VERSION,
      })));
    }
    const insights = await this.persistInsights(organizationId, productId, observations);
    await this.persistPromptSuggestions(organizationId, productId, observations);
    await this.persistStrategyProposals(organizationId, productId, observations);
    return { status: 'ok', runId: run._id.toString(), observationCount: observations.length, insightCount: insights.length, modelVersion: LEARNING_ALGORITHM_VERSION };
  }

  async observations(organizationId: string, productId: string, userId: string, query: LearningQueryDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const filter: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) };
    if (query.metric) filter.metric = query.metric;
    return { rows: await this.observationModel.find(filter).sort({ createdAt: -1 }).limit(250).lean().exec(), modelVersion: LEARNING_ALGORITHM_VERSION };
  }

  async winningContent(organizationId: string, productId: string, userId: string, query: LearningQueryDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const rows = await this.buildObservations(organizationId, productId, this.range(query), query.model || 'first_touch');
    return { rows: this.winners(rows, 'content', query.metric || 'content_quality_score'), modelVersion: LEARNING_ALGORITHM_VERSION };
  }

  async winningChannels(organizationId: string, productId: string, userId: string, query: LearningQueryDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const rows = await this.buildObservations(organizationId, productId, this.range(query), query.model || 'first_touch');
    return { rows: this.winners(rows, 'channel', query.metric || 'qualified_lead_rate'), modelVersion: LEARNING_ALGORITHM_VERSION, attributionModel: query.model || 'first_touch' };
  }

  async ctas(organizationId: string, productId: string, userId: string, query: LearningQueryDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const rows = await this.buildObservations(organizationId, productId, this.range(query), query.model || 'first_touch');
    return { rows: this.winners(rows, 'cta', 'cta_click_rate'), modelVersion: LEARNING_ALGORITHM_VERSION };
  }

  async topics(organizationId: string, productId: string, userId: string, query: LearningQueryDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const rows = await this.buildObservations(organizationId, productId, this.range(query), query.model || 'first_touch');
    return { rows: this.winners(rows, 'topic', query.metric || 'content_quality_score'), modelVersion: LEARNING_ALGORITHM_VERSION };
  }

  async promptSuggestions(organizationId: string, productId: string, userId: string, query: LearningQueryDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const observations = await this.buildObservations(organizationId, productId, this.range(query), query.model || 'first_touch');
    const generated = this.promptSuggestionInputs(observations);
    const persisted = await this.recommendationModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), status: 'active' }).sort({ updatedAt: -1 }).lean().exec();
    return { recommendations: persisted.length ? persisted : generated, modelVersion: PROMPT_OPTIMIZATION_VERSION };
  }

  async updatePromptSuggestion(organizationId: string, productId: string, userId: string, recommendationId: string, status: 'accepted' | 'rejected') {
    await this.productsService.findOne(organizationId, productId, userId);
    return this.recommendationModel.findOneAndUpdate({ _id: new Types.ObjectId(recommendationId), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }, { $set: { status } }, { new: true }).lean().exec();
  }

  async strategyAdjustments(organizationId: string, productId: string, userId: string, query: LearningQueryDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    await this.markStaleStrategyProposals(organizationId, productId);
    const persisted = await this.proposalModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), status: 'active' }).sort({ updatedAt: -1 }).lean().exec();
    if (persisted.length) return { proposals: persisted, modelVersion: STRATEGY_ADJUSTMENT_VERSION };
    const observations = await this.buildObservations(organizationId, productId, this.range(query), query.model || 'first_touch');
    return { proposals: await this.strategyProposalInputs(organizationId, productId, observations), modelVersion: STRATEGY_ADJUSTMENT_VERSION };
  }

  async updateStrategyAdjustment(organizationId: string, productId: string, userId: string, proposalId: string, status: 'accepted' | 'rejected') {
    await this.productsService.findOne(organizationId, productId, userId);
    return this.proposalModel.findOneAndUpdate({ _id: new Types.ObjectId(proposalId), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }, { $set: { status } }, { new: true }).lean().exec();
  }

  async sprint27Context(organizationId: string, productId: string, userId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    await this.markStaleStrategyProposals(organizationId, productId);
    const proposals = await this.proposalModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), status: 'active', confidence: { $in: ['medium', 'high'] } }).sort({ updatedAt: -1 }).lean().exec();
    return { proposals, modelVersion: STRATEGY_ADJUSTMENT_VERSION, executionAllowed: false };
  }

  private async buildObservations(organizationId: string, productId: string, range: { from: Date; to: Date }, model: string) {
    const [contentQuality, contentPublication, channels, ctas, topics, email, social, revenue] = await Promise.all([
      this.contentQualityObservations(organizationId, productId, range),
      this.contentPublicationObservations(organizationId, productId, range),
      this.channelObservations(organizationId, productId, range),
      this.ctaObservations(organizationId, productId, range),
      this.topicObservations(organizationId, productId, range),
      this.emailObservations(organizationId, productId, range),
      this.socialObservations(organizationId, productId, range),
      this.revenueAttributionObservations(organizationId, productId, range, model),
    ]);
    return [...contentQuality, ...contentPublication, ...channels, ...ctas, ...topics, ...email, ...social, ...revenue];
  }

  private async contentQualityObservations(organizationId: string, productId: string, range: { from: Date; to: Date }) {
    const rows = await this.qualityModel.aggregate([
      { $match: { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), calculatedAt: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: '$contentVersionId', avgScore: { $avg: '$score' }, sampleSize: { $sum: 1 } } },
    ]).exec();
    return rows.map((row) => this.obs('content', 'content_version', row._id.toString(), 'content_quality_score', this.round(row.avgScore), row.sampleSize, [{ sourceType: 'content_quality_result', details: { contentVersionId: row._id.toString() } }]));
  }

  private async contentPublicationObservations(organizationId: string, productId: string, range: { from: Date; to: Date }) {
    const generated = await this.contentVersionModel.aggregate([
      { $match: { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), createdAt: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: '$kind', count: { $sum: 1 } } },
    ]).exec();
    const [cms, social] = await Promise.all([
      this.cmsPublicationModel.aggregate([{ $match: { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), status: { $in: ['draft_created', 'published'] }, createdAt: { $gte: range.from, $lte: range.to } } }, { $group: { _id: '$contentSnapshot', count: { $sum: 1 } } }]).exec(),
      this.socialPublicationModel.aggregate([{ $match: { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), status: 'published', createdAt: { $gte: range.from, $lte: range.to } } }, { $group: { _id: '$contentSnapshot.kind', count: { $sum: 1 } } }]).exec(),
    ]);
    const published = new Map<string, number>();
    for (const row of [...cms, ...social]) published.set(row._id || 'unknown', (published.get(row._id || 'unknown') || 0) + row.count);
    return generated.map((row) => {
      const numerator = published.get(row._id) || 0;
      return this.obs('content', 'content_kind', row._id, 'publication_rate', this.safeRatio(numerator, row.count), row.count, [{ sourceType: 'content_version', details: { generated: row.count } }, { sourceType: 'publication', details: { published: numerator } }], numerator, row.count);
    });
  }

  private async channelObservations(organizationId: string, productId: string, range: { from: Date; to: Date }) {
    const rows = await this.analyticsModel.aggregate([
      { $match: { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), occurredAt: { $gte: range.from, $lte: range.to }, eventType: { $in: ['lead_created', 'lead_qualified', 'opportunity_created', 'opportunity_won'] } } },
      { $group: { _id: { channel: '$channel', eventType: '$eventType' }, count: { $sum: 1 } } },
    ]).exec();
    const byChannel = new Map<string, Record<string, number>>();
    for (const row of rows) {
      const channel = row._id.channel || 'unknown';
      const entry = byChannel.get(channel) || {};
      entry[row._id.eventType] = row.count;
      byChannel.set(channel, entry);
    }
    const observations: ObservationInput[] = [];
    for (const [channel, counts] of byChannel) {
      observations.push(this.obs('channel', 'channel', channel, 'qualified_lead_rate', this.safeRatio(counts.lead_qualified || 0, counts.lead_created || 0), counts.lead_created || 0, [{ sourceType: 'analytics_event', details: counts }], counts.lead_qualified || 0, counts.lead_created || 0));
      observations.push(this.obs('conversion', 'channel', channel, 'lead_to_opportunity_rate', this.safeRatio(counts.opportunity_created || 0, counts.lead_created || 0), counts.lead_created || 0, [{ sourceType: 'analytics_event', details: counts }], counts.opportunity_created || 0, counts.lead_created || 0));
      observations.push(this.obs('conversion', 'channel', channel, 'lead_to_won_rate', this.safeRatio(counts.opportunity_won || 0, counts.lead_created || 0), counts.lead_created || 0, [{ sourceType: 'analytics_event', details: counts }], counts.opportunity_won || 0, counts.lead_created || 0));
    }
    return observations;
  }

  private async ctaObservations(organizationId: string, productId: string, range: { from: Date; to: Date }) {
    const rows = await this.webEventModel.aggregate([
      { $match: { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), occurredAt: { $gte: range.from, $lte: range.to }, eventType: { $in: ['page_view', 'cta_click', 'form_submit'] } } },
      { $project: { eventType: 1, sessionId: 1, pagePath: 1, ctaKey: { $ifNull: ['$properties.ctaId', { $ifNull: ['$properties.ctaText', '$pagePath'] }] } } },
      { $group: { _id: { ctaKey: '$ctaKey', eventType: '$eventType' }, count: { $sum: 1 }, sessions: { $addToSet: '$sessionId' } } },
    ]).exec();
    const byCta = new Map<string, Record<string, any>>();
    for (const row of rows) {
      const key = String(row._id.ctaKey || 'unknown');
      const entry = byCta.get(key) || { sessions: new Set<string>() };
      entry[row._id.eventType] = row.count;
      for (const session of row.sessions || []) if (session) entry.sessions.add(session);
      byCta.set(key, entry);
    }
    return [...byCta.entries()].map(([key, counts]) => this.obs('cta', 'cta', key, 'cta_click_rate', this.safeRatio(counts.cta_click || 0, counts.page_view || 0), counts.page_view || 0, [{ sourceType: 'web_analytics_event', details: { clicks: counts.cta_click || 0, views: counts.page_view || 0, formSubmits: counts.form_submit || 0, factualSessionLinkage: counts.sessions.size > 0 } }], counts.cta_click || 0, counts.page_view || 0));
  }

  private async topicObservations(organizationId: string, productId: string, range: { from: Date; to: Date }) {
    const rows = await this.contentVersionModel.aggregate([
      { $match: { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), createdAt: { $gte: range.from, $lte: range.to } } },
      { $lookup: { from: 'contentqualityresults', localField: '_id', foreignField: 'contentVersionId', as: 'quality' } },
      { $project: { topic: { $ifNull: ['$sourceSnapshot.topicId', { $ifNull: ['$groundingEvidenceSnapshot.topic', '$sourceSnapshot.title'] }] }, score: { $first: '$quality.score' } } },
      { $match: { topic: { $ne: null } } },
      { $group: { _id: '$topic', avgScore: { $avg: '$score' }, sampleSize: { $sum: 1 } } },
    ]).exec();
    return rows.map((row) => this.obs('topic', 'persisted_topic', String(row._id), 'content_quality_score', row.avgScore === null || row.avgScore === undefined ? null : this.round(row.avgScore), row.sampleSize, [{ sourceType: 'content_version', details: { persistedTopic: row._id } }]));
  }

  private async emailObservations(organizationId: string, productId: string, range: { from: Date; to: Date }) {
    const rows = await this.emailEventModel.aggregate([
      { $match: { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), occurredAt: { $gte: range.from, $lte: range.to }, eventType: { $in: ['delivered', 'opened', 'clicked'] } } },
      { $group: { _id: '$eventType', count: { $sum: 1 } } },
    ]).exec();
    const counts = Object.fromEntries(rows.map((row) => [row._id, row.count]));
    return [
      this.obs('email', 'email', 'all', 'recorded_open_rate', this.safeRatio(counts.opened || 0, counts.delivered || 0), counts.delivered || 0, [{ sourceType: 'email_event', details: counts }], counts.opened || 0, counts.delivered || 0),
      this.obs('email', 'email', 'all', 'recorded_click_rate', this.safeRatio(counts.clicked || 0, counts.delivered || 0), counts.delivered || 0, [{ sourceType: 'email_event', details: counts }], counts.clicked || 0, counts.delivered || 0),
    ];
  }

  private async socialObservations(organizationId: string, productId: string, range: { from: Date; to: Date }) {
    const rows = await this.socialMetricModel.aggregate([
      { $match: { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), fetchedAt: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: '$platform', sampleSize: { $sum: 1 }, impressions: { $sum: { $ifNull: ['$metrics.impressions', 0] } }, clicks: { $sum: { $ifNull: ['$metrics.clicks', 0] } }, likes: { $sum: { $ifNull: ['$metrics.likes', 0] } }, comments: { $sum: { $ifNull: ['$metrics.comments', 0] } }, shares: { $sum: { $ifNull: ['$metrics.shares', 0] } }, availability: { $addToSet: '$providerMetricAvailability' } } },
    ]).exec();
    const observations: ObservationInput[] = [];
    for (const row of rows) {
      const available = new Set((row.availability || []).flat());
      observations.push(this.obs('social', 'platform', row._id, 'social_impressions', available.has('impressions') ? row.impressions : null, row.sampleSize, [{ sourceType: 'social_post_metrics_snapshot', details: { providerMetricAvailability: [...available] } }]));
      observations.push(this.obs('social', 'platform', row._id, 'social_clicks', available.has('clicks') ? row.clicks : null, row.sampleSize, [{ sourceType: 'social_post_metrics_snapshot', details: { providerMetricAvailability: [...available] } }]));
      observations.push(this.obs('social', 'platform', row._id, 'social_engagement', ['likes', 'comments', 'shares'].some((key) => available.has(key)) ? row.likes + row.comments + row.shares : null, row.sampleSize, [{ sourceType: 'social_post_metrics_snapshot', details: { providerMetricAvailability: [...available] } }]));
    }
    return observations;
  }

  private async revenueAttributionObservations(organizationId: string, productId: string, range: { from: Date; to: Date }, model: string) {
    const wins = await this.opportunityModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), status: 'won', wonAt: { $gte: range.from, $lte: range.to } }).select('_id leadId amount currency wonAt').lean().exec();
    const observations: ObservationInput[] = [];
    for (const win of wins) {
      const journey = await this.touchpointModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), leadId: win.leadId, occurredAt: { $lte: win.wonAt } }).sort({ occurredAt: model === 'last_touch' ? -1 : 1 }).limit(1).lean().exec();
      const touch = journey[0];
      if (!touch) continue;
      const channel = touch.channel || 'unknown';
      observations.push(this.obs('revenue_attribution', 'channel', channel, 'attributed_wins', 1, 1, [{ sourceType: 'attribution_touchpoint', sourceId: touch._id.toString(), details: { attributionModel: model, opportunityId: win._id.toString() } }], 1, 1, undefined, model));
      if (typeof win.amount === 'number' && win.currency) observations.push(this.obs('revenue_attribution', 'channel', channel, 'attributed_won_value', win.amount, 1, [{ sourceType: 'crm_opportunity', sourceId: win._id.toString(), details: { attributionModel: model } }], undefined, undefined, win.currency, model));
    }
    return this.combineRevenue(observations);
  }

  private combineRevenue(rows: ObservationInput[]) {
    const map = new Map<string, ObservationInput>();
    for (const row of rows) {
      const key = [row.domain, row.subjectKey, row.metric, row.currency || ''].join(':');
      const current = map.get(key);
      if (!current) {
        map.set(key, { ...row });
      } else {
        current.value = (current.value || 0) + (row.value || 0);
        current.sampleSize += row.sampleSize;
        current.numerator = (current.numerator || 0) + (row.numerator || 0);
        current.denominator = (current.denominator || 0) + (row.denominator || 0);
        current.sourceReferences.push(...row.sourceReferences);
      }
    }
    return [...map.values()];
  }

  private winners(observations: ObservationInput[], domain: string, metric: string) {
    const rows = observations.filter((obs) => obs.domain === domain && obs.metric === metric && obs.value !== null && obs.sampleSize >= MIN_WINNER_SAMPLE);
    const baseline = this.average(rows.map((row) => row.value as number));
    return rows
      .map((row) => ({
        ...row,
        baselineValue: baseline,
        lift: baseline === null || baseline === 0 ? null : this.round(((row.value as number) - baseline) / baseline),
        confidence: this.confidence(row.sampleSize, row.value, baseline),
        confidenceScore: this.confidenceScore(row.sampleSize, row.value, baseline),
        winner: baseline !== null && (row.value as number) > baseline,
        observation: `${row.subjectKey} outperformed the comparable ${domain} baseline for ${metric}.`,
      }))
      .filter((row) => row.winner)
      .sort((a, b) => (b.value || 0) - (a.value || 0));
  }

  private promptSuggestionInputs(observations: ObservationInput[]) {
    const contentRows = observations.filter((obs) => obs.domain === 'content' && obs.metric === 'content_quality_score' && obs.value !== null);
    const byKind = new Map<string, ObservationInput[]>();
    for (const row of contentRows) {
      const kind = row.subjectKey.split(':')[0] || 'content';
      const group = byKind.get(kind) || [];
      group.push(row);
      byKind.set(kind, group);
    }
    const recommendations: any[] = [];
    for (const [kind, rows] of byKind) {
      if (rows.length < MIN_PROMPT_SAMPLE) continue;
      const baseline = this.average(rows.map((row) => row.value as number));
      if (baseline === null) continue;
      recommendations.push({
        recommendationType: 'prompt_dimension',
        safeDimension: 'content_kind',
        currentValue: 'mixed',
        suggestedValue: kind,
        metric: 'content_quality_score',
        currentValueMetric: baseline,
        suggestedValueMetric: baseline,
        sampleSize: rows.length,
        confidence: this.confidence(rows.length, baseline, baseline),
        evidence: rows.slice(0, 5).flatMap((row) => row.sourceReferences),
        status: 'active',
        algorithmVersion: PROMPT_OPTIMIZATION_VERSION,
        note: 'Suggestion uses stored content kind and quality outcomes only; full prompts are not stored or exposed.',
      });
    }
    return recommendations;
  }

  private async strategyProposalInputs(organizationId: string, productId: string, observations: ObservationInput[]) {
    const strategy = await this.currentApprovedStrategy(organizationId, productId);
    if (!strategy) return [];
    const channelWinner = this.winners(observations, 'channel', 'qualified_lead_rate')[0];
    const topicWinner = this.winners(observations, 'topic', 'content_quality_score')[0];
    const proposals = [channelWinner, topicWinner].filter(Boolean).map((winner: any) => ({
      recommendationType: 'strategy_adjustment',
      strategyId: strategy._id.toString(),
      strategyVersion: this.strategyVersion(strategy),
      targetSection: winner.domain === 'channel' ? 'channels' : 'content',
      adjustmentType: winner.domain === 'channel' ? 'channel_prioritization' : 'topic_prioritization',
      currentState: 'Current approved strategy remains unchanged.',
      proposedChange: `Consider giving ${winner.subjectKey} more emphasis in future planning.`,
      reason: `${winner.subjectKey} was observed to outperform the comparable baseline for ${winner.metric}.`,
      sampleSize: winner.sampleSize,
      confidence: winner.confidence,
      evidence: winner.sourceReferences,
      status: winner.confidenceScore < MIN_STRATEGY_CONFIDENCE ? 'stale' : 'active',
      algorithmVersion: STRATEGY_ADJUSTMENT_VERSION,
    }));
    return proposals;
  }

  private async persistInsights(organizationId: string, productId: string, observations: ObservationInput[]) {
    const winners = [
      ...this.winners(observations, 'content', 'content_quality_score'),
      ...this.winners(observations, 'channel', 'qualified_lead_rate'),
      ...this.winners(observations, 'cta', 'cta_click_rate'),
      ...this.winners(observations, 'topic', 'content_quality_score'),
    ];
    await this.insightModel.deleteMany({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), algorithmVersion: LEARNING_ALGORITHM_VERSION }).exec();
    if (!winners.length) return [];
    return this.insightModel.insertMany(winners.map((winner: any) => ({
      organizationId: new Types.ObjectId(organizationId),
      productId: new Types.ObjectId(productId),
      domain: winner.domain,
      subjectType: winner.subjectType,
      subjectKey: winner.subjectKey,
      metric: winner.metric,
      value: winner.value,
      baselineValue: winner.baselineValue,
      sampleSize: winner.sampleSize,
      confidence: winner.confidence,
      confidenceScore: winner.confidenceScore,
      observation: winner.observation,
      evidence: winner.sourceReferences,
      algorithmVersion: LEARNING_ALGORITHM_VERSION,
    })));
  }

  private async persistPromptSuggestions(organizationId: string, productId: string, observations: ObservationInput[]) {
    const suggestions = this.promptSuggestionInputs(observations);
    await this.recommendationModel.updateMany({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), status: 'active' }, { $set: { status: 'superseded' } }).exec();
    if (suggestions.length) await this.recommendationModel.insertMany(suggestions.map((item) => ({ ...item, organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) })));
  }

  private async persistStrategyProposals(organizationId: string, productId: string, observations: ObservationInput[]) {
    const proposals = await this.strategyProposalInputs(organizationId, productId, observations);
    await this.markStaleStrategyProposals(organizationId, productId);
    if (proposals.length) await this.proposalModel.insertMany(proposals.map((item) => ({ ...item, organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) })));
  }

  private async markStaleStrategyProposals(organizationId: string, productId: string) {
    const strategy = await this.currentApprovedStrategy(organizationId, productId);
    if (!strategy) return;
    await this.proposalModel.updateMany({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), status: 'active', strategyVersion: { $ne: this.strategyVersion(strategy) } }, { $set: { status: 'stale' } }).exec();
  }

  private async currentApprovedStrategy(organizationId: string, productId: string) {
    return this.strategyReviewModel.findOne({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), status: 'approved' }).sort({ approvedAt: -1, updatedAt: -1 }).lean().exec();
  }

  private strategyVersion(strategy: any) {
    return (strategy.reviewedStrategyGeneratedAt || strategy.approvedAt || strategy.updatedAt || strategy.createdAt || new Date(0)).toISOString();
  }

  private overview(observations: ObservationInput[]) {
    return {
      observationCount: observations.length,
      domains: [...new Set(observations.map((obs) => obs.domain))],
      unsupportedMetrics: METRIC_REGISTRY.filter((metric) => !metric.supported).map((metric) => metric.metric),
      confidenceCaps: {
        analyticsCoverage: observations.some((obs) => obs.sourceReferences.some((ref) => ref.sourceType === 'analytics_event')) ? 'available' : 'limited',
        attributionCoverage: observations.some((obs) => obs.domain === 'revenue_attribution') ? 'available' : 'limited',
      },
    };
  }

  private dataHealth(observations: ObservationInput[]) {
    return {
      observationCount: observations.length,
      hasInvalidRatios: observations.some((obs) => typeof obs.denominator === 'number' && obs.denominator === 0 && obs.value !== null),
      currencies: [...new Set(observations.map((obs) => obs.currency).filter(Boolean))],
      algorithmVersion: LEARNING_ALGORITHM_VERSION,
    };
  }

  private obs(domain: string, subjectType: string, subjectKey: string, metric: string, value: number | null, sampleSize: number, sourceReferences: ObservationInput['sourceReferences'], numerator?: number | null, denominator?: number | null, currency?: string, attributionModel?: string): ObservationInput {
    return { domain, subjectType, subjectKey, metric, value, numerator, denominator, sampleSize, currency, attributionModel, sourceReferences };
  }

  private safeRatio(numerator: number, denominator: number) {
    return denominator > 0 ? this.round(numerator / denominator) : null;
  }

  private average(values: number[]) {
    const clean = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
    return clean.length ? this.round(clean.reduce((sum, value) => sum + value, 0) / clean.length) : null;
  }

  private confidence(sampleSize: number, value?: number | null, baseline?: number | null) {
    const score = this.confidenceScore(sampleSize, value, baseline);
    const level = sampleSize < MIN_WINNER_SAMPLE ? 'insufficient' : score >= 0.7 ? 'high' : score >= 0.4 ? 'medium' : 'low';
    return level as 'insufficient' | 'low' | 'medium' | 'high';
  }

  private confidenceScore(sampleSize: number, value?: number | null, baseline?: number | null) {
    const lift = value !== null && value !== undefined && baseline ? Math.abs(value - baseline) / Math.max(Math.abs(baseline), 1) : 0;
    return this.round(Math.min(1, (sampleSize / 25) * 0.75 + Math.min(lift, 1) * 0.25));
  }

  private round(value: number) {
    return Math.round(value * 10000) / 10000;
  }

  private range(query: LearningQueryDto) {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - LEARNING_STALE_DAYS * 86400000);
    return { from, to };
  }
}
