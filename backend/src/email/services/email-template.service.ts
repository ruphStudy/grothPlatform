import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CampaignsService } from '../../campaigns/campaigns.service';
import { CrmAccount, CrmAccountDocument } from '../../crm/schemas/crm-account.schema';
import { CrmOpportunity, CrmOpportunityDocument } from '../../crm/schemas/crm-opportunity.schema';
import { Lead, LeadDocument } from '../../leads/schemas/lead.schema';
import { ProductsService } from '../../products/products.service';
import { Product, ProductDocument } from '../../products/schemas/product.schema';
import { CreateEmailTemplateDto, PreviewEmailTemplateDto, UpdateEmailTemplateDto } from '../dto/email.dto';
import { EmailSender, EmailSenderDocument } from '../schemas/email-sender.schema';
import { EmailTemplate, EmailTemplateDocument } from '../schemas/email-template.schema';
import { EmailTemplateVersion, EmailTemplateVersionDocument } from '../schemas/email-template-version.schema';
import { EmailTemplateRendererService, EmailRenderContext } from './email-template-renderer.service';

@Injectable()
export class EmailTemplateService {
  constructor(
    @InjectModel(EmailTemplate.name) private readonly templateModel: Model<EmailTemplateDocument>,
    @InjectModel(EmailTemplateVersion.name) private readonly versionModel: Model<EmailTemplateVersionDocument>,
    @InjectModel(Lead.name) private readonly leadModel: Model<LeadDocument>,
    @InjectModel(CrmOpportunity.name) private readonly opportunityModel: Model<CrmOpportunityDocument>,
    @InjectModel(CrmAccount.name) private readonly accountModel: Model<CrmAccountDocument>,
    @InjectModel(EmailSender.name) private readonly senderModel: Model<EmailSenderDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    private readonly productsService: ProductsService,
    private readonly campaignsService: CampaignsService,
    private readonly renderer: EmailTemplateRendererService,
  ) {}

  async create(organizationId: string, productId: string, userId: string, dto: CreateEmailTemplateDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    this.validateContent(dto.subjectTemplate, dto.htmlTemplate, dto.textTemplate);
    const template = await new this.templateModel({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), name: dto.name.trim(), slug: await this.uniqueSlug(organizationId, productId, dto.name), type: dto.type, status: dto.status || 'draft', latestVersion: 1 }).save();
    const version = await this.createVersion(template, 1, userId, dto.subjectTemplate, dto.htmlTemplate, dto.textTemplate, dto.previewText);
    return { ...this.toTemplateResponse(template), latest: this.toVersionResponse(version) };
  }

  async list(organizationId: string, productId: string, userId: string, query: Record<string, string | undefined>) {
    await this.productsService.findOne(organizationId, productId, userId);
    const filter: Record<string, any> = { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) };
    if (query.status) filter.status = query.status;
    if (query.type) filter.type = query.type;
    const items = await this.templateModel.find(filter).sort({ updatedAt: -1 }).limit(Math.min(Number(query.limit) || 50, 100)).exec();
    return Promise.all(items.map(async (item) => {
      const latest = await this.findVersion(organizationId, productId, item._id.toString(), item.latestVersion);
      return { ...this.toTemplateResponse(item), latest: this.toVersionResponse(latest) };
    }));
  }

  async get(organizationId: string, productId: string, userId: string, templateId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const template = await this.findTemplate(organizationId, productId, templateId);
    const latest = await this.findVersion(organizationId, productId, templateId, template.latestVersion);
    return { ...this.toTemplateResponse(template), latest: this.toVersionResponse(latest) };
  }

  async update(organizationId: string, productId: string, userId: string, templateId: string, dto: UpdateEmailTemplateDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const template = await this.findTemplate(organizationId, productId, templateId);
    if (dto.name !== undefined) {
      template.name = dto.name.trim();
      template.slug = await this.uniqueSlug(organizationId, productId, dto.name, templateId);
    }
    if (dto.type !== undefined) template.type = dto.type;
    if (dto.status !== undefined) template.status = dto.status;
    const contentTouched = dto.subjectTemplate !== undefined || dto.htmlTemplate !== undefined || dto.textTemplate !== undefined || dto.previewText !== undefined;
    let latest: EmailTemplateVersionDocument | undefined;
    if (contentTouched) {
      const current = await this.findVersion(organizationId, productId, templateId, template.latestVersion);
      const subject = dto.subjectTemplate ?? current.subjectTemplate;
      const html = dto.htmlTemplate ?? current.htmlTemplate;
      const text = dto.textTemplate ?? current.textTemplate;
      const preview = dto.previewText ?? current.previewText;
      this.validateContent(subject, html, text);
      template.latestVersion += 1;
      latest = await this.createVersion(template, template.latestVersion, userId, subject, html, text, preview);
    }
    await template.save();
    return { ...this.toTemplateResponse(template), latest: latest ? this.toVersionResponse(latest) : undefined };
  }

  async archive(organizationId: string, productId: string, userId: string, templateId: string) {
    return this.update(organizationId, productId, userId, templateId, { status: 'archived' });
  }

  async versions(organizationId: string, productId: string, userId: string, templateId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    await this.findTemplate(organizationId, productId, templateId);
    const versions = await this.versionModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), templateId: new Types.ObjectId(templateId) }).sort({ version: -1 }).exec();
    return versions.map((version) => this.toVersionResponse(version));
  }

  async version(organizationId: string, productId: string, userId: string, templateId: string, version: number) {
    await this.productsService.findOne(organizationId, productId, userId);
    return this.toVersionResponse(await this.findVersion(organizationId, productId, templateId, version));
  }

  async preview(organizationId: string, productId: string, userId: string, templateId: string, version: number, dto: PreviewEmailTemplateDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const templateVersion = await this.findVersion(organizationId, productId, templateId, version);
    const context = await this.resolveContext(organizationId, productId, userId, dto, false);
    const rendered = this.renderer.render(templateVersion, context.context);
    return { ...rendered, sample: context.sample, previewText: rendered.previewText };
  }

  async renderForSend(organizationId: string, productId: string, userId: string, templateId: string, version: number, dto: PreviewEmailTemplateDto & { unsubscribeUrl?: string }) {
    const templateVersion = await this.findVersion(organizationId, productId, templateId, version);
    const context = await this.resolveContext(organizationId, productId, userId, dto, false);
    const rendered = this.renderer.render(templateVersion, { ...context.context, unsubscribeUrl: dto.unsubscribeUrl });
    if (rendered.missingVariables.length) throw new BadRequestException('email_template_missing_variables');
    return { ...rendered, templateVersion };
  }

  async findTemplate(organizationId: string, productId: string, templateId: string) {
    if (!Types.ObjectId.isValid(templateId)) throw new NotFoundException('email_template_not_found');
    const template = await this.templateModel.findOne({ _id: new Types.ObjectId(templateId), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).exec();
    if (!template) throw new NotFoundException('email_template_not_found');
    return template;
  }

  async findVersion(organizationId: string, productId: string, templateId: string, version: number) {
    if (!Types.ObjectId.isValid(templateId)) throw new NotFoundException('email_template_not_found');
    const doc = await this.versionModel.findOne({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), templateId: new Types.ObjectId(templateId), version }).exec();
    if (!doc) throw new NotFoundException('email_template_not_found');
    return doc;
  }

  private async createVersion(template: EmailTemplateDocument, version: number, userId: string, subjectTemplate: string, htmlTemplate?: string, textTemplate?: string, previewText?: string) {
    const variables = this.renderer.extractVariables(subjectTemplate, htmlTemplate, textTemplate, previewText);
    return new this.versionModel({ organizationId: template.organizationId, productId: template.productId, templateId: template._id, version, subjectTemplate: subjectTemplate.trim(), htmlTemplate: this.renderer.sanitizeHtml(htmlTemplate), textTemplate, previewText, variables, createdByUserId: Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : undefined }).save();
  }

  private validateContent(subject: string, html?: string, text?: string) {
    if (/[\r\n]/.test(subject) || !subject.trim() || subject.length > 200) throw new BadRequestException('email_subject_invalid');
    if (!html && !text) throw new BadRequestException('email_content_invalid');
    this.renderer.extractVariables(subject, html, text);
    this.renderer.sanitizeHtml(html);
  }

  private async resolveContext(organizationId: string, productId: string, userId: string, dto: PreviewEmailTemplateDto, requireReal: boolean): Promise<{ context: EmailRenderContext; sample: boolean }> {
    const product = await this.productModel.findOne({ _id: new Types.ObjectId(productId), organizationId: new Types.ObjectId(organizationId) }).exec();
    let context: EmailRenderContext = { firstName: 'Alex', lastName: 'Morgan', fullName: 'Alex Morgan', email: 'alex@example.test', companyName: 'Example Co', jobTitle: 'Founder', productName: product?.name, campaignName: 'Sample Campaign', opportunityName: 'Sample Opportunity', accountName: 'Example Co', senderName: 'Sender' };
    let sample = true;
    if (dto.leadId) {
      const lead = await this.leadModel.findOne({ _id: new Types.ObjectId(dto.leadId), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).exec();
      if (!lead) throw new NotFoundException('Lead not found.');
      context = { ...context, firstName: lead.firstName, lastName: lead.lastName, fullName: lead.fullName, email: lead.normalizedEmail || lead.email, companyName: lead.companyName, jobTitle: lead.jobTitle };
      sample = false;
    } else if (requireReal) throw new BadRequestException('email_template_context_required');
    if (dto.opportunityId) {
      const opportunity = await this.opportunityModel.findOne({ _id: new Types.ObjectId(dto.opportunityId), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).exec();
      if (!opportunity) throw new NotFoundException('crm_opportunity_not_found');
      context.opportunityName = opportunity.name;
      if (opportunity.crmAccountId) {
        const account = await this.accountModel.findOne({ _id: opportunity.crmAccountId, organizationId: opportunity.organizationId, productId: opportunity.productId }).exec();
        context.accountName = account?.name;
      }
    }
    if (dto.campaignId) {
      const campaign = await this.campaignsService.findOne(organizationId, productId, dto.campaignId, userId);
      context.campaignName = campaign.name;
    }
    if (dto.senderId) {
      const sender = await this.senderModel.findOne({ _id: new Types.ObjectId(dto.senderId), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).exec();
      context.senderName = sender?.name || sender?.email;
    }
    return { context, sample };
  }

  private async uniqueSlug(organizationId: string, productId: string, name: string, excludeId?: string) {
    const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'email-template';
    let slug = base;
    let counter = 2;
    while (await this.templateModel.exists({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), slug, ...(excludeId ? { _id: { $ne: new Types.ObjectId(excludeId) } } : {}) })) slug = `${base}-${counter++}`;
    return slug;
  }

  private toTemplateResponse(template: EmailTemplateDocument) {
    return { id: template._id.toString(), organizationId: template.organizationId.toString(), productId: template.productId.toString(), name: template.name, slug: template.slug, type: template.type, status: template.status, latestVersion: template.latestVersion, createdAt: template.createdAt, updatedAt: template.updatedAt };
  }

  private toVersionResponse(version: EmailTemplateVersionDocument) {
    return { id: version._id.toString(), templateId: version.templateId.toString(), version: version.version, subjectTemplate: version.subjectTemplate, htmlTemplate: version.htmlTemplate, textTemplate: version.textTemplate, previewText: version.previewText, variables: version.variables, createdByUserId: version.createdByUserId?.toString(), createdAt: version.createdAt };
  }
}
