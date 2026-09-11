import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProductsService } from '../../products/products.service';
import { CreateEmailSuppressionDto } from '../dto/email.dto';
import { EmailSuppression, EmailSuppressionDocument } from '../schemas/email-suppression.schema';
import type { EmailSuppressionReason } from '../types/email.types';

@Injectable()
export class EmailSuppressionService {
  constructor(
    @InjectModel(EmailSuppression.name) private readonly suppressionModel: Model<EmailSuppressionDocument>,
    private readonly productsService: ProductsService,
  ) {}

  async list(organizationId: string, productId: string, userId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const items = await this.suppressionModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).sort({ updatedAt: -1 }).limit(200).exec();
    return items.map((item) => this.toResponse(item));
  }

  async create(organizationId: string, productId: string, userId: string, dto: CreateEmailSuppressionDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const reason = this.reason(dto.reason);
    const normalizedEmail = this.normalize(dto.email);
    const updated = await this.suppressionModel.findOneAndUpdate(
      { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), normalizedEmail },
      { $set: { reason, active: true, source: dto.source?.trim() || 'manual' } },
      { upsert: true, new: true },
    ).exec();
    return this.toResponse(updated);
  }

  async deactivate(organizationId: string, productId: string, userId: string, id: string, body: { confirmRestrictedReason?: boolean }) {
    await this.productsService.findOne(organizationId, productId, userId);
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('email_suppression_not_found');
    const suppression = await this.suppressionModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).exec();
    if (!suppression) throw new NotFoundException('email_suppression_not_found');
    if (['complained', 'unsubscribed'].includes(suppression.reason) && !body?.confirmRestrictedReason) throw new BadRequestException('email_suppression_confirmation_required');
    suppression.active = false;
    suppression.source = 'manual_deactivate';
    await suppression.save();
    return this.toResponse(suppression);
  }

  async activateSystemSuppression(input: { organizationId: Types.ObjectId; productId: Types.ObjectId; normalizedEmail: string; reason: EmailSuppressionReason; source: string }) {
    await this.suppressionModel.updateOne(
      { organizationId: input.organizationId, productId: input.productId, normalizedEmail: input.normalizedEmail },
      { $set: { reason: input.reason, active: true, source: input.source } },
      { upsert: true },
    ).exec();
  }

  private reason(value?: string): EmailSuppressionReason {
    if (!value) return 'manual';
    if (['manual', 'unsubscribed', 'bounced', 'complained', 'invalid'].includes(value)) return value as EmailSuppressionReason;
    throw new BadRequestException('email_suppression_reason_invalid');
  }

  private normalize(value: string) {
    const email = value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('email_recipient_invalid');
    return email;
  }

  private toResponse(item: EmailSuppressionDocument) {
    return { id: item._id.toString(), organizationId: item.organizationId.toString(), productId: item.productId.toString(), normalizedEmail: item.normalizedEmail, reason: item.reason, active: item.active, source: item.source, createdAt: item.createdAt, updatedAt: item.updatedAt };
  }
}
