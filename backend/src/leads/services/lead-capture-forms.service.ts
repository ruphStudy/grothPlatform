import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CampaignsService } from '../../campaigns/campaigns.service';
import { ProductsService } from '../../products/products.service';
import { CreateLeadCaptureEndpointDto } from '../dto/lead-capture-endpoint.dto';
import { CreateLeadCaptureFormDto, PublicLeadCaptureFormSubmissionDto, UpdateLeadCaptureFormDto } from '../dto/lead-capture-form.dto';
import { LeadCaptureEndpoint, LeadCaptureEndpointDocument } from '../schemas/lead-capture-endpoint.schema';
import { LeadCaptureForm, LeadCaptureFormDocument, LeadCaptureFormField } from '../schemas/lead-capture-form.schema';
import { LeadCaptureService } from './lead-capture.service';
import { LeadCaptureEndpointsService } from './lead-capture-endpoints.service';
import { LeadNormalizationService } from './lead-normalization.service';
import type { LeadCustomFields } from '../types/lead.types';

const LEAD_FORM_MAX_FIELDS = Number(process.env.LEAD_FORM_MAX_FIELDS || 30);
const MAX_SELECT_OPTIONS = 30;
const CORE_FIELD_MAP: Record<string, string> = {
  first_name: 'firstName',
  last_name: 'lastName',
  full_name: 'fullName',
  email: 'email',
  phone: 'phone',
  company_name: 'companyName',
  job_title: 'jobTitle',
  country: 'country',
  region: 'region',
  city: 'city',
};

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'lead-form';
}

@Injectable()
export class LeadCaptureFormsService {
  constructor(
    @InjectModel(LeadCaptureForm.name) private readonly formModel: Model<LeadCaptureFormDocument>,
    @InjectModel(LeadCaptureEndpoint.name) private readonly endpointModel: Model<LeadCaptureEndpointDocument>,
    private readonly productsService: ProductsService,
    private readonly campaignsService: CampaignsService,
    private readonly endpointsService: LeadCaptureEndpointsService,
    private readonly leadCaptureService: LeadCaptureService,
    private readonly normalization: LeadNormalizationService,
  ) {}

  async create(organizationId: string, productId: string, userId: string, dto: CreateLeadCaptureFormDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    if (dto.campaignId) await this.campaignsService.findOne(organizationId, productId, dto.campaignId, userId);
    const fields = this.normalizeFields(dto.fields ?? [], false);
    const endpoint = await this.endpointsService.create(organizationId, productId, userId, this.endpointDto(dto, fields));
    const form = await new this.formModel({
      organizationId: new Types.ObjectId(organizationId),
      productId: new Types.ObjectId(productId),
      campaignId: dto.campaignId ? new Types.ObjectId(dto.campaignId) : undefined,
      captureEndpointId: new Types.ObjectId(endpoint.id),
      name: dto.name.trim(),
      slug: await this.uniqueSlug(organizationId, productId, slugify(dto.slug || dto.name)),
      title: this.normalization.clean(dto.title, 160),
      description: this.normalization.clean(dto.description, 500),
      status: 'draft',
      submitButtonText: this.normalization.clean(dto.submitButtonText, 80) || 'Submit',
      successTitle: this.normalization.clean(dto.successTitle, 160) || 'Thanks',
      successMessage: this.normalization.clean(dto.successMessage, 500) || 'Your details were submitted.',
      fields,
      consent: dto.consent ?? { enabled: true, required: false, label: 'I agree to be contacted.' },
      appearance: dto.appearance,
      metadata: {},
    }).save();
    return this.toResponse(form, endpoint.publicKey);
  }

  async list(organizationId: string, productId: string, userId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const forms = await this.formModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).sort({ createdAt: -1 }).exec();
    const endpointIds = forms.map((form) => form.captureEndpointId);
    const endpoints = await this.endpointModel.find({ _id: { $in: endpointIds } }).exec();
    const keyMap = new Map(endpoints.map((endpoint) => [endpoint._id.toString(), endpoint.publicKey]));
    return forms.map((form) => this.toResponse(form, keyMap.get(form.captureEndpointId.toString())));
  }

  async get(organizationId: string, productId: string, userId: string, formId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const form = await this.findOwned(organizationId, productId, formId);
    const endpoint = await this.endpointModel.findById(form.captureEndpointId).exec();
    return this.toResponse(form, endpoint?.publicKey);
  }

  async update(organizationId: string, productId: string, userId: string, formId: string, dto: UpdateLeadCaptureFormDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const form = await this.findOwned(organizationId, productId, formId);
    if (dto.campaignId) await this.campaignsService.findOne(organizationId, productId, dto.campaignId, userId);
    if (dto.name !== undefined) form.name = dto.name.trim();
    if (dto.slug !== undefined) form.slug = await this.uniqueSlug(organizationId, productId, slugify(dto.slug), formId);
    if (dto.campaignId !== undefined) form.campaignId = dto.campaignId ? new Types.ObjectId(dto.campaignId) : undefined;
    if (dto.title !== undefined) form.title = this.normalization.clean(dto.title, 160);
    if (dto.description !== undefined) form.description = this.normalization.clean(dto.description, 500);
    if (dto.submitButtonText !== undefined) form.submitButtonText = this.normalization.clean(dto.submitButtonText, 80) || 'Submit';
    if (dto.successTitle !== undefined) form.successTitle = this.normalization.clean(dto.successTitle, 160);
    if (dto.successMessage !== undefined) form.successMessage = this.normalization.clean(dto.successMessage, 500);
    if (dto.fields !== undefined) form.fields = this.normalizeFields(dto.fields, form.status === 'active');
    if (dto.consent !== undefined) form.consent = dto.consent;
    if (dto.appearance !== undefined) form.appearance = dto.appearance;
    if (form.status === 'active') this.assertHasIdentityField(form.fields);
    await form.save();
    await this.endpointsService.update(organizationId, productId, userId, form.captureEndpointId.toString(), this.endpointDto({ name: form.name, campaignId: form.campaignId?.toString(), consent: form.consent }, form.fields));
    const endpoint = await this.endpointModel.findById(form.captureEndpointId).exec();
    return this.toResponse(form, endpoint?.publicKey);
  }

  async activate(organizationId: string, productId: string, userId: string, formId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const form = await this.findOwned(organizationId, productId, formId);
    this.assertHasIdentityField(form.fields);
    form.status = 'active';
    await form.save();
    await this.endpointsService.update(organizationId, productId, userId, form.captureEndpointId.toString(), { active: true, requireConsent: form.consent?.required ?? false });
    const endpoint = await this.endpointModel.findById(form.captureEndpointId).exec();
    return this.toResponse(form, endpoint?.publicKey);
  }

  async deactivate(organizationId: string, productId: string, userId: string, formId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const form = await this.findOwned(organizationId, productId, formId);
    form.status = 'inactive';
    await form.save();
    await this.endpointsService.disable(organizationId, productId, userId, form.captureEndpointId.toString());
    const endpoint = await this.endpointModel.findById(form.captureEndpointId).exec();
    return this.toResponse(form, endpoint?.publicKey);
  }

  async rotatePublicKey(organizationId: string, productId: string, userId: string, formId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const form = await this.findOwned(organizationId, productId, formId);
    const endpoint = await this.endpointsService.rotateKey(organizationId, productId, userId, form.captureEndpointId.toString());
    return this.toResponse(form, endpoint.publicKey);
  }

  async publicConfig(publicKey: string) {
    const { form } = await this.resolvePublicForm(publicKey, false);
    if (form.status !== 'active') throw new NotFoundException('lead_form_inactive');
    return {
      title: form.title || form.name,
      description: form.description,
      fields: [...form.fields].sort((a, b) => a.order - b.order).map((field) => this.toPublicField(field)),
      consent: form.consent,
      submitButtonText: form.submitButtonText,
      successTitle: form.successTitle,
      successMessage: form.successMessage,
      appearance: form.appearance,
    };
  }

  async publicSubmit(publicKey: string, dto: PublicLeadCaptureFormSubmissionDto, meta: { origin?: string; ip?: string; idempotencyKey?: string }) {
    const { form, endpoint } = await this.resolvePublicForm(publicKey, true, meta);
    if (dto._hp || dto.website) return { success: true };
    if (form.status !== 'active') throw new NotFoundException('lead_form_inactive');
    const mapped = this.validateSubmission(form, dto);
    const result = await this.leadCaptureService.capture(
      {
        organizationId: form.organizationId.toString(),
        productId: form.productId.toString(),
        campaignId: form.campaignId?.toString(),
        contact: mapped.contact,
        source: {
          type: endpoint.sourceType,
          name: endpoint.sourceName ?? form.name,
          channel: 'website',
          landingPageUrl: dto.pageUrl,
          referrerUrl: dto.referrerUrl,
        },
        utm: {
          source: String(dto.utm?.utm_source ?? dto.utm?.source ?? ''),
          medium: String(dto.utm?.utm_medium ?? dto.utm?.medium ?? ''),
          campaign: String(dto.utm?.utm_campaign ?? dto.utm?.campaign ?? ''),
          term: String(dto.utm?.utm_term ?? dto.utm?.term ?? ''),
          content: String(dto.utm?.utm_content ?? dto.utm?.content ?? ''),
        },
        consent: form.consent?.enabled ? { status: mapped.consentAccepted ? 'granted' : 'unknown', capturedAt: mapped.consentAccepted ? new Date().toISOString() : undefined, source: form.name } : undefined,
        customFields: mapped.customFields,
        formContext: { formId: form._id.toString(), captureEndpointId: endpoint._id.toString() },
        captureMethod: 'public_form',
      },
      { endpoint, key: dto.submissionId ?? meta.idempotencyKey },
    );
    if (result.outcome === 'conflict') throw new ConflictException('lead_form_submission_invalid');
    return { success: true, successTitle: form.successTitle, successMessage: form.successMessage };
  }

  private async resolvePublicForm(publicKey: string, enforceAccess: boolean, meta?: { origin?: string; ip?: string }) {
    const endpoint = await this.endpointsService.resolvePublicEndpoint(publicKey);
    if (enforceAccess) this.endpointsService.assertPublicAccess(endpoint, meta ?? {});
    const form = await this.formModel.findOne({ captureEndpointId: endpoint._id }).exec();
    if (!form) throw new NotFoundException('lead_form_not_found');
    return { form, endpoint };
  }

  private normalizeFields(fields: CreateLeadCaptureFormDto['fields'], requireIdentity: boolean): LeadCaptureFormField[] {
    if (!fields?.length || fields.length > LEAD_FORM_MAX_FIELDS) throw new BadRequestException('lead_form_invalid_schema');
    const keys = new Set<string>();
    const normalized = fields.map((field, index) => {
      const key = this.safeKey(field.key || field.type);
      if (keys.has(key)) throw new BadRequestException('lead_form_field_invalid');
      keys.add(key);
      const customFieldKey = field.customFieldKey ? this.safeKey(field.customFieldKey) : undefined;
      if (['text', 'textarea', 'select', 'checkbox'].includes(field.type) && !customFieldKey) throw new BadRequestException('lead_form_field_invalid');
      const options = (field.options ?? []).map((option) => this.normalization.clean(option, 120)).filter((option): option is string => Boolean(option)).slice(0, MAX_SELECT_OPTIONS);
      if (field.type === 'select' && options.length === 0) throw new BadRequestException('lead_form_field_invalid');
      return { key, type: field.type, label: this.normalization.clean(field.label, 120) || key, placeholder: this.normalization.clean(field.placeholder, 200), required: Boolean(field.required), options, customFieldKey, order: Number(field.order ?? (index + 1) * 10) };
    });
    const orders = new Set(normalized.map((field) => field.order));
    if (orders.size !== normalized.length) throw new BadRequestException('lead_form_invalid_schema');
    if (requireIdentity) this.assertHasIdentityField(normalized);
    return normalized.sort((a, b) => a.order - b.order) as LeadCaptureFormField[];
  }

  private validateSubmission(form: LeadCaptureFormDocument, dto: PublicLeadCaptureFormSubmissionDto) {
    const configured = new Map(form.fields.map((field) => [field.key, field]));
    const submitted = dto.fields ?? {};
    for (const key of Object.keys(submitted)) if (!configured.has(key)) throw new BadRequestException('lead_form_submission_invalid');
    const contact: Record<string, string> = {};
    const customFields: LeadCustomFields = {};
    for (const field of form.fields) {
      const raw = submitted[field.key];
      if ((raw === undefined || raw === null || raw === '') && field.required) throw new BadRequestException('lead_form_submission_invalid');
      if (raw === undefined || raw === null || raw === '') continue;
      if (field.type === 'checkbox') {
        if (typeof raw !== 'boolean') throw new BadRequestException('lead_form_submission_invalid');
        customFields[field.customFieldKey ?? field.key] = raw;
        continue;
      }
      const value = this.normalization.clean(String(raw), field.type === 'textarea' ? 2000 : 320);
      if (!value) continue;
      if (field.type === 'select' && !field.options.includes(value)) throw new BadRequestException('lead_form_submission_invalid');
      const mapped = CORE_FIELD_MAP[field.type];
      if (mapped) contact[mapped] = value;
      else customFields[field.customFieldKey ?? field.key] = value;
    }
    if (!contact.email && !contact.phone) throw new BadRequestException('lead_form_submission_invalid');
    if (form.consent?.enabled && form.consent.required && dto.consentAccepted !== true) throw new BadRequestException('Consent is required.');
    return { contact, customFields, consentAccepted: dto.consentAccepted === true };
  }

  private endpointDto(dto: Pick<CreateLeadCaptureFormDto, 'name' | 'campaignId' | 'consent'>, fields: LeadCaptureFormField[]): CreateLeadCaptureEndpointDto {
    return { name: dto.name, campaignId: dto.campaignId, sourceType: 'website_form', sourceName: dto.name, requireConsent: dto.consent?.required ?? false, allowedOrigins: [] };
  }

  private assertHasIdentityField(fields: Pick<LeadCaptureFormField, 'type'>[]): void {
    if (!fields.some((field) => field.type === 'email' || field.type === 'phone')) throw new BadRequestException('lead_form_missing_identity_field');
  }

  private safeKey(key: string): string {
    const cleaned = this.normalization.clean(key, 80);
    if (!cleaned || cleaned === '__proto__' || cleaned === 'constructor' || cleaned === 'prototype' || cleaned.startsWith('$') || cleaned.includes('..') || !/^[a-zA-Z0-9_-]+$/.test(cleaned)) throw new BadRequestException('lead_form_field_invalid');
    return cleaned;
  }

  private async uniqueSlug(organizationId: string, productId: string, base: string, excludeId?: string): Promise<string> {
    let slug = base;
    let counter = 2;
    while (await this.formModel.exists({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), slug, ...(excludeId ? { _id: { $ne: new Types.ObjectId(excludeId) } } : {}) })) {
      slug = `${base}-${counter++}`;
    }
    return slug;
  }

  private async findOwned(organizationId: string, productId: string, formId: string): Promise<LeadCaptureFormDocument> {
    if (!Types.ObjectId.isValid(formId)) throw new NotFoundException('lead_form_not_found');
    const form = await this.formModel.findOne({ _id: new Types.ObjectId(formId), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).exec();
    if (!form) throw new NotFoundException('lead_form_not_found');
    return form;
  }

  private toPublicField(field: LeadCaptureFormField) {
    return { key: field.key, type: field.type, label: field.label, placeholder: field.placeholder, required: field.required, options: field.options, order: field.order };
  }

  private toResponse(form: LeadCaptureFormDocument, publicKey?: string) {
    return { id: form._id.toString(), organizationId: form.organizationId.toString(), productId: form.productId.toString(), campaignId: form.campaignId?.toString(), captureEndpointId: form.captureEndpointId.toString(), publicKey, name: form.name, slug: form.slug, title: form.title, description: form.description, status: form.status, submitButtonText: form.submitButtonText, successTitle: form.successTitle, successMessage: form.successMessage, fields: [...form.fields].sort((a, b) => a.order - b.order), consent: form.consent, appearance: form.appearance, createdAt: form.createdAt, updatedAt: form.updatedAt };
  }
}
