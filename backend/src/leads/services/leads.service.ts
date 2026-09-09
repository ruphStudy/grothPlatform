import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CampaignsService } from '../../campaigns/campaigns.service';
import { ProductsService } from '../../products/products.service';
import { BulkLeadStatusDto, ExportLeadsCsvDto, ImportLeadsCsvDto, ManualLeadDto, UpdateLeadDto } from '../dto/lead-common.dto';
import { LeadIdentityConflict, LeadIdentityConflictDocument } from '../schemas/lead-identity-conflict.schema';
import { Lead, LeadDocument } from '../schemas/lead.schema';
import { LeadSourceEvent, LeadSourceEventDocument } from '../schemas/lead-source-event.schema';
import { LeadCaptureService } from './lead-capture.service';
import { LeadNormalizationService } from './lead-normalization.service';
import { LeadQualificationService } from './lead-qualification.service';
import type { LeadDetailResponse, LeadListFilter, LeadResponse } from '../types/lead-capture.types';
import { LEAD_COMMUNICATION_ELIGIBILITIES, LEAD_CONSENT_STATUSES, LEAD_QUALIFICATION_GRADES, LEAD_QUALIFICATION_STATUSES, LEAD_SOURCE_TYPES, LEAD_STATUSES } from '../types/lead.types';
import type { LeadConsentStatus, LeadCustomFields, LeadSourceType, LeadStatus } from '../types/lead.types';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_BULK_LEADS = 100;
const LEAD_IMPORT_MAX_ROWS = Number(process.env.LEAD_IMPORT_MAX_ROWS || 5000);
const LEAD_IMPORT_MAX_BYTES = Number(process.env.LEAD_IMPORT_MAX_BYTES || 5 * 1024 * 1024);
const LEAD_EXPORT_MAX_ROWS = Number(process.env.LEAD_EXPORT_MAX_ROWS || 10000);
const EXPORT_FORMULA_PREFIXES = ['=', '+', '-', '@'];

export interface ImportRowOutcome {
  row: number;
  outcome: 'created' | 'matched' | 'conflict' | 'invalid';
  leadId?: string;
  error?: string;
}

@Injectable()
export class LeadsService {
  constructor(
    @InjectModel(Lead.name) private readonly leadModel: Model<LeadDocument>,
    @InjectModel(LeadSourceEvent.name) private readonly eventModel: Model<LeadSourceEventDocument>,
    @InjectModel(LeadIdentityConflict.name) private readonly conflictModel: Model<LeadIdentityConflictDocument>,
    private readonly productsService: ProductsService,
    private readonly campaignsService: CampaignsService,
    private readonly leadCaptureService: LeadCaptureService,
    private readonly normalization: LeadNormalizationService,
    private readonly qualificationService: LeadQualificationService,
  ) {}

  async manualCreate(organizationId: string, productId: string, userId: string, dto: ManualLeadDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    if (dto.campaignId) await this.campaignsService.findOne(organizationId, productId, dto.campaignId, userId);
    return this.leadCaptureService.capture({
      organizationId,
      productId,
      campaignId: dto.campaignId,
      contact: dto,
      source: { type: 'manual', name: 'Manual Entry', channel: 'manual' },
      consent: dto.consent,
      customFields: dto.customFields,
      notes: dto.notes,
      captureMethod: 'manual',
    });
  }

  async list(organizationId: string, productId: string, userId: string, filter: LeadListFilter): Promise<{ items: LeadResponse[]; total: number; page: number; limit: number }> {
    await this.productsService.findOne(organizationId, productId, userId);
    const query = await this.buildLeadQuery(organizationId, productId, filter);
    const limit = Math.min(Math.max(Number(filter.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const page = Math.max(Number(filter.page) || 1, 1);
    const order: 1 | -1 = filter.order === 'asc' ? 1 : -1;

    let items: LeadDocument[];
    let total: number;
    if (filter.sort === 'score') {
      const sortedIds = await this.qualificationService.sortedLeadIdsByScore(organizationId, productId, order);
      query._id = query._id && typeof query._id === 'object' && '$in' in query._id
        ? { $in: sortedIds.filter((id) => ((query._id as { $in: Types.ObjectId[] }).$in).some((allowed) => allowed.equals(id))) }
        : { $in: sortedIds };
      const allItems = await this.leadModel.find(query).exec();
      const rank = new Map(sortedIds.map((id, index) => [id.toString(), index]));
      allItems.sort((a, b) => (rank.get(a._id.toString()) ?? 0) - (rank.get(b._id.toString()) ?? 0));
      total = allItems.length;
      items = allItems.slice((page - 1) * limit, page * limit);
    } else {
      const sort = this.resolveSort(filter.sort, order);
      [items, total] = await Promise.all([
        this.leadModel.find(query).sort(sort).skip((page - 1) * limit).limit(limit).exec(),
        this.leadModel.countDocuments(query).exec(),
      ]);
    }
    return { items: await this.attachQualifications(organizationId, productId, items), total, page, limit };
  }

  async get(organizationId: string, productId: string, userId: string, leadId: string): Promise<LeadDetailResponse> {
    await this.productsService.findOne(organizationId, productId, userId);
    const lead = await this.findOwned(organizationId, productId, leadId);
    const [events, qualifications] = await Promise.all([
      this.eventModel.find({ leadId: lead._id, organizationId: lead.organizationId, productId: lead.productId }).sort({ occurredAt: -1 }).limit(50).exec(),
      this.qualificationService.getByLeadIds(organizationId, productId, [lead._id]),
    ]);
    return { ...this.leadCaptureService.toLeadResponse(lead, qualifications.get(lead._id.toString())), sourceEvents: events.map((event) => this.leadCaptureService.toEventResponse(event)) };
  }

  async update(organizationId: string, productId: string, userId: string, leadId: string, dto: UpdateLeadDto): Promise<LeadResponse> {
    await this.productsService.findOne(organizationId, productId, userId);
    const lead = await this.findOwned(organizationId, productId, leadId);
    const normalizedEmail = dto.email !== undefined ? this.normalization.normalizeEmail(dto.email) : lead.normalizedEmail;
    const normalizedPhone = dto.phone !== undefined ? this.normalization.normalizePhone(dto.phone) : lead.normalizedPhone;
    if (!normalizedEmail && !normalizedPhone) throw new BadRequestException('Lead requires an email or phone number.');
    if (normalizedEmail && normalizedEmail !== lead.normalizedEmail) await this.assertIdentityAvailable(organizationId, productId, leadId, 'normalizedEmail', normalizedEmail);
    if (normalizedPhone && normalizedPhone !== lead.normalizedPhone) await this.assertIdentityAvailable(organizationId, productId, leadId, 'normalizedPhone', normalizedPhone);

    if (dto.firstName !== undefined) lead.firstName = this.normalization.clean(dto.firstName, 120);
    if (dto.lastName !== undefined) lead.lastName = this.normalization.clean(dto.lastName, 120);
    if (dto.fullName !== undefined) lead.fullName = this.normalization.clean(dto.fullName, 240);
    if (dto.email !== undefined) lead.email = lead.normalizedEmail = normalizedEmail;
    if (dto.phone !== undefined) lead.phone = lead.normalizedPhone = normalizedPhone;
    if (dto.companyName !== undefined) lead.companyName = this.normalization.clean(dto.companyName, 200);
    if (dto.jobTitle !== undefined) lead.jobTitle = this.normalization.clean(dto.jobTitle, 160);
    if (dto.country !== undefined) lead.country = this.normalization.clean(dto.country, 100);
    if (dto.region !== undefined) lead.region = this.normalization.clean(dto.region, 100);
    if (dto.city !== undefined) lead.city = this.normalization.clean(dto.city, 100);
    if (dto.status !== undefined) lead.status = dto.status;
    if (dto.notes !== undefined) lead.notes = this.normalization.normalizeNotes(dto.notes);
    if (dto.customFields !== undefined) lead.customFields = this.normalization.normalizeCustomFields(dto.customFields);
    if (dto.consent) {
      lead.consentStatus = dto.consent.status;
      lead.consentCapturedAt = dto.consent.capturedAt ? new Date(dto.consent.capturedAt) : new Date();
      lead.consentSource = this.normalization.clean(dto.consent.source, 200);
    }
    await lead.save();
    const qualification = await this.qualificationService.recalculateLead(lead);
    return this.leadCaptureService.toLeadResponse(lead, qualification);
  }

  async recalculateQualification(organizationId: string, productId: string, userId: string, leadId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const lead = await this.findOwned(organizationId, productId, leadId);
    return this.qualificationService.recalculateLead(lead);
  }

  async bulkStatus(organizationId: string, productId: string, userId: string, dto: BulkLeadStatusDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const leadIds = [...new Set(dto.leadIds ?? [])];
    if (leadIds.length === 0 || leadIds.length > MAX_BULK_LEADS) throw new BadRequestException(`Select 1-${MAX_BULK_LEADS} leads.`);
    const objectIds = leadIds.map((id) => new Types.ObjectId(id));
    const leads = await this.leadModel.find({ _id: { $in: objectIds }, organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).exec();
    if (leads.length !== leadIds.length) throw new NotFoundException('One or more leads were not found.');
    for (const lead of leads) {
      lead.status = dto.status;
      await lead.save();
      await this.qualificationService.recalculateLead(lead);
    }
    return { updated: leads.length, status: dto.status };
  }

  async importCsv(organizationId: string, productId: string, userId: string, dto: ImportLeadsCsvDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const byteLength = Buffer.byteLength(dto.csv ?? '', 'utf8');
    if (byteLength > LEAD_IMPORT_MAX_BYTES) throw new BadRequestException('Lead import CSV is too large.');
    const rows = this.parseCsv(dto.csv);
    if (rows.length < 2) throw new BadRequestException('Lead import CSV needs a header row and at least one data row.');
    if (rows.length - 1 > LEAD_IMPORT_MAX_ROWS) throw new BadRequestException(`Lead import cannot exceed ${LEAD_IMPORT_MAX_ROWS} rows.`);
    const headers = rows[0].map((header) => header.trim());
    const sourceName = this.normalization.clean(dto.sourceName, 200) || 'CSV Import';
    const outcomes: ImportRowOutcome[] = [];

    for (let i = 1; i < rows.length; i += 1) {
      const mapped = this.mapImportRow(headers, rows[i]);
      if (!mapped.email && !mapped.phone) {
        outcomes.push({ row: i + 1, outcome: 'invalid', error: 'Email or phone is required.' });
        continue;
      }
      try {
        const result = await this.leadCaptureService.capture({
          organizationId,
          productId,
          contact: mapped,
          source: { type: 'import', name: sourceName, channel: 'csv' },
          consent: mapped.consentStatus ? { status: mapped.consentStatus, source: sourceName } : undefined,
          customFields: mapped.customFields,
          notes: mapped.notes,
          captureMethod: 'api',
        });
        if (mapped.status && result.lead?.id) await this.update(organizationId, productId, userId, result.lead.id, { status: mapped.status });
        outcomes.push({ row: i + 1, outcome: result.outcome, leadId: result.lead?.id });
      } catch (err) {
        outcomes.push({ row: i + 1, outcome: 'invalid', error: err instanceof Error ? err.message : 'Invalid row.' });
      }
    }
    return {
      totalRows: rows.length - 1,
      created: outcomes.filter((item) => item.outcome === 'created').length,
      matched: outcomes.filter((item) => item.outcome === 'matched').length,
      conflicts: outcomes.filter((item) => item.outcome === 'conflict').length,
      invalid: outcomes.filter((item) => item.outcome === 'invalid').length,
      errors: outcomes.filter((item) => item.error).slice(0, 25),
      outcomes: outcomes.slice(0, 200),
    };
  }

  async exportCsv(organizationId: string, productId: string, userId: string, dto: ExportLeadsCsvDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const filter = (dto.filters ?? {}) as LeadListFilter;
    const query = await this.buildLeadQuery(organizationId, productId, filter);
    if (dto.leadIds?.length) query._id = { $in: dto.leadIds.map((id) => new Types.ObjectId(id)) };
    const leads = await this.leadModel.find(query).sort({ latestCapturedAt: -1 }).limit(LEAD_EXPORT_MAX_ROWS).exec();
    const qualifications = await this.qualificationService.getByLeadIds(organizationId, productId, leads.map((lead) => lead._id));
    const campaigns = await this.campaignsService.findAll(organizationId, productId, userId, {});
    const campaignNames = new Map(campaigns.map((campaign) => [campaign.id, campaign.name]));
    const headers = ['leadId', 'name', 'email', 'phone', 'company', 'jobTitle', 'status', 'score', 'grade', 'qualificationStatus', 'communicationEligibility', 'consentStatus', 'firstSource', 'latestSource', 'campaign', 'createdAt', 'latestCapturedAt'];
    const customHeaders = dto.includeCustomFields ? this.collectCustomFieldHeaders(leads).map((key) => `custom.${key}`) : [];
    const lines = [headers.concat(customHeaders).map((value) => this.csvCell(value)).join(',')];
    for (const lead of leads) {
      const qualification = qualifications.get(lead._id.toString());
      const customFields = this.mapCustomFields(lead.customFields);
      const row = [
        lead._id.toString(),
        lead.fullName || [lead.firstName, lead.lastName].filter(Boolean).join(' '),
        lead.email,
        lead.phone,
        lead.companyName,
        lead.jobTitle,
        lead.status,
        qualification?.score,
        qualification?.grade,
        qualification?.qualificationStatus,
        qualification?.communicationEligibility,
        lead.consentStatus,
        lead.sourceName || lead.sourceType,
        lead.latestSourceEventId?.toString(),
        lead.campaignId ? campaignNames.get(lead.campaignId.toString()) : '',
        lead.createdAt?.toISOString(),
        lead.latestCapturedAt?.toISOString(),
        ...customHeaders.map((header) => customFields[header.slice('custom.'.length)]),
      ];
      lines.push(row.map((value) => this.csvCell(value)).join(','));
    }
    return { fileName: `leads-${productId}.csv`, contentType: 'text/csv', rowCount: leads.length, csv: lines.join('\n') };
  }

  async listIdentityConflicts(organizationId: string, productId: string, userId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const conflicts = await this.conflictModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).sort({ createdAt: -1 }).limit(100).exec();
    return conflicts.map((conflict) => ({
      id: conflict._id.toString(),
      emailLeadId: conflict.emailLeadId.toString(),
      phoneLeadId: conflict.phoneLeadId.toString(),
      maskedEmail: this.maskEmail(conflict.normalizedEmail),
      maskedPhone: this.maskPhone(conflict.normalizedPhone),
      status: conflict.status,
      createdAt: conflict.createdAt,
      resolvedAt: conflict.resolvedAt,
    }));
  }

  async markIdentityConflictReviewed(organizationId: string, productId: string, userId: string, conflictId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const conflict = await this.conflictModel.findOne({ _id: new Types.ObjectId(conflictId), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).exec();
    if (!conflict) throw new NotFoundException('Lead identity conflict not found.');
    conflict.status = 'resolved';
    conflict.resolvedAt = new Date();
    await conflict.save();
    await Promise.all([
      this.recalculateIfLeadExists(organizationId, productId, conflict.emailLeadId),
      this.recalculateIfLeadExists(organizationId, productId, conflict.phoneLeadId),
    ]);
    return { id: conflict._id.toString(), status: conflict.status, resolvedAt: conflict.resolvedAt };
  }

  private async buildLeadQuery(organizationId: string, productId: string, filter: LeadListFilter): Promise<Record<string, unknown>> {
    const query: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) };
    if (filter.status) {
      if (!LEAD_STATUSES.includes(filter.status as LeadStatus)) throw new BadRequestException('Invalid lead status filter.');
      query.status = filter.status;
    }
    if (filter.sourceType) {
      if (!LEAD_SOURCE_TYPES.includes(filter.sourceType as LeadSourceType)) throw new BadRequestException('Invalid lead source filter.');
      query.sourceType = filter.sourceType;
    }
    if (filter.campaignId) query.campaignId = new Types.ObjectId(filter.campaignId);
    if (filter.consentStatus) {
      if (!LEAD_CONSENT_STATUSES.includes(filter.consentStatus as LeadConsentStatus)) throw new BadRequestException('Invalid consent status filter.');
      query.consentStatus = filter.consentStatus;
    }
    if (filter.createdFrom || filter.createdTo) query.createdAt = this.dateRange(filter.createdFrom, filter.createdTo);
    if (filter.latestCapturedFrom || filter.latestCapturedTo) query.latestCapturedAt = this.dateRange(filter.latestCapturedFrom, filter.latestCapturedTo);
    if (filter.hasEmail === 'true') query.normalizedEmail = { $type: 'string' };
    if (filter.hasEmail === 'false') query.normalizedEmail = { $exists: false };
    if (filter.hasPhone === 'true') query.normalizedPhone = { $type: 'string' };
    if (filter.hasPhone === 'false') query.normalizedPhone = { $exists: false };
    if (filter.search) {
      const search = filter.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 120);
      query.$or = [
        { email: new RegExp(search, 'i') },
        { phone: new RegExp(search, 'i') },
        { fullName: new RegExp(search, 'i') },
        { firstName: new RegExp(search, 'i') },
        { lastName: new RegExp(search, 'i') },
        { companyName: new RegExp(search, 'i') },
      ];
    }
    this.validateQualificationFilters(filter);
    const qualificationLeadIds = await this.qualificationService.findMatchingLeadIds(organizationId, productId, filter);
    if (qualificationLeadIds) query._id = { $in: qualificationLeadIds };
    return query;
  }

  private async attachQualifications(organizationId: string, productId: string, leads: LeadDocument[]): Promise<LeadResponse[]> {
    const qualifications = await this.qualificationService.getByLeadIds(organizationId, productId, leads.map((lead) => lead._id));
    return leads.map((lead) => this.leadCaptureService.toLeadResponse(lead, qualifications.get(lead._id.toString())));
  }

  private validateQualificationFilters(filter: LeadListFilter): void {
    if (filter.grade && !LEAD_QUALIFICATION_GRADES.includes(filter.grade as any)) throw new BadRequestException('Invalid lead grade filter.');
    if (filter.qualificationStatus && !LEAD_QUALIFICATION_STATUSES.includes(filter.qualificationStatus as any)) throw new BadRequestException('Invalid qualification status filter.');
    if (filter.communicationEligibility && !LEAD_COMMUNICATION_ELIGIBILITIES.includes(filter.communicationEligibility as any)) throw new BadRequestException('Invalid communication eligibility filter.');
  }

  private resolveSort(sort: string | undefined, order: 1 | -1): Record<string, 1 | -1> {
    const map: Record<string, string> = { latestCapturedAt: 'latestCapturedAt', createdAt: 'createdAt', name: 'fullName', company: 'companyName' };
    return { [map[sort || 'latestCapturedAt'] || 'latestCapturedAt']: order };
  }

  private dateRange(from?: string, to?: string): Record<string, Date> {
    const range: Record<string, Date> = {};
    if (from) range.$gte = new Date(from);
    if (to) range.$lte = new Date(to);
    return range;
  }

  private async findOwned(organizationId: string, productId: string, leadId: string): Promise<LeadDocument> {
    let lead: LeadDocument | null;
    try {
      lead = await this.leadModel.findOne({ _id: new Types.ObjectId(leadId), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).exec();
    } catch {
      throw new NotFoundException('Lead not found.');
    }
    if (!lead) throw new NotFoundException('Lead not found.');
    return lead;
  }

  private async assertIdentityAvailable(organizationId: string, productId: string, leadId: string, field: 'normalizedEmail' | 'normalizedPhone', value: string): Promise<void> {
    const existing = await this.leadModel.findOne({
      organizationId: new Types.ObjectId(organizationId),
      productId: new Types.ObjectId(productId),
      [field]: value,
      _id: { $ne: new Types.ObjectId(leadId) },
    });
    if (existing) throw new ConflictException('Another lead already uses this contact identifier.');
  }

  private parseCsv(csv: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < csv.length; i += 1) {
      const char = csv[i];
      const next = csv[i + 1];
      if (char === '"' && quoted && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === ',' && !quoted) {
        row.push(cell);
        cell = '';
      } else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && next === '\n') i += 1;
        row.push(cell);
        if (row.some((value) => value.trim())) rows.push(row);
        row = [];
        cell = '';
      } else {
        cell += char;
      }
    }
    row.push(cell);
    if (row.some((value) => value.trim())) rows.push(row);
    return rows;
  }

  private mapImportRow(headers: string[], row: string[]) {
    const record = new Map(headers.map((header, index) => [header, row[index]?.trim() ?? '']));
    const known = new Set(['firstName', 'lastName', 'fullName', 'email', 'phone', 'companyName', 'jobTitle', 'country', 'region', 'city', 'status', 'consentStatus', 'notes']);
    const customFields: LeadCustomFields = {};
    for (const [key, value] of record) {
      if (!known.has(key) && value && /^[a-zA-Z0-9_.-]{1,80}$/.test(key)) customFields[key] = value.slice(0, 2000);
    }
    const status = record.get('status') as LeadStatus;
    const consentStatus = record.get('consentStatus') as LeadConsentStatus;
    return {
      firstName: record.get('firstName'),
      lastName: record.get('lastName'),
      fullName: record.get('fullName'),
      email: record.get('email'),
      phone: record.get('phone'),
      companyName: record.get('companyName'),
      jobTitle: record.get('jobTitle'),
      country: record.get('country'),
      region: record.get('region'),
      city: record.get('city'),
      status: LEAD_STATUSES.includes(status) ? status : undefined,
      consentStatus: LEAD_CONSENT_STATUSES.includes(consentStatus) ? consentStatus : undefined,
      notes: record.get('notes'),
      customFields,
    };
  }

  private csvCell(value: unknown): string {
    let text = value === undefined || value === null ? '' : String(value);
    if (EXPORT_FORMULA_PREFIXES.some((prefix) => text.startsWith(prefix))) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  private collectCustomFieldHeaders(leads: LeadDocument[]): string[] {
    const keys = new Set<string>();
    for (const lead of leads) for (const key of Object.keys(this.mapCustomFields(lead.customFields))) if (/^[a-zA-Z0-9_.-]{1,80}$/.test(key)) keys.add(key);
    return [...keys].slice(0, 30);
  }

  private mapCustomFields(fields: LeadCustomFields): LeadCustomFields {
    return Object.fromEntries((fields as unknown as Map<string, unknown>)?.entries?.() ?? Object.entries(fields ?? {})) as LeadCustomFields;
  }

  private maskEmail(email: string): string {
    const [name, domain] = email.split('@');
    return `${name?.slice(0, 2) || '**'}***@${domain || 'hidden'}`;
  }

  private maskPhone(phone: string): string {
    return phone.length <= 4 ? '****' : `${phone.slice(0, 2)}***${phone.slice(-2)}`;
  }

  private async recalculateIfLeadExists(organizationId: string, productId: string, leadId: Types.ObjectId): Promise<void> {
    const lead = await this.leadModel.findOne({ _id: leadId, organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).exec();
    if (lead) await this.qualificationService.recalculateLead(lead);
  }
}
