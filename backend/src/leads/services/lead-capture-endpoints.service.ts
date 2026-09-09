import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { Model, Types } from 'mongoose';
import { CampaignsService } from '../../campaigns/campaigns.service';
import { ProductsService } from '../../products/products.service';
import { CreateLeadCaptureEndpointDto, UpdateLeadCaptureEndpointDto } from '../dto/lead-capture-endpoint.dto';
import { PublicLeadCaptureDto } from '../dto/lead-common.dto';
import { LeadCaptureEndpoint, LeadCaptureEndpointDocument } from '../schemas/lead-capture-endpoint.schema';
import { LeadCaptureService } from './lead-capture.service';
import { LeadNormalizationService } from './lead-normalization.service';

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

@Injectable()
export class LeadCaptureEndpointsService {
  constructor(
    @InjectModel(LeadCaptureEndpoint.name) private readonly endpointModel: Model<LeadCaptureEndpointDocument>,
    private readonly productsService: ProductsService,
    private readonly campaignsService: CampaignsService,
    private readonly leadCaptureService: LeadCaptureService,
    private readonly normalization: LeadNormalizationService,
  ) {}

  async create(organizationId: string, productId: string, userId: string, dto: CreateLeadCaptureEndpointDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    if (dto.campaignId) await this.campaignsService.findOne(organizationId, productId, dto.campaignId, userId);
    const doc = await new this.endpointModel({
      organizationId: new Types.ObjectId(organizationId),
      productId: new Types.ObjectId(productId),
      campaignId: dto.campaignId ? new Types.ObjectId(dto.campaignId) : undefined,
      name: dto.name.trim(),
      publicKey: this.newPublicKey(),
      sourceType: dto.sourceType,
      sourceName: dto.sourceName?.trim(),
      allowedOrigins: this.normalizeOrigins(dto.allowedOrigins),
      active: true,
      requireConsent: dto.requireConsent ?? false,
    }).save();
    return this.toResponse(doc);
  }

  async list(organizationId: string, productId: string, userId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const docs = await this.endpointModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).sort({ createdAt: -1 }).exec();
    return docs.map((doc) => this.toResponse(doc));
  }

  async update(organizationId: string, productId: string, userId: string, endpointId: string, dto: UpdateLeadCaptureEndpointDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const doc = await this.findOwned(organizationId, productId, endpointId);
    if (dto.campaignId) await this.campaignsService.findOne(organizationId, productId, dto.campaignId, userId);
    if (dto.name !== undefined) doc.name = dto.name.trim();
    if (dto.sourceType !== undefined) doc.sourceType = dto.sourceType;
    if (dto.sourceName !== undefined) doc.sourceName = dto.sourceName.trim() || undefined;
    if (dto.campaignId !== undefined) doc.campaignId = dto.campaignId ? new Types.ObjectId(dto.campaignId) : undefined;
    if (dto.allowedOrigins !== undefined) doc.allowedOrigins = this.normalizeOrigins(dto.allowedOrigins);
    if (dto.active !== undefined) doc.active = dto.active;
    if (dto.requireConsent !== undefined) doc.requireConsent = dto.requireConsent;
    await doc.save();
    return this.toResponse(doc);
  }

  async rotateKey(organizationId: string, productId: string, userId: string, endpointId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const doc = await this.findOwned(organizationId, productId, endpointId);
    doc.publicKey = this.newPublicKey();
    await doc.save();
    return this.toResponse(doc);
  }

  async disable(organizationId: string, productId: string, userId: string, endpointId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const doc = await this.findOwned(organizationId, productId, endpointId);
    doc.active = false;
    await doc.save();
    return this.toResponse(doc);
  }

  async publicCapture(publicKey: string, dto: PublicLeadCaptureDto, meta: { origin?: string; ip?: string; idempotencyKey?: string }) {
    const endpoint = await this.resolvePublicEndpoint(publicKey);
    this.assertPublicAccess(endpoint, meta);
    if (dto._hp || dto.website) return { success: true };
    if (endpoint.requireConsent && dto.consent !== true) throw new BadRequestException('Consent is required.');
    const result = await this.leadCaptureService.capture(
      {
        organizationId: endpoint.organizationId.toString(),
        productId: endpoint.productId.toString(),
        campaignId: endpoint.campaignId?.toString(),
        contact: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          fullName: dto.fullName,
          email: dto.email,
          phone: dto.phone,
          companyName: dto.companyName,
          jobTitle: dto.jobTitle,
        },
        source: {
          type: endpoint.sourceType,
          name: endpoint.sourceName ?? endpoint.name,
          channel: 'website',
          landingPageUrl: dto.pageUrl,
          referrerUrl: dto.referrerUrl,
          externalSourceId: dto.externalSourceId,
        },
        utm: dto.utm,
        consent: dto.consent === true ? { status: 'granted', capturedAt: new Date().toISOString(), source: endpoint.name } : { status: 'unknown' },
        customFields: dto.fields,
        captureMethod: 'public_form',
      },
      { endpoint, key: dto.submissionId ?? meta.idempotencyKey },
    );
    if (result.outcome === 'conflict') throw new ConflictException('Lead submission could not be accepted.');
    return { success: true };
  }

  async resolvePublicEndpoint(publicKey: string): Promise<LeadCaptureEndpointDocument> {
    const endpoint = await this.endpointModel.findOne({ publicKey }).exec();
    if (!endpoint || !endpoint.active) throw new NotFoundException('Lead capture endpoint not found.');
    return endpoint;
  }

  assertPublicAccess(endpoint: LeadCaptureEndpointDocument, meta: { origin?: string; ip?: string }): void {
    this.assertRate(endpoint.publicKey, meta.ip);
    this.assertOrigin(endpoint, meta.origin);
  }

  private async findOwned(organizationId: string, productId: string, endpointId: string): Promise<LeadCaptureEndpointDocument> {
    let doc: LeadCaptureEndpointDocument | null;
    try {
      doc = await this.endpointModel.findOne({ _id: new Types.ObjectId(endpointId), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) });
    } catch {
      throw new NotFoundException('Lead capture endpoint not found.');
    }
    if (!doc) throw new NotFoundException('Lead capture endpoint not found.');
    return doc;
  }

  private assertOrigin(endpoint: LeadCaptureEndpointDocument, origin?: string): void {
    if (!endpoint.allowedOrigins?.length) return;
    if (!origin || !endpoint.allowedOrigins.includes(origin)) throw new BadRequestException('Origin is not allowed for this lead capture endpoint.');
  }

  private assertRate(publicKey: string, ip?: string): void {
    const now = Date.now();
    const key = `${publicKey}:${ip ?? 'unknown'}`;
    const bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
      return;
    }
    bucket.count += 1;
    if (bucket.count > RATE_LIMIT) throw new HttpException('Too many lead submissions.', HttpStatus.TOO_MANY_REQUESTS);
  }

  private normalizeOrigins(origins?: string[]): string[] {
    return Array.from(new Set((origins ?? []).map((origin) => this.normalization.clean(origin, 300)).filter((origin): origin is string => Boolean(origin))));
  }

  private newPublicKey(): string {
    return `lcp_${randomBytes(24).toString('base64url')}`;
  }

  private toResponse(doc: LeadCaptureEndpointDocument) {
    return {
      id: doc._id.toString(),
      organizationId: doc.organizationId.toString(),
      productId: doc.productId.toString(),
      campaignId: doc.campaignId?.toString(),
      name: doc.name,
      publicKey: doc.publicKey,
      sourceType: doc.sourceType,
      sourceName: doc.sourceName,
      allowedOrigins: doc.allowedOrigins ?? [],
      active: doc.active,
      requireConsent: doc.requireConsent,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
