import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Campaign, CampaignDocument } from '../../campaigns/schemas/campaign.schema';
import { CmsPublication, CmsPublicationDocument } from '../../cms-integrations/schemas/cms-publication.schema';
import { ContentVersion, ContentVersionDocument } from '../../content-generation/schemas/content-version.schema';
import { CreativeAsset, CreativeAssetDocument } from '../../creative/schemas/creative-asset.schema';
import { CrmOpportunity, CrmOpportunityDocument } from '../../crm/schemas/crm-opportunity.schema';
import { EmailEvent, EmailEventDocument } from '../../email/schemas/email-event.schema';
import { EmailMessage, EmailMessageDocument } from '../../email/schemas/email-message.schema';
import { LeadQualification, LeadQualificationDocument } from '../../leads/schemas/lead-qualification.schema';
import { LeadSourceEvent, LeadSourceEventDocument } from '../../leads/schemas/lead-source-event.schema';
import { Lead, LeadDocument } from '../../leads/schemas/lead.schema';
import { ProductsService } from '../../products/products.service';
import { SocialPublication, SocialPublicationDocument } from '../../social-publishing/schemas/social-publication.schema';
import { AnalyticsEvent, AnalyticsEventDocument } from '../schemas/analytics-event.schema';
import { ANALYTICS_CHANNELS, ANALYTICS_ENTITY_TYPES, ANALYTICS_EVENT_TYPES, ANALYTICS_SOURCE_TYPES } from '../types/analytics.types';
import type { AnalyticsChannel, AnalyticsEntityType, AnalyticsEventType, AnalyticsSourceType } from '../types/analytics.types';

const BACKFILL_BATCH_SIZE = Number(process.env.ANALYTICS_BACKFILL_BATCH_SIZE || 500);
const SAFE_METADATA_KEYS = new Set(['platform', 'templateId', 'sequenceId', 'emailCampaignId', 'stageId', 'sourceName', 'contentKind', 'creativeKind', 'status', 'source', 'medium', 'campaignName', 'term', 'content', 'siteId', 'pagePath', 'eventType']);

interface IngestInput {
  organizationId: Types.ObjectId | string;
  productId: Types.ObjectId | string;
  campaignId?: Types.ObjectId | string;
  eventType: AnalyticsEventType;
  channel: AnalyticsChannel;
  platform?: string;
  sourceType: AnalyticsSourceType;
  entityType: AnalyticsEntityType;
  entityId: Types.ObjectId | string;
  leadId?: Types.ObjectId | string;
  opportunityId?: Types.ObjectId | string;
  occurredAt: Date;
  numericValue?: number;
  currency?: string;
  metadata?: Record<string, unknown>;
  deduplicationKey: string;
}

@Injectable()
export class AnalyticsEventService {
  constructor(
    @InjectModel(AnalyticsEvent.name) private readonly analyticsEventModel: Model<AnalyticsEventDocument>,
    @InjectModel(Lead.name) private readonly leadModel: Model<LeadDocument>,
    @InjectModel(LeadSourceEvent.name) private readonly leadSourceEventModel: Model<LeadSourceEventDocument>,
    @InjectModel(LeadQualification.name) private readonly leadQualificationModel: Model<LeadQualificationDocument>,
    @InjectModel(CrmOpportunity.name) private readonly opportunityModel: Model<CrmOpportunityDocument>,
    @InjectModel(EmailMessage.name) private readonly emailMessageModel: Model<EmailMessageDocument>,
    @InjectModel(EmailEvent.name) private readonly emailEventModel: Model<EmailEventDocument>,
    @InjectModel(SocialPublication.name) private readonly socialPublicationModel: Model<SocialPublicationDocument>,
    @InjectModel(CmsPublication.name) private readonly cmsPublicationModel: Model<CmsPublicationDocument>,
    @InjectModel(ContentVersion.name) private readonly contentVersionModel: Model<ContentVersionDocument>,
    @InjectModel(CreativeAsset.name) private readonly creativeAssetModel: Model<CreativeAssetDocument>,
    @InjectModel(Campaign.name) private readonly campaignModel: Model<CampaignDocument>,
    private readonly productsService: ProductsService,
  ) {}

  async ingest(input: IngestInput) {
    this.validateInput(input);
    const doc = {
      organizationId: this.objectId(input.organizationId),
      productId: this.objectId(input.productId),
      campaignId: input.campaignId ? this.objectId(input.campaignId) : undefined,
      eventType: input.eventType,
      channel: input.channel,
      platform: input.platform?.slice(0, 40),
      sourceType: input.sourceType,
      entityType: input.entityType,
      entityId: this.objectId(input.entityId),
      leadId: input.leadId ? this.objectId(input.leadId) : undefined,
      opportunityId: input.opportunityId ? this.objectId(input.opportunityId) : undefined,
      occurredAt: input.occurredAt,
      numericValue: input.numericValue,
      currency: input.currency?.slice(0, 8),
      metadata: this.safeMetadata(input.metadata),
      deduplicationKey: input.deduplicationKey,
    };
    const result = await this.analyticsEventModel.updateOne(
      { organizationId: doc.organizationId, productId: doc.productId, deduplicationKey: doc.deduplicationKey },
      { $setOnInsert: doc },
      { upsert: true },
    ).exec();
    return { inserted: result.upsertedCount === 1, deduplicationKey: doc.deduplicationKey };
  }

  async backfill(organizationId: string, productId: string, userId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const org = new Types.ObjectId(organizationId);
    const product = new Types.ObjectId(productId);
    const results = await Promise.all([
      this.backfillLeads(org, product),
      this.backfillLeadSourceEvents(org, product),
      this.backfillLeadQualifications(org, product),
      this.backfillOpportunities(org, product),
      this.backfillEmailMessages(org, product),
      this.backfillEmailEvents(org, product),
      this.backfillSocialPublications(org, product),
      this.backfillCmsPublications(org, product),
      this.backfillContentVersions(org, product),
      this.backfillCreativeAssets(org, product),
    ]);
    return { status: 'ok', inserted: results.reduce((sum, item) => sum + item.inserted, 0), seen: results.reduce((sum, item) => sum + item.seen, 0), coverageStatus: 'partial' };
  }

  private async backfillLeads(organizationId: Types.ObjectId, productId: Types.ObjectId) {
    const docs = await this.leadModel.find({ organizationId, productId }).sort({ createdAt: -1 }).limit(BACKFILL_BATCH_SIZE).exec();
    return this.ingestMany(docs.map((lead) => ({
      organizationId,
      productId,
      campaignId: lead.campaignId,
      eventType: 'lead_created' as const,
      channel: this.leadChannel(lead.sourceType),
      sourceType: 'lead' as const,
      entityType: 'lead' as const,
      entityId: lead._id,
      leadId: lead._id,
      occurredAt: lead.createdAt || lead.firstCapturedAt || new Date(),
      metadata: { sourceName: lead.sourceName },
      deduplicationKey: `lead-created:${lead._id}`,
    })));
  }

  private async backfillLeadSourceEvents(organizationId: Types.ObjectId, productId: Types.ObjectId) {
    const docs = await this.leadSourceEventModel.find({ organizationId, productId }).sort({ occurredAt: -1 }).limit(BACKFILL_BATCH_SIZE).exec();
    return this.ingestMany(docs.map((event) => ({
      organizationId,
      productId,
      campaignId: event.campaignId,
      eventType: 'lead_capture' as const,
      channel: this.leadSourceChannel(event),
      platform: event.platform,
      sourceType: 'lead_source_event' as const,
      entityType: 'lead_source_event' as const,
      entityId: event._id,
      leadId: event.leadId,
      occurredAt: event.occurredAt,
      metadata: { sourceName: event.sourceName, platform: event.platform },
      deduplicationKey: `lead-source-event:${event._id}`,
    })));
  }

  private async backfillLeadQualifications(organizationId: Types.ObjectId, productId: Types.ObjectId) {
    const docs = await this.leadQualificationModel.find({ organizationId, productId, qualificationStatus: 'qualified' }).sort({ evaluatedAt: -1 }).limit(BACKFILL_BATCH_SIZE).exec();
    return this.ingestMany(docs.map((qualification) => ({
      organizationId,
      productId,
      eventType: 'lead_qualified' as const,
      channel: 'crm' as const,
      sourceType: 'lead_qualification' as const,
      entityType: 'lead_qualification' as const,
      entityId: qualification._id,
      leadId: qualification.leadId,
      occurredAt: qualification.evaluatedAt,
      metadata: { status: qualification.qualificationStatus },
      deduplicationKey: `lead-qualified:${qualification.leadId}:${qualification.evaluatedAt.toISOString()}`,
    })));
  }

  private async backfillOpportunities(organizationId: Types.ObjectId, productId: Types.ObjectId) {
    const docs = await this.opportunityModel.find({ organizationId, productId }).sort({ createdAt: -1 }).limit(BACKFILL_BATCH_SIZE).exec();
    const inputs: IngestInput[] = [];
    for (const opportunity of docs) {
      inputs.push({ organizationId, productId, campaignId: opportunity.campaignId, eventType: 'opportunity_created', channel: 'crm', sourceType: 'crm_opportunity', entityType: 'crm_opportunity', entityId: opportunity._id, leadId: opportunity.leadId, opportunityId: opportunity._id, occurredAt: opportunity.createdAt || new Date(), metadata: { stageId: opportunity.stageId.toString() }, deduplicationKey: `crm-opportunity:${opportunity._id}:created` });
      if (opportunity.status === 'won' && opportunity.wonAt) inputs.push({ organizationId, productId, campaignId: opportunity.campaignId, eventType: 'opportunity_won', channel: 'crm', sourceType: 'crm_opportunity', entityType: 'crm_opportunity', entityId: opportunity._id, leadId: opportunity.leadId, opportunityId: opportunity._id, occurredAt: opportunity.wonAt, numericValue: opportunity.amount, currency: opportunity.currency, metadata: { stageId: opportunity.stageId.toString() }, deduplicationKey: `crm-opportunity:${opportunity._id}:won` });
      if (opportunity.status === 'lost' && opportunity.lostAt) inputs.push({ organizationId, productId, campaignId: opportunity.campaignId, eventType: 'opportunity_lost', channel: 'crm', sourceType: 'crm_opportunity', entityType: 'crm_opportunity', entityId: opportunity._id, leadId: opportunity.leadId, opportunityId: opportunity._id, occurredAt: opportunity.lostAt, metadata: { stageId: opportunity.stageId.toString() }, deduplicationKey: `crm-opportunity:${opportunity._id}:lost` });
    }
    return this.ingestMany(inputs);
  }

  private async backfillEmailMessages(organizationId: Types.ObjectId, productId: Types.ObjectId) {
    const docs = await this.emailMessageModel.find({ organizationId, productId, status: 'accepted' }).sort({ acceptedAt: -1 }).limit(BACKFILL_BATCH_SIZE).exec();
    return this.ingestMany(docs.map((message) => ({
      organizationId,
      productId,
      campaignId: message.campaignId,
      eventType: 'email_accepted' as const,
      channel: 'email' as const,
      platform: message.provider,
      sourceType: 'email_message' as const,
      entityType: 'email_message' as const,
      entityId: message._id,
      leadId: message.leadId,
      opportunityId: message.opportunityId,
      occurredAt: message.acceptedAt || message.createdAt || new Date(),
      metadata: { templateId: message.templateId?.toString(), sequenceId: message.emailSequenceId?.toString(), emailCampaignId: message.emailCampaignId?.toString(), platform: message.provider },
      deduplicationKey: `email-message:${message._id}:accepted`,
    })));
  }

  private async backfillEmailEvents(organizationId: Types.ObjectId, productId: Types.ObjectId) {
    const docs = await this.emailEventModel.find({ organizationId, productId }).sort({ occurredAt: -1 }).limit(BACKFILL_BATCH_SIZE).exec();
    const messageIds = docs.map((event) => event.emailMessageId);
    const messages = await this.emailMessageModel.find({ _id: { $in: messageIds }, organizationId, productId }).exec();
    const messageMap = new Map(messages.map((message) => [message._id.toString(), message]));
    const inputs: IngestInput[] = [];
    for (const event of docs) {
      const message = messageMap.get(event.emailMessageId.toString());
      const eventType = this.emailEventType(event.eventType);
      if (!eventType) continue;
      inputs.push({
        organizationId,
        productId,
        campaignId: message?.campaignId,
        eventType,
        channel: 'email' as const,
        platform: event.provider,
        sourceType: 'email_event' as const,
        entityType: 'email_event' as const,
        entityId: event._id,
        leadId: message?.leadId,
        opportunityId: message?.opportunityId,
        occurredAt: event.occurredAt,
        metadata: { platform: event.provider, templateId: message?.templateId?.toString(), sequenceId: message?.emailSequenceId?.toString(), emailCampaignId: message?.emailCampaignId?.toString() },
        deduplicationKey: `email-event:${event._id}`,
      });
    }
    return this.ingestMany(inputs);
  }

  private async backfillSocialPublications(organizationId: Types.ObjectId, productId: Types.ObjectId) {
    const docs = await this.socialPublicationModel.find({ organizationId, productId, status: 'published' }).sort({ publishedAt: -1 }).limit(BACKFILL_BATCH_SIZE).exec();
    return this.ingestMany(docs.map((publication) => ({
      organizationId,
      productId,
      campaignId: publication.campaignId,
      eventType: 'social_published' as const,
      channel: publication.platform as AnalyticsChannel,
      platform: publication.platform,
      sourceType: 'social_publication' as const,
      entityType: 'social_publication' as const,
      entityId: publication._id,
      occurredAt: publication.publishedAt || publication.createdAt || new Date(),
      metadata: { platform: publication.platform },
      deduplicationKey: `social-publication:${publication._id}:published`,
    })));
  }

  private async backfillCmsPublications(organizationId: Types.ObjectId, productId: Types.ObjectId) {
    const docs = await this.cmsPublicationModel.find({ organizationId, productId, status: { $in: ['draft_created', 'published'] } }).sort({ createdAt: -1 }).limit(BACKFILL_BATCH_SIZE).exec();
    const inputs: IngestInput[] = [];
    for (const publication of docs) {
      if (publication.status === 'draft_created') inputs.push({ organizationId, productId, campaignId: publication.campaignId, eventType: 'cms_draft_created', channel: 'blog', platform: publication.platform, sourceType: 'cms_publication', entityType: 'cms_publication', entityId: publication._id, occurredAt: publication.createdAt || new Date(), metadata: { platform: publication.platform }, deduplicationKey: `cms-publication:${publication._id}:draft` });
      if (publication.status === 'published') inputs.push({ organizationId, productId, campaignId: publication.campaignId, eventType: 'cms_published', channel: 'blog', platform: publication.platform, sourceType: 'cms_publication', entityType: 'cms_publication', entityId: publication._id, occurredAt: publication.publishedAt || publication.createdAt || new Date(), metadata: { platform: publication.platform }, deduplicationKey: `cms-publication:${publication._id}:published` });
    }
    return this.ingestMany(inputs);
  }

  private async backfillContentVersions(organizationId: Types.ObjectId, productId: Types.ObjectId) {
    const docs = await this.contentVersionModel.find({ organizationId, productId }).sort({ createdAt: -1 }).limit(BACKFILL_BATCH_SIZE).exec();
    return this.ingestMany(docs.map((version) => ({
      organizationId,
      productId,
      campaignId: version.campaignId,
      eventType: 'content_generated' as const,
      channel: 'other' as const,
      sourceType: 'content_version' as const,
      entityType: 'content_version' as const,
      entityId: version._id,
      occurredAt: version.generationMetadata?.generatedAt || version.createdAt || new Date(),
      metadata: { contentKind: version.kind },
      deduplicationKey: `content-version:${version._id}:generated`,
    })));
  }

  private async backfillCreativeAssets(organizationId: Types.ObjectId, productId: Types.ObjectId) {
    const docs = await this.creativeAssetModel.find({ organizationId, productId, status: 'generated' }).sort({ createdAt: -1 }).limit(BACKFILL_BATCH_SIZE).exec();
    return this.ingestMany(docs.map((asset) => ({
      organizationId,
      productId,
      campaignId: asset.campaignId,
      eventType: 'creative_generated' as const,
      channel: 'other' as const,
      sourceType: 'creative_asset' as const,
      entityType: 'creative_asset' as const,
      entityId: asset._id,
      occurredAt: asset.createdAt || new Date(),
      metadata: { creativeKind: asset.kind },
      deduplicationKey: `creative-asset:${asset._id}:generated`,
    })));
  }

  private async ingestMany(inputs: IngestInput[]) {
    let inserted = 0;
    for (const input of inputs) {
      const result = await this.ingest(input);
      if (result.inserted) inserted += 1;
    }
    return { seen: inputs.length, inserted };
  }

  private validateInput(input: IngestInput) {
    if (!ANALYTICS_EVENT_TYPES.includes(input.eventType)) throw new BadRequestException('analytics_event_invalid');
    if (!ANALYTICS_CHANNELS.includes(input.channel)) throw new BadRequestException('analytics_event_invalid');
    if (!ANALYTICS_SOURCE_TYPES.includes(input.sourceType)) throw new BadRequestException('analytics_event_invalid');
    if (!ANALYTICS_ENTITY_TYPES.includes(input.entityType)) throw new BadRequestException('analytics_event_invalid');
    if (!input.deduplicationKey || Number.isNaN(input.occurredAt.getTime())) throw new BadRequestException('analytics_event_invalid');
  }

  private objectId(value: Types.ObjectId | string) {
    return value instanceof Types.ObjectId ? value : new Types.ObjectId(value);
  }

  private leadChannel(sourceType: string): AnalyticsChannel {
    if (sourceType === 'website_form' || sourceType === 'landing_page') return 'website';
    if (sourceType === 'social') return 'social';
    if (sourceType === 'cms') return 'blog';
    if (sourceType === 'manual') return 'manual';
    if (sourceType === 'import') return 'import';
    if (sourceType === 'campaign') return 'other';
    return 'other';
  }

  private leadSourceChannel(event: LeadSourceEventDocument): AnalyticsChannel {
    if (event.platform && ANALYTICS_CHANNELS.includes(event.platform as AnalyticsChannel)) return event.platform as AnalyticsChannel;
    if (event.channel && ANALYTICS_CHANNELS.includes(event.channel as AnalyticsChannel)) return event.channel as AnalyticsChannel;
    return this.leadChannel(event.sourceType);
  }

  private emailEventType(type: string): AnalyticsEventType | undefined {
    if (type === 'delivered') return 'email_delivered';
    if (type === 'opened') return 'email_opened';
    if (type === 'clicked') return 'email_clicked';
    if (type === 'bounced') return 'email_bounced';
    if (type === 'unsubscribed') return 'email_unsubscribed';
    return undefined;
  }

  private safeMetadata(metadata?: Record<string, unknown>) {
    if (!metadata) return undefined;
    return Object.fromEntries(Object.entries(metadata).filter(([key, value]) => SAFE_METADATA_KEYS.has(key) && ['string', 'number', 'boolean'].includes(typeof value)).map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 120) : value])) as Record<string, string | number | boolean>;
  }
}
