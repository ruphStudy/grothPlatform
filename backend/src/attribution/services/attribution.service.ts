import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Campaign, CampaignDocument } from '../../campaigns/schemas/campaign.schema';
import { CmsPublication, CmsPublicationDocument } from '../../cms-integrations/schemas/cms-publication.schema';
import { ContentArtifact, ContentArtifactDocument } from '../../content-generation/schemas/content-artifact.schema';
import { CrmOpportunity, CrmOpportunityDocument } from '../../crm/schemas/crm-opportunity.schema';
import { EmailEvent, EmailEventDocument } from '../../email/schemas/email-event.schema';
import { EmailMessage, EmailMessageDocument } from '../../email/schemas/email-message.schema';
import { LeadSourceEvent, LeadSourceEventDocument } from '../../leads/schemas/lead-source-event.schema';
import { Lead, LeadDocument } from '../../leads/schemas/lead.schema';
import { ProductsService } from '../../products/products.service';
import { AttributionQueryDto } from '../dto/attribution.dto';
import { AttributionModel, AttributionTouchpoint, AttributionTouchpointDocument, AttributionTouchpointType } from '../schemas/attribution-touchpoint.schema';

const BACKFILL_LIMIT = Number(process.env.ATTRIBUTION_BACKFILL_LIMIT || 500);
const LOOKBACK_DAYS = Number(process.env.ATTRIBUTION_LOOKBACK_DAYS || 90);
const MODEL_VERSION = 'sprint25-attribution:v1';

type Touch = AttributionTouchpointDocument | Record<string, any>;
type Credit = { touchpoint: Touch; credit: number; attributedValue?: number; currency?: string };
type OpportunityCreditRow = { opportunity: CrmOpportunityDocument; journey: AttributionTouchpointDocument[]; credits: Credit[] };

@Injectable()
export class AttributionService {
  constructor(
    @InjectModel(AttributionTouchpoint.name) private readonly touchpointModel: Model<AttributionTouchpointDocument>,
    @InjectModel(Lead.name) private readonly leadModel: Model<LeadDocument>,
    @InjectModel(LeadSourceEvent.name) private readonly leadSourceEventModel: Model<LeadSourceEventDocument>,
    @InjectModel(CrmOpportunity.name) private readonly opportunityModel: Model<CrmOpportunityDocument>,
    @InjectModel(EmailMessage.name) private readonly emailMessageModel: Model<EmailMessageDocument>,
    @InjectModel(EmailEvent.name) private readonly emailEventModel: Model<EmailEventDocument>,
    @InjectModel(CmsPublication.name) private readonly cmsPublicationModel: Model<CmsPublicationDocument>,
    @InjectModel(ContentArtifact.name) private readonly contentArtifactModel: Model<ContentArtifactDocument>,
    @InjectModel(Campaign.name) private readonly campaignModel: Model<CampaignDocument>,
    private readonly productsService: ProductsService,
  ) {}

  async backfill(organizationId: string, productId: string, userId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const org = new Types.ObjectId(organizationId);
    const product = new Types.ObjectId(productId);
    const [leadSources, emails] = await Promise.all([
      this.backfillLeadSourceEvents(org, product),
      this.backfillEmailEvents(org, product),
    ]);
    return { status: 'ok', seen: leadSources.seen + emails.seen, inserted: leadSources.inserted + emails.inserted, modelVersion: MODEL_VERSION };
  }

  async dashboard(organizationId: string, productId: string, userId: string, query: AttributionQueryDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const rows = await this.opportunityCredits(organizationId, productId, query, 'all');
    const won = rows.filter((row) => row.opportunity.status === 'won');
    const attributed = won.filter((row) => row.credits.length);
    return {
      model: query.model || 'first_touch',
      modelVersion: MODEL_VERSION,
      disclaimer: 'Attribution assigns credit using recorded touchpoints and the selected model. It does not prove causation.',
      summary: {
        wonOpportunities: won.length,
        wonOpportunitiesWithAttribution: attributed.length,
        unattributedWonOpportunities: won.length - attributed.length,
        attributedLeads: new Set(attributed.map((row) => row.opportunity.leadId.toString())).size,
        attributionCoverage: won.length ? attributed.length / won.length : null,
        totalWonValueByCurrency: this.valueByCurrency(won.map((row) => ({ amount: row.opportunity.amount, currency: row.opportunity.currency, credit: 1 }))),
        attributedWonValueByCurrency: this.valueByCurrency(attributed.flatMap((row) => row.credits.map((credit) => ({ amount: row.opportunity.amount, currency: row.opportunity.currency, credit: credit.credit })))),
      },
      channels: this.aggregate(won, (touch) => touch.channel || 'unknown'),
      utm: this.aggregate(won, (touch) => `${touch.utmSource || 'unknown'} / ${touch.utmMedium || 'unknown'} / ${touch.utmCampaign || 'unknown'}`),
      content: this.aggregate(won, (touch) => this.contentKey(touch)),
      campaigns: this.aggregate(won, (touch) => touch.campaignId?.toString() || 'unattributed'),
      opportunities: won.slice(0, 25).map((row) => this.drilldown(row)),
      dataHealth: await this.dataHealthCounts(organizationId, productId, query),
    };
  }

  async utm(organizationId: string, productId: string, userId: string, query: AttributionQueryDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    return { model: query.model || 'first_touch', rows: this.aggregate(await this.opportunityCredits(organizationId, productId, query, 'utm'), (touch) => `${touch.utmSource || 'unknown'} / ${touch.utmMedium || 'unknown'} / ${touch.utmCampaign || 'unknown'}`), modelVersion: MODEL_VERSION };
  }

  async content(organizationId: string, productId: string, userId: string, query: AttributionQueryDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    return { model: query.model || 'first_touch', rows: this.aggregate(await this.opportunityCredits(organizationId, productId, query, 'content'), (touch) => this.contentKey(touch)), modelVersion: MODEL_VERSION };
  }

  async campaigns(organizationId: string, productId: string, userId: string, query: AttributionQueryDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    return { model: query.model || 'first_touch', rows: this.aggregate(await this.opportunityCredits(organizationId, productId, query, 'campaign'), (touch) => touch.campaignId?.toString() || 'unattributed'), modelVersion: MODEL_VERSION };
  }

  async revenueMap(organizationId: string, productId: string, userId: string, query: AttributionQueryDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const rows = await this.opportunityCredits(organizationId, productId, query, 'all');
    const byLead = new Map<string, any>();
    for (const row of rows) {
      const leadId = row.opportunity.leadId.toString();
      const current = byLead.get(leadId) ?? { leadId, wonOpportunityCount: 0, valuesByCurrency: [], opportunities: [] };
      if (row.opportunity.status === 'won') {
        current.wonOpportunityCount += 1;
        current.opportunities.push(this.drilldown(row));
      }
      byLead.set(leadId, current);
    }
    for (const item of byLead.values()) {
      item.valuesByCurrency = this.valueByCurrency(item.opportunities.map((op: any) => ({ amount: op.amount, currency: op.currency, credit: 1 })));
    }
    return { model: query.model || 'first_touch', rows: [...byLead.values()], modelVersion: MODEL_VERSION };
  }

  async journey(organizationId: string, productId: string, userId: string, opportunityId: string, query: AttributionQueryDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const rows = await this.opportunityCredits(organizationId, productId, { ...query, opportunityId }, 'all');
    if (!rows[0]) throw new NotFoundException('attribution_opportunity_not_found');
    return this.drilldown(rows[0]);
  }

  private async opportunityCredits(organizationId: string, productId: string, query: AttributionQueryDto, dimension: 'all' | 'utm' | 'content' | 'campaign') {
    const range = this.range(query);
    const match: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), status: 'won', wonAt: { $gte: range.from, $lte: range.to } };
    if (query.leadId) match.leadId = new Types.ObjectId(query.leadId);
    if (query.opportunityId) match._id = new Types.ObjectId(query.opportunityId);
    const opportunities = await this.opportunityModel.find(match as Record<string, unknown>).sort({ wonAt: -1 }).limit(250).exec();
    const rows: OpportunityCreditRow[] = [];
    for (const opportunity of opportunities) {
      const journey = await this.journeyForOpportunity(organizationId, productId, opportunity, query, dimension);
      const winning = this.pick(journey, query.model || 'first_touch');
      rows.push({ opportunity, journey, credits: winning ? [{ touchpoint: winning, credit: 1, attributedValue: this.attributedValue(opportunity.amount, 1), currency: opportunity.currency }] as Credit[] : [] });
    }
    return rows;
  }

  private async journeyForOpportunity(organizationId: string, productId: string, opportunity: CrmOpportunityDocument, query: AttributionQueryDto, dimension: 'all' | 'utm' | 'content' | 'campaign') {
    const wonAt = opportunity.wonAt;
    if (!wonAt) return [];
    const from = new Date(wonAt.getTime() - LOOKBACK_DAYS * 86400000);
    const base: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), leadId: opportunity.leadId, occurredAt: { $gte: from, $lte: wonAt } };
    if (query.channel) base.channel = query.channel;
    if (query.campaignId) base.campaignId = new Types.ObjectId(query.campaignId);
    if (query.utmSource) base.utmSource = this.norm(query.utmSource, 120);
    if (query.utmMedium) base.utmMedium = this.norm(query.utmMedium, 120);
    if (query.utmCampaign) base.utmCampaign = this.norm(query.utmCampaign, 160);
    const touches = await this.touchpointModel.find(base).sort({ occurredAt: 1, createdAt: 1, sourceEntityId: 1 }).exec();
    return touches.filter((touch) => this.dimensionEligible(touch, dimension));
  }

  private pick(journey: AttributionTouchpointDocument[], model: AttributionModel) {
    if (!journey.length) return undefined;
    return model === 'last_touch' ? journey[journey.length - 1] : journey[0];
  }

  private dimensionEligible(touch: AttributionTouchpointDocument, dimension: 'all' | 'utm' | 'content' | 'campaign') {
    if (dimension === 'utm') return !!(touch.utmSource || touch.utmMedium || touch.utmCampaign || touch.referrerDomain);
    if (dimension === 'content') return !!(touch.contentArtifactId || touch.contentVersionId || touch.metadata?.emailTemplateId);
    if (dimension === 'campaign') return !!touch.campaignId;
    return true;
  }

  private async backfillLeadSourceEvents(organizationId: Types.ObjectId, productId: Types.ObjectId) {
    const events = await this.leadSourceEventModel.find({ organizationId, productId }).sort({ occurredAt: -1 }).limit(BACKFILL_LIMIT).exec();
    let inserted = 0;
    const cms = await this.cmsPublicationModel.find({ organizationId, productId, externalPostUrl: { $exists: true } }).limit(BACKFILL_LIMIT).exec();
    for (const event of events) {
      const content = cms.find((pub) => !!pub.externalPostUrl && [event.sourceUrl, event.landingPageUrl].filter(Boolean).some((url) => this.sameUrl(url, pub.externalPostUrl)));
      inserted += await this.upsertTouchpoint({
        organizationId,
        productId,
        leadId: event.leadId,
        campaignId: event.campaignId,
        contentArtifactId: content?.contentArtifactId,
        contentVersionId: content?.contentVersionId,
        channel: this.channel(event.channel || event.platform || event.sourceType),
        platform: event.platform,
        sourceType: 'lead_source_event',
        sourceEntityType: 'lead_source_event',
        sourceEntityId: event._id,
        touchpointType: content ? 'blog_visit' : 'lead_capture',
        occurredAt: event.occurredAt,
        utmSource: this.norm(event.utmSource, 120),
        utmMedium: this.norm(event.utmMedium, 120),
        utmCampaign: this.norm(event.utmCampaign, 160),
        utmTerm: this.norm(event.utmTerm, 160),
        utmContent: this.norm(event.utmContent, 160),
        referrerDomain: this.domain(event.referrerUrl),
        metadata: this.metadata({ captureMethod: event.captureMethod, sourceName: event.sourceName }),
        deduplicationKey: `lead-source:${event._id}`,
      });
    }
    return { seen: events.length, inserted };
  }

  private async backfillEmailEvents(organizationId: Types.ObjectId, productId: Types.ObjectId) {
    const events = await this.emailEventModel.find({ organizationId, productId, eventType: { $in: ['delivered', 'opened', 'clicked'] } }).sort({ occurredAt: -1 }).limit(BACKFILL_LIMIT).exec();
    const messages = await this.emailMessageModel.find({ _id: { $in: events.map((event) => event.emailMessageId) }, organizationId, productId }).exec();
    const messageMap = new Map(messages.map((message) => [message._id.toString(), message]));
    let inserted = 0;
    for (const event of events) {
      const message = messageMap.get(event.emailMessageId.toString());
      if (!message?.leadId) continue;
      inserted += await this.upsertTouchpoint({
        organizationId,
        productId,
        leadId: message.leadId,
        opportunityId: message.opportunityId,
        campaignId: message.campaignId,
        channel: 'email',
        platform: message.provider,
        sourceType: 'email_event',
        sourceEntityType: 'email_event',
        sourceEntityId: event._id,
        touchpointType: (`email_${event.eventType}` as AttributionTouchpointType),
        occurredAt: event.occurredAt,
        metadata: this.metadata({ emailTemplateId: message.templateId?.toString(), templateVersion: message.templateVersion, linkUrlDomain: this.domain(event.linkUrl) }),
        deduplicationKey: `email:${event._id}`,
      });
    }
    return { seen: events.length, inserted };
  }

  private async upsertTouchpoint(doc: Partial<AttributionTouchpoint> & { deduplicationKey: string }) {
    const result = await this.touchpointModel.updateOne({ organizationId: doc.organizationId, productId: doc.productId, deduplicationKey: doc.deduplicationKey }, { $setOnInsert: doc }, { upsert: true }).exec();
    return result.upsertedCount === 1 ? 1 : 0;
  }

  private aggregate(rows: OpportunityCreditRow[], keyFn: (touch: any) => string) {
    const map = new Map<string, any>();
    for (const row of rows) {
      for (const credit of row.credits) {
        const key = keyFn(credit.touchpoint);
        const current = map.get(key) ?? { key, attributedLeads: new Set<string>(), attributedOpportunities: 0, attributedWins: 0, attributedValueByCurrency: [] as { currency: string; amount: number }[] };
        current.attributedLeads.add(row.opportunity.leadId.toString());
        current.attributedOpportunities += 1;
        current.attributedWins += row.opportunity.status === 'won' ? 1 : 0;
        current.attributedValueByCurrency = this.mergeCurrency(current.attributedValueByCurrency, this.valueByCurrency([{ amount: row.opportunity.amount, currency: row.opportunity.currency, credit: credit.credit }]));
        map.set(key, current);
      }
    }
    return [...map.values()].map((item) => ({ ...item, attributedLeads: item.attributedLeads.size }));
  }

  private async dataHealthCounts(organizationId: string, productId: string, query: AttributionQueryDto) {
    const range = this.range(query);
    const match = { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), status: 'won', wonAt: { $gte: range.from, $lte: range.to } };
    const wins = await this.opportunityModel.find(match as Record<string, unknown>, { leadId: 1, wonAt: 1 }).limit(250).exec();
    const leadIds = wins.map((win) => win.leadId);
    const touchpoints = await this.touchpointModel.find({ organizationId: match.organizationId, productId: match.productId, leadId: { $in: leadIds } }).exec();
    return {
      wonOpportunities: wins.length,
      winsWithLead: wins.filter((win) => win.leadId).length,
      winsWithTouchpoints: new Set(touchpoints.map((touch) => touch.leadId.toString())).size,
      winsWithUtm: new Set(touchpoints.filter((touch) => touch.utmSource || touch.utmMedium || touch.utmCampaign).map((touch) => touch.leadId.toString())).size,
      winsWithCampaignLinkage: new Set(touchpoints.filter((touch) => touch.campaignId).map((touch) => touch.leadId.toString())).size,
      winsWithContentLinkage: new Set(touchpoints.filter((touch) => touch.contentArtifactId || touch.contentVersionId || touch.metadata?.emailTemplateId).map((touch) => touch.leadId.toString())).size,
      unattributedWins: wins.length - new Set(touchpoints.map((touch) => touch.leadId.toString())).size,
    };
  }

  private drilldown(row: OpportunityCreditRow) {
    const creditedIds = new Set(row.credits.map((credit) => credit.touchpoint._id?.toString()));
    return {
      opportunityId: row.opportunity._id.toString(),
      leadId: row.opportunity.leadId.toString(),
      wonAt: row.opportunity.wonAt,
      amount: row.opportunity.amount,
      currency: row.opportunity.currency,
      status: row.opportunity.status,
      modelVersion: MODEL_VERSION,
      attributionStatus: row.credits.length ? 'attributed' : 'unattributed',
      credits: row.credits.map((credit) => ({ touchpointId: credit.touchpoint._id?.toString(), credit: credit.credit, attributedValue: credit.attributedValue, currency: credit.currency, channel: credit.touchpoint.channel, campaignId: credit.touchpoint.campaignId?.toString(), contentArtifactId: credit.touchpoint.contentArtifactId?.toString(), contentVersionId: credit.touchpoint.contentVersionId?.toString() })),
      touchpoints: row.journey.map((touch) => ({ id: touch._id?.toString(), occurredAt: touch.occurredAt, channel: touch.channel, platform: touch.platform, touchpointType: touch.touchpointType, campaignId: touch.campaignId?.toString(), contentArtifactId: touch.contentArtifactId?.toString(), contentVersionId: touch.contentVersionId?.toString(), utmSource: touch.utmSource, utmMedium: touch.utmMedium, utmCampaign: touch.utmCampaign, credited: creditedIds.has(touch._id?.toString()) })),
    };
  }

  private range(query: AttributionQueryDto) {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * 86400000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) throw new BadRequestException('attribution_invalid_range');
    if (to.getTime() - from.getTime() > 365 * 86400000) throw new BadRequestException('attribution_range_too_large');
    return { from, to };
  }

  private valueByCurrency(items: { amount?: number; currency?: string; credit: number }[]) {
    const map = new Map<string, number>();
    for (const item of items) {
      if (typeof item.amount !== 'number' || !item.currency) continue;
      const amount = this.attributedValue(item.amount, item.credit);
      if (amount === undefined) continue;
      map.set(item.currency, (map.get(item.currency) || 0) + amount);
    }
    return [...map.entries()].map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }));
  }

  private mergeCurrency(a: { currency: string; amount: number }[], b: { currency: string; amount: number }[]) {
    return this.valueByCurrency([...a.map((item) => ({ ...item, credit: 1 })), ...b.map((item) => ({ ...item, credit: 1 }))]);
  }

  private attributedValue(amount: number | undefined, credit: number) {
    return typeof amount === 'number' ? Math.round(amount * credit * 100) / 100 : undefined;
  }

  private contentKey(touch: any) {
    return touch.contentArtifactId?.toString() || (touch.metadata?.emailTemplateId ? `email-template:${touch.metadata.emailTemplateId}` : 'unattributed');
  }

  private norm(value: unknown, max: number) {
    return typeof value === 'string' && value.trim() ? value.trim().toLowerCase().slice(0, max) : undefined;
  }

  private channel(value: string) {
    if (['website_form', 'landing_page'].includes(value)) return 'website';
    return value.slice(0, 60);
  }

  private domain(value?: string) {
    if (!value) return undefined;
    try { return new URL(value).hostname.toLowerCase().slice(0, 200); } catch { return undefined; }
  }

  private sameUrl(left?: string, right?: string) {
    if (!left || !right) return false;
    try {
      const a = new URL(left);
      const b = new URL(right);
      return a.origin === b.origin && a.pathname.replace(/\/$/, '') === b.pathname.replace(/\/$/, '');
    } catch {
      return left === right;
    }
  }

  private metadata(input: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(input).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))) as Record<string, string | number | boolean>;
  }
}
