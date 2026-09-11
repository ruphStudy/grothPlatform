import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Campaign, CampaignDocument } from '../../campaigns/schemas/campaign.schema';
import { CrmOpportunity, CrmOpportunityDocument } from '../../crm/schemas/crm-opportunity.schema';
import { LeadQualification, LeadQualificationDocument } from '../../leads/schemas/lead-qualification.schema';
import { LeadSourceEvent, LeadSourceEventDocument } from '../../leads/schemas/lead-source-event.schema';
import { Lead, LeadDocument } from '../../leads/schemas/lead.schema';
import { ProductsService } from '../../products/products.service';
import { AnalyticsDashboardQueryDto } from '../dto/analytics.dto';
import type { AnalyticsChannel } from '../types/analytics.types';

@Injectable()
export class AnalyticsFunnelService {
  constructor(
    @InjectModel(Lead.name) private readonly leadModel: Model<LeadDocument>,
    @InjectModel(LeadSourceEvent.name) private readonly sourceEventModel: Model<LeadSourceEventDocument>,
    @InjectModel(LeadQualification.name) private readonly qualificationModel: Model<LeadQualificationDocument>,
    @InjectModel(CrmOpportunity.name) private readonly opportunityModel: Model<CrmOpportunityDocument>,
    @InjectModel(Campaign.name) private readonly campaignModel: Model<CampaignDocument>,
    private readonly productsService: ProductsService,
  ) {}

  async leadFunnel(organizationId: string, productId: string, userId: string, query: AnalyticsDashboardQueryDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    await this.assertCampaign(organizationId, productId, query.campaignId);
    const range = this.range(query);
    const leadQuery: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), createdAt: { $gte: range.from, $lte: range.to } };
    if (query.campaignId) leadQuery.campaignId = new Types.ObjectId(query.campaignId);
    let leads = await this.leadModel.find(leadQuery).sort({ createdAt: 1 }).limit(5000).exec();
    const firstSources = await this.firstSourceMap(organizationId, productId, leads.map((lead) => lead._id));
    if (query.channel) leads = leads.filter((lead) => this.sourceChannel(firstSources.get(lead._id.toString())) === query.channel);
    const leadIds = leads.map((lead) => lead._id);
    const [qualifications, opportunities] = await Promise.all([
      leadIds.length ? this.qualificationModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), leadId: { $in: leadIds }, qualificationStatus: 'qualified' }).exec() : [],
      leadIds.length ? this.opportunityModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), leadId: { $in: leadIds }, ...(query.campaignId ? { campaignId: new Types.ObjectId(query.campaignId) } : {}) }).sort({ createdAt: 1 }).exec() : [],
    ]);
    const qualifiedByLead = new Map<string, LeadQualificationDocument>(qualifications.map((qualification) => [qualification.leadId.toString(), qualification] as [string, LeadQualificationDocument]));
    const opportunitiesByLead = new Map<string, CrmOpportunityDocument[]>();
    for (const opportunity of opportunities) opportunitiesByLead.set(opportunity.leadId.toString(), [...(opportunitiesByLead.get(opportunity.leadId.toString()) ?? []), opportunity]);
    const qualifiedLeads = leads.filter((lead) => qualifiedByLead.has(lead._id.toString()));
    const opportunityLeads = leads.filter((lead) => (opportunitiesByLead.get(lead._id.toString()) ?? []).length > 0);
    const wonLeads = leads.filter((lead) => (opportunitiesByLead.get(lead._id.toString()) ?? []).some((opportunity) => opportunity.status === 'won'));
    const lostLeads = leads.filter((lead) => (opportunitiesByLead.get(lead._id.toString()) ?? []).some((opportunity) => opportunity.status === 'lost'));
    return {
      cohort: { from: range.from, to: range.to, semantics: 'Leads created in selected period', cohortSize: leads.length, channelRule: query.channel ? 'Lead first recorded source channel' : undefined },
      stages: [
        this.stage('lead_created', 'Lead Created', leads.length, undefined, leads.length),
        this.stage('lead_qualified', 'Qualified', qualifiedLeads.length, leads.length, leads.length),
        this.stage('opportunity_created', 'Opportunity', opportunityLeads.length, qualifiedLeads.length, leads.length),
        this.stage('opportunity_won', 'Won', wonLeads.length, opportunityLeads.length, leads.length),
        this.stage('opportunity_lost', 'Lost', lostLeads.length, opportunityLeads.length, leads.length),
      ],
      durations: {
        timeToQualification: this.durationStats(leads.map((lead) => this.hoursBetween(lead.createdAt, qualifiedByLead.get(lead._id.toString())?.evaluatedAt))),
        timeToOpportunity: this.durationStats(leads.map((lead) => this.hoursBetween(lead.createdAt, opportunitiesByLead.get(lead._id.toString())?.[0]?.createdAt))),
        timeToWonFromLead: this.durationStats(leads.map((lead) => this.hoursBetween(lead.createdAt, (opportunitiesByLead.get(lead._id.toString()) ?? []).find((opportunity) => opportunity.status === 'won')?.wonAt))),
      },
      breakdowns: {
        byCampaign: await this.byCampaign(organizationId, productId, leads, qualifiedByLead, opportunitiesByLead),
        byChannel: this.byChannel(leads, firstSources, qualifiedByLead, opportunitiesByLead),
      },
      attribution: null,
    };
  }

  private stage(key: string, label: string, count: number, previous: number | undefined, start: number) {
    const dropOff = previous === undefined ? 0 : Math.max(previous - count, 0);
    return {
      key,
      label,
      count,
      conversionFromPrevious: previous === undefined ? null : previous ? count / previous : null,
      conversionFromStart: start ? count / start : null,
      dropOffFromPrevious: previous === undefined ? null : dropOff,
      dropOffRateFromPrevious: previous === undefined ? null : previous ? dropOff / previous : null,
    };
  }

  private async byCampaign(organizationId: string, productId: string, leads: LeadDocument[], qualifications: Map<string, LeadQualificationDocument>, opportunitiesByLead: Map<string, CrmOpportunityDocument[]>) {
    const campaignIds = [...new Set(leads.map((lead) => lead.campaignId?.toString()).filter((id): id is string => Boolean(id)))];
    const campaigns = campaignIds.length ? await this.campaignModel.find({ _id: { $in: campaignIds.map((id) => new Types.ObjectId(id)) }, organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).exec() : [];
    const names = new Map(campaigns.map((campaign) => [campaign._id.toString(), campaign.name]));
    return campaignIds.map((campaignId) => {
      const scoped = leads.filter((lead) => lead.campaignId?.toString() === campaignId);
      return this.breakdown(campaignId, names.get(campaignId) || campaignId, scoped, qualifications, opportunitiesByLead);
    });
  }

  private byChannel(leads: LeadDocument[], firstSources: Map<string, LeadSourceEventDocument>, qualifications: Map<string, LeadQualificationDocument>, opportunitiesByLead: Map<string, CrmOpportunityDocument[]>) {
    const channels = [...new Set(leads.map((lead) => this.sourceChannel(firstSources.get(lead._id.toString()))))];
    return channels.map((channel) => this.breakdown(channel, channel, leads.filter((lead) => this.sourceChannel(firstSources.get(lead._id.toString())) === channel), qualifications, opportunitiesByLead));
  }

  private breakdown(key: string, label: string, leads: LeadDocument[], qualifications: Map<string, LeadQualificationDocument>, opportunitiesByLead: Map<string, CrmOpportunityDocument[]>) {
    const qualified = leads.filter((lead) => qualifications.has(lead._id.toString())).length;
    const opportunities = leads.filter((lead) => (opportunitiesByLead.get(lead._id.toString()) ?? []).length > 0).length;
    const won = leads.filter((lead) => (opportunitiesByLead.get(lead._id.toString()) ?? []).some((opportunity) => opportunity.status === 'won')).length;
    return { key, label, leads: leads.length, qualified, opportunities, won, leadToWonRate: leads.length ? won / leads.length : null };
  }

  private async firstSourceMap(organizationId: string, productId: string, leadIds: Types.ObjectId[]) {
    const docs = leadIds.length ? await this.sourceEventModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), leadId: { $in: leadIds } }).sort({ occurredAt: 1 }).exec() : [];
    const map = new Map<string, LeadSourceEventDocument>();
    for (const doc of docs) if (!map.has(doc.leadId.toString())) map.set(doc.leadId.toString(), doc);
    return map;
  }

  private sourceChannel(source?: LeadSourceEventDocument): AnalyticsChannel {
    if (!source) return 'other';
    if (source.platform && ['linkedin', 'x', 'facebook', 'instagram'].includes(source.platform)) return source.platform as AnalyticsChannel;
    if (source.channel && ['organic', 'social', 'email', 'blog', 'website', 'crm', 'direct', 'import', 'manual', 'other'].includes(source.channel)) return source.channel as AnalyticsChannel;
    if (source.sourceType === 'website_form' || source.sourceType === 'landing_page') return 'website';
    if (source.sourceType === 'social') return 'social';
    if (source.sourceType === 'cms') return 'blog';
    if (source.sourceType === 'manual') return 'manual';
    if (source.sourceType === 'import') return 'import';
    return 'other';
  }

  private durationStats(values: Array<number | undefined>) {
    const numbers = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)).sort((a, b) => a - b);
    if (!numbers.length) return { medianHours: null, averageHours: null, sampleSize: 0 };
    const mid = Math.floor(numbers.length / 2);
    const median = numbers.length % 2 ? numbers[mid] : (numbers[mid - 1] + numbers[mid]) / 2;
    return { medianHours: median, averageHours: numbers.reduce((sum, value) => sum + value, 0) / numbers.length, sampleSize: numbers.length };
  }

  private hoursBetween(from?: Date, to?: Date) {
    if (!from || !to || to < from) return undefined;
    return (to.getTime() - from.getTime()) / (60 * 60 * 1000);
  }

  private async assertCampaign(organizationId: string, productId: string, campaignId?: string) {
    if (!campaignId) return;
    const exists = await this.campaignModel.exists({ _id: new Types.ObjectId(campaignId), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) });
    if (!exists) throw new BadRequestException('analytics_campaign_scope_invalid');
  }

  private range(query: AnalyticsDashboardQueryDto) {
    const to = query.to ? new Date(query.to) : new Date();
    let from = query.from ? new Date(query.from) : new Date(to.getTime() - (query.range === '7d' ? 7 : query.range === '90d' ? 90 : 30) * 24 * 60 * 60 * 1000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) throw new BadRequestException('analytics_invalid_range');
    return { from, to };
  }
}
