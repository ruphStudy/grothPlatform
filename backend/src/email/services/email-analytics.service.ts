import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProductsService } from '../../products/products.service';
import { EmailDashboardQueryDto } from '../dto/email.dto';
import { EmailEvent, EmailEventDocument } from '../schemas/email-event.schema';
import { EmailMessage, EmailMessageDocument } from '../schemas/email-message.schema';
import { EmailSequenceEnrollment, EmailSequenceEnrollmentDocument } from '../schemas/email-sequence-enrollment.schema';

const MAX_RANGE_DAYS = 366;

@Injectable()
export class EmailAnalyticsService {
  constructor(
    @InjectModel(EmailMessage.name) private readonly messageModel: Model<EmailMessageDocument>,
    @InjectModel(EmailEvent.name) private readonly eventModel: Model<EmailEventDocument>,
    @InjectModel(EmailSequenceEnrollment.name) private readonly enrollmentModel: Model<EmailSequenceEnrollmentDocument>,
    private readonly productsService: ProductsService,
  ) {}

  async dashboard(organizationId: string, productId: string, userId: string, query: EmailDashboardQueryDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const range = this.range(query);
    const match: Record<string, any> = { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), createdAt: range };
    if (query.campaignId) match.campaignId = new Types.ObjectId(query.campaignId);
    if (query.emailCampaignId) match.emailCampaignId = new Types.ObjectId(query.emailCampaignId);
    if (query.sequenceId) match.emailSequenceId = new Types.ObjectId(query.sequenceId);
    const messages = await this.messageModel.find(match, { _id: 1, status: 1, deliveryStatus: 1, openCount: 1, clickCount: 1 }).exec();
    const ids = messages.map((message) => message._id);
    const eventCounts = ids.length ? await this.eventModel.aggregate([
      { $match: { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), emailMessageId: { $in: ids } } },
      { $group: { _id: '$eventType', total: { $sum: 1 }, uniqueMessages: { $addToSet: '$emailMessageId' } } },
    ]).exec() : [];
    const eventMap = new Map(eventCounts.map((item) => [item._id, { total: item.total, unique: item.uniqueMessages.length }]));
    const accepted = messages.filter((message) => message.status === 'accepted').length;
    const delivered = messages.filter((message) => message.deliveryStatus === 'delivered').length;
    const bounced = messages.filter((message) => message.deliveryStatus === 'bounced').length || (eventMap.get('bounced')?.unique ?? 0);
    const complained = messages.filter((message) => message.deliveryStatus === 'complained').length || (eventMap.get('complained')?.unique ?? 0);
    const opened = eventMap.get('opened') ?? { total: 0, unique: 0 };
    const clicked = eventMap.get('clicked') ?? { total: 0, unique: 0 };
    const unsubscribes = eventMap.get('unsubscribed')?.unique ?? 0;
    const sequencePerformance = query.sequenceId ? await this.sequencePerformance(organizationId, productId, query.sequenceId) : undefined;
    return {
      range: { from: range.$gte, to: range.$lte },
      summary: {
        accepted,
        delivered,
        bounced,
        complained,
        recordedOpens: opened.total,
        uniqueOpenedMessages: opened.unique,
        recordedClicks: clicked.total,
        uniqueClickedMessages: clicked.unique,
        unsubscribes,
        deliveryRate: accepted ? delivered / accepted : null,
        bounceRate: accepted ? bounced / accepted : null,
        recordedOpenRate: delivered ? opened.unique / delivered : accepted ? opened.unique / accepted : null,
        recordedClickRate: delivered ? clicked.unique / delivered : accepted ? clicked.unique / accepted : null,
      },
      sequencePerformance,
    };
  }

  private async sequencePerformance(organizationId: string, productId: string, sequenceId: string) {
    const counts = await this.enrollmentModel.aggregate([
      { $match: { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), sequenceId: new Types.ObjectId(sequenceId) } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]).exec();
    const map = new Map(counts.map((item) => [item._id, item.count]));
    return { enrolled: counts.reduce((sum, item) => sum + item.count, 0), active: map.get('active') ?? 0, completed: map.get('completed') ?? 0, stopped: map.get('stopped') ?? 0, failed: map.get('failed') ?? 0 };
  }

  private range(query: EmailDashboardQueryDto) {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to.getTime() < from.getTime()) return { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), $lte: new Date() };
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) return { $gte: new Date(to.getTime() - MAX_RANGE_DAYS * 24 * 60 * 60 * 1000), $lte: to };
    return { $gte: from, $lte: to };
  }
}
