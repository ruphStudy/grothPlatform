import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHmac, timingSafeEqual } from 'crypto';
import { Model, Types } from 'mongoose';
import { ProviderEmailWebhookDto } from '../dto/email.dto';
import { EmailEvent, EmailEventDocument } from '../schemas/email-event.schema';
import { EmailMessage, EmailMessageDocument } from '../schemas/email-message.schema';
import type { EmailEventType, EmailPlatform } from '../types/email.types';
import { EmailSuppressionService } from './email-suppression.service';

const MAX_METADATA_KEYS = 20;

@Injectable()
export class EmailEventService {
  constructor(
    @InjectModel(EmailEvent.name) private readonly eventModel: Model<EmailEventDocument>,
    @InjectModel(EmailMessage.name) private readonly messageModel: Model<EmailMessageDocument>,
    private readonly suppressionService: EmailSuppressionService,
  ) {}

  async ingest(provider: EmailPlatform, body: ProviderEmailWebhookDto | any, headers: Record<string, string | string[] | undefined>) {
    if (provider !== 'resend') throw new BadRequestException('email_webhook_provider_unsupported');
    this.verifyResendSignature(body, headers);
    const normalized = this.normalizeResend(body);
    const message = await this.messageModel.findOne({ provider, providerMessageId: normalized.providerMessageId }).exec();
    if (!message) return { status: 'accepted', matched: false };
    const existing = normalized.providerEventId ? await this.eventModel.exists({ provider, providerEventId: normalized.providerEventId }) : undefined;
    if (existing) return { status: 'accepted', matched: true, duplicate: true };
    const event = await new this.eventModel({
      organizationId: message.organizationId,
      productId: message.productId,
      emailMessageId: message._id,
      provider,
      providerMessageId: normalized.providerMessageId,
      eventType: normalized.eventType,
      providerEventId: normalized.providerEventId,
      occurredAt: normalized.occurredAt,
      linkUrl: normalized.linkUrl,
      metadata: normalized.metadata,
    }).save();
    await this.applyMessageUpdate(message, event);
    return { status: 'accepted', matched: true, eventId: event._id.toString() };
  }

  async listForMessage(organizationId: string, productId: string, userId: string, messageId: string) {
    void userId;
    const items = await this.eventModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), emailMessageId: new Types.ObjectId(messageId) }).sort({ occurredAt: 1 }).exec();
    return items.map((item) => this.toResponse(item));
  }

  private verifyResendSignature(body: unknown, headers: Record<string, string | string[] | undefined>) {
    const secret = process.env.RESEND_WEBHOOK_SECRET || process.env.EMAIL_WEBHOOK_SECRET;
    if (!secret) throw new BadRequestException('email_webhook_signature_missing');
    const signature = this.header(headers, 'resend-signature') || this.header(headers, 'x-resend-signature') || this.header(headers, 'svix-signature');
    if (!signature) throw new BadRequestException('email_webhook_signature_missing');
    const payload = JSON.stringify(body);
    const digest = createHmac('sha256', secret).update(payload).digest('hex');
    const clean = signature.includes(',') ? signature.split(',').find((part) => part.includes('v1='))?.split('=')[1] || signature : signature.replace(/^sha256=/, '').replace(/^v1=/, '');
    const left = Buffer.from(digest);
    const right = Buffer.from(clean);
    if (left.length !== right.length || !timingSafeEqual(left, right)) throw new BadRequestException('email_webhook_signature_invalid');
  }

  private normalizeResend(body: any): { providerMessageId: string; eventType: EmailEventType; providerEventId?: string; occurredAt: Date; linkUrl?: string; metadata?: Record<string, unknown> } {
    const type = String(body?.eventType || body?.type || '').toLowerCase().replace(/\./g, '_');
    const eventType = this.eventType(type);
    const data = body?.data || body;
    const providerMessageId = String(data?.email_id || data?.emailId || data?.id || body?.providerMessageId || '');
    if (!providerMessageId) throw new BadRequestException('email_webhook_malformed');
    const occurredAt = new Date(body?.occurredAt || body?.created_at || data?.created_at || Date.now());
    return {
      providerMessageId,
      eventType,
      providerEventId: body?.id ? String(body.id) : body?.providerEventId ? String(body.providerEventId) : undefined,
      occurredAt: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
      linkUrl: this.safeUrl(data?.link?.url || data?.url || body?.linkUrl),
      metadata: this.safeMetadata({ reason: data?.reason, bounceType: data?.bounce_type, rawType: body?.type || body?.eventType }),
    };
  }

  private eventType(type: string): EmailEventType {
    if (type.includes('delivered')) return 'delivered';
    if (type.includes('delivery_delayed') || type.includes('delayed')) return 'delivery_delayed';
    if (type.includes('bounce')) return 'bounced';
    if (type.includes('complain') || type.includes('spam')) return 'complained';
    if (type.includes('open')) return 'opened';
    if (type.includes('click')) return 'clicked';
    if (type.includes('unsubscribe')) return 'unsubscribed';
    if (type.includes('fail')) return 'failed';
    if (type.includes('sent') || type.includes('accepted')) return 'accepted';
    throw new BadRequestException('email_webhook_event_unsupported');
  }

  private async applyMessageUpdate(message: EmailMessageDocument, event: EmailEventDocument) {
    const at = event.occurredAt;
    if (event.eventType === 'accepted') message.deliveryStatus = 'accepted';
    if (event.eventType === 'delivered') {
      message.deliveryStatus = 'delivered';
      message.deliveredAt = message.deliveredAt || at;
    }
    if (event.eventType === 'delivery_delayed') message.deliveryStatus = message.deliveryStatus === 'delivered' ? message.deliveryStatus : 'delayed';
    if (event.eventType === 'failed') message.deliveryStatus = 'failed';
    if (event.eventType === 'bounced') {
      message.deliveryStatus = 'bounced';
      message.bouncedAt = message.bouncedAt || at;
      await this.suppressionService.activateSystemSuppression({ organizationId: message.organizationId, productId: message.productId, normalizedEmail: message.toEmail, reason: 'bounced', source: 'provider_webhook' });
    }
    if (event.eventType === 'complained') {
      message.deliveryStatus = 'complained';
      message.complainedAt = message.complainedAt || at;
      await this.suppressionService.activateSystemSuppression({ organizationId: message.organizationId, productId: message.productId, normalizedEmail: message.toEmail, reason: 'complained', source: 'provider_webhook' });
    }
    if (event.eventType === 'unsubscribed') {
      await this.suppressionService.activateSystemSuppression({ organizationId: message.organizationId, productId: message.productId, normalizedEmail: message.toEmail, reason: 'unsubscribed', source: 'provider_webhook' });
    }
    if (event.eventType === 'opened') {
      message.firstOpenedAt = message.firstOpenedAt || at;
      message.lastOpenedAt = at;
      message.openCount = (message.openCount ?? 0) + 1;
    }
    if (event.eventType === 'clicked') {
      message.firstClickedAt = message.firstClickedAt || at;
      message.lastClickedAt = at;
      message.clickCount = (message.clickCount ?? 0) + 1;
    }
    await message.save();
  }

  private header(headers: Record<string, string | string[] | undefined>, name: string) {
    const found = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
    return Array.isArray(found) ? found[0] : found;
  }

  private safeUrl(value: unknown) {
    if (!value) return undefined;
    return String(value).slice(0, 2048);
  }

  private safeMetadata(value: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).slice(0, MAX_METADATA_KEYS).map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 200) : v]));
  }

  private toResponse(item: EmailEventDocument) {
    return { id: item._id.toString(), emailMessageId: item.emailMessageId.toString(), provider: item.provider, providerMessageId: item.providerMessageId, eventType: item.eventType, providerEventId: item.providerEventId, occurredAt: item.occurredAt, linkUrl: item.linkUrl, metadata: item.metadata, createdAt: item.createdAt };
  }
}
