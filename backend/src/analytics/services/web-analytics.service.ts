import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { Model, Types } from 'mongoose';
import { ProductsService } from '../../products/products.service';
import { CollectWebAnalyticsEventDto, CreateWebAnalyticsSiteDto, UpdateWebAnalyticsSiteDto } from '../dto/analytics.dto';
import { WebAnalyticsEvent, WebAnalyticsEventDocument } from '../schemas/web-analytics-event.schema';
import { WebAnalyticsSite, WebAnalyticsSiteDocument } from '../schemas/web-analytics-site.schema';
import type { AnalyticsEventType, WebAnalyticsEventType } from '../types/analytics.types';
import { AnalyticsEventService } from './analytics-event.service';

const EVENT_MAP: Record<WebAnalyticsEventType, AnalyticsEventType> = {
  page_view: 'web_page_view',
  cta_click: 'web_cta_click',
  form_view: 'web_form_view',
  form_submit: 'web_form_submit',
  custom_conversion: 'web_custom_conversion',
};
const PII_KEYS = new Set(['email', 'phone', 'fullname', 'password', 'token', 'authorization']);

@Injectable()
export class WebAnalyticsService {
  constructor(
    @InjectModel(WebAnalyticsSite.name) private readonly siteModel: Model<WebAnalyticsSiteDocument>,
    @InjectModel(WebAnalyticsEvent.name) private readonly webEventModel: Model<WebAnalyticsEventDocument>,
    private readonly productsService: ProductsService,
    private readonly analyticsEventService: AnalyticsEventService,
  ) {}

  async listSites(organizationId: string, productId: string, userId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    return this.siteModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).sort({ createdAt: -1 }).lean().exec();
  }

  async createSite(organizationId: string, productId: string, userId: string, dto: CreateWebAnalyticsSiteDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const normalizedOrigin = this.normalizeOrigin(dto.websiteUrl);
    const allowedOrigins = this.origins(dto.allowedOrigins?.length ? dto.allowedOrigins : [dto.websiteUrl]);
    const site = await this.siteModel.create({
      organizationId: new Types.ObjectId(organizationId),
      productId: new Types.ObjectId(productId),
      name: dto.name.trim(),
      websiteUrl: dto.websiteUrl,
      normalizedOrigin,
      trackingKey: randomBytes(24).toString('base64url'),
      allowedOrigins,
    });
    return site.toObject();
  }

  async updateSite(organizationId: string, productId: string, userId: string, siteId: string, dto: UpdateWebAnalyticsSiteDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const patch: Partial<WebAnalyticsSite> = {};
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.websiteUrl !== undefined) {
      patch.websiteUrl = dto.websiteUrl;
      patch.normalizedOrigin = this.normalizeOrigin(dto.websiteUrl);
    }
    if (dto.allowedOrigins !== undefined) patch.allowedOrigins = this.origins(dto.allowedOrigins);
    if (dto.status !== undefined) patch.status = dto.status;
    const site = await this.siteModel.findOneAndUpdate({ _id: siteId, organizationId, productId }, { $set: patch }, { new: true }).lean().exec();
    if (!site) throw new NotFoundException('analytics_site_not_found');
    return site;
  }

  async disableSite(organizationId: string, productId: string, userId: string, siteId: string) {
    return this.updateSite(organizationId, productId, userId, siteId, { status: 'disabled' });
  }

  async snippet(organizationId: string, productId: string, userId: string, siteId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const site = await this.siteModel.findOne({ _id: siteId, organizationId, productId }).lean().exec();
    if (!site) throw new NotFoundException('analytics_site_not_found');
    return { snippet: `<script async src="${this.publicBaseUrl()}/public/analytics/analytics.js" data-site="${site.trackingKey}"></script>` };
  }

  script() {
    return `(()=>{const s=document.currentScript,k=s&&s.dataset?s.dataset.site:"";if(!k)return;const endpoint=new URL("/public/analytics/collect",s.src).toString();const id=()=>{try{let v=localStorage.getItem("gip_vid");if(!v){v=crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random();localStorage.setItem("gip_vid",v)}return v}catch{return undefined}};const sid=()=>{try{let v=sessionStorage.getItem("gip_sid");if(!v){v=crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random();sessionStorage.setItem("gip_sid",v)}return v}catch{return undefined}};const send=(eventType,properties)=>{const u=new URL(location.href);const c={source:u.searchParams.get("utm_source")||undefined,medium:u.searchParams.get("utm_medium")||undefined,name:u.searchParams.get("utm_campaign")||undefined,term:u.searchParams.get("utm_term")||undefined,content:u.searchParams.get("utm_content")||undefined};navigator.sendBeacon?navigator.sendBeacon(endpoint,new Blob([JSON.stringify({trackingKey:k,eventType,anonymousVisitorId:id(),sessionId:sid(),pageUrl:location.href,pagePath:location.pathname,pageTitle:document.title,referrer:document.referrer,campaign:c,properties,occurredAt:new Date().toISOString()})],{type:"application/json"})):fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({trackingKey:k,eventType,anonymousVisitorId:id(),sessionId:sid(),pageUrl:location.href,pagePath:location.pathname,pageTitle:document.title,referrer:document.referrer,campaign:c,properties,occurredAt:new Date().toISOString()}),keepalive:true}).catch(()=>{})};let last=location.href;const page=()=>{if(location.href!==last){last=location.href;send("page_view")}};window.gipAnalytics={track:send};send("page_view");["pushState","replaceState"].forEach(n=>{const o=history[n];history[n]=function(){const r=o.apply(this,arguments);setTimeout(page,0);return r}});addEventListener("popstate",page);})();`;
  }

  async collect(dto: CollectWebAnalyticsEventDto, origin?: string) {
    const site = await this.siteModel.findOne({ trackingKey: dto.trackingKey, status: 'active' }).exec();
    if (!site) throw new NotFoundException('analytics_site_not_found');
    if (origin && !site.allowedOrigins.includes(this.normalizeOrigin(origin))) throw new ForbiddenException('analytics_origin_forbidden');
    if (dto.pageUrl) {
      const pageOrigin = this.normalizeOrigin(dto.pageUrl);
      if (site.allowedOrigins.length && !site.allowedOrigins.includes(pageOrigin)) throw new ForbiddenException('analytics_page_origin_forbidden');
    }
    const campaign = this.safeCampaign(dto.campaign);
    const properties = this.safeProperties(dto.properties);
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) throw new BadRequestException('analytics_invalid_event');
    const idsAllowed = dto.analyticsConsent !== false;
    const webEvent = await this.webEventModel.create({
      organizationId: site.organizationId,
      productId: site.productId,
      siteId: site._id,
      eventType: dto.eventType,
      anonymousVisitorId: idsAllowed ? dto.anonymousVisitorId : undefined,
      sessionId: idsAllowed ? dto.sessionId : undefined,
      pageUrl: this.limit(dto.pageUrl, 1000),
      pagePath: this.limit(dto.pagePath || this.pathFromUrl(dto.pageUrl), 500),
      pageTitle: this.limit(dto.pageTitle, 300),
      referrer: this.limit(dto.referrer, 1000),
      source: campaign.source,
      medium: campaign.medium,
      campaignName: campaign.campaignName,
      term: campaign.term,
      content: campaign.content,
      properties,
      occurredAt,
      deduplicationKey: dto.deduplicationKey,
    });
    await this.analyticsEventService.ingest({
      organizationId: site.organizationId,
      productId: site.productId,
      eventType: EVENT_MAP[dto.eventType],
      channel: 'website',
      platform: 'website',
      sourceType: 'web_analytics_event',
      entityType: 'web_analytics_event',
      entityId: webEvent._id,
      occurredAt,
      metadata: { siteId: site._id.toString(), pagePath: webEvent.pagePath, eventType: dto.eventType, source: campaign.source, medium: campaign.medium, campaignName: campaign.campaignName },
      deduplicationKey: `web-event:${webEvent._id}`,
    });
    return { status: 'ok' };
  }

  async website(organizationId: string, productId: string, userId: string, query: { range?: string }) {
    await this.productsService.findOne(organizationId, productId, userId);
    const from = new Date(Date.now() - (query.range === '7d' ? 7 : query.range === '90d' ? 90 : 30) * 86400000);
    const base = { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), occurredAt: { $gte: from, $lte: new Date() } };
    const [eventTypes, pages, refs, sources, campaigns, uniques, sites] = await Promise.all([
      this.group(base, '$eventType'),
      this.group(base, '$pagePath'),
      this.group(base, '$referrer'),
      this.group(base, '$source'),
      this.group(base, '$campaignName'),
      this.webEventModel.aggregate([{ $match: base }, { $group: { _id: null, visitors: { $addToSet: '$anonymousVisitorId' }, sessions: { $addToSet: '$sessionId' } } }]).exec(),
      this.siteModel.countDocuments({ organizationId, productId, status: 'active' }).exec(),
    ]);
    const count = (type: WebAnalyticsEventType) => eventTypes.find((item) => item.key === type)?.count || 0;
    return {
      summary: {
        activeSites: sites,
        pageViews: count('page_view'),
        ctaClicks: count('cta_click'),
        formViews: count('form_view'),
        formSubmits: count('form_submit'),
        customConversions: count('custom_conversion'),
        uniqueVisitors: (uniques[0]?.visitors || []).filter(Boolean).length,
        uniqueSessions: (uniques[0]?.sessions || []).filter(Boolean).length,
      },
      topPages: pages,
      topReferrers: refs,
      topSources: sources,
      topCampaigns: campaigns,
    };
  }

  private async group(base: Record<string, unknown>, field: string) {
    const rows = await this.webEventModel.aggregate([{ $match: base }, { $group: { _id: field, count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }]).exec();
    return rows.filter((row) => row._id).map((row) => ({ key: String(row._id), count: row.count }));
  }

  private normalizeOrigin(value: string) {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      return url.origin.toLowerCase();
    } catch {
      throw new BadRequestException('analytics_origin_invalid');
    }
  }

  private origins(values: string[]) {
    return [...new Set(values.map((value) => this.normalizeOrigin(value)))];
  }

  private safeCampaign(input?: Record<string, unknown>) {
    return {
      source: this.limit(this.string(input?.source), 120),
      medium: this.limit(this.string(input?.medium), 120),
      campaignName: this.limit(this.string(input?.name ?? input?.campaignName), 160),
      term: this.limit(this.string(input?.term), 160),
      content: this.limit(this.string(input?.content), 160),
    };
  }

  private safeProperties(input?: Record<string, unknown>) {
    if (!input) return undefined;
    const entries = Object.entries(input).filter(([key, value]) => !PII_KEYS.has(key.toLowerCase()) && ['string', 'number', 'boolean'].includes(typeof value)).slice(0, 25);
    return Object.fromEntries(entries.map(([key, value]) => [key.slice(0, 80), typeof value === 'string' ? value.slice(0, 200) : value])) as Record<string, string | number | boolean>;
  }

  private pathFromUrl(value?: string) {
    if (!value) return undefined;
    try { return new URL(value).pathname.slice(0, 500); } catch { return undefined; }
  }

  private string(value: unknown) {
    return typeof value === 'string' ? value : undefined;
  }

  private limit(value: string | undefined, max: number) {
    return value ? value.slice(0, max) : undefined;
  }

  private publicBaseUrl() {
    return (process.env.GIP_PUBLIC_URL || process.env.API_PUBLIC_URL || process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  }
}
