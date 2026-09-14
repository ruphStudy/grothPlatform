import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { NotificationQueryDto } from '../dto/notifications.dto';
import { InAppNotification, InAppNotificationDocument } from '../schemas/in-app-notification.schema';

@Injectable()
export class InAppNotificationService {
  constructor(@InjectModel(InAppNotification.name) private readonly notificationModel: Model<InAppNotificationDocument>) {}

  async create(input: {
    organizationId: string | Types.ObjectId;
    productId?: string | Types.ObjectId;
    userId: string | Types.ObjectId;
    type: string;
    title: string;
    message: string;
    targetType?: string;
    targetId?: string;
    approvalRequestId?: string | Types.ObjectId;
    severity?: 'info' | 'success' | 'warning' | 'error';
  }) {
    return this.notificationModel.create({
      organizationId: this.objectId(input.organizationId),
      productId: input.productId ? this.objectId(input.productId) : undefined,
      userId: this.objectId(input.userId),
      type: input.type,
      title: this.bound(input.title, 300),
      message: this.bound(input.message, 1000),
      targetType: input.targetType,
      targetId: input.targetId,
      approvalRequestId: input.approvalRequestId ? this.objectId(input.approvalRequestId) : undefined,
      severity: input.severity || 'info',
    });
  }

  async list(userId: string, query: NotificationQueryDto) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(query.limit || 20)));
    const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
    if (query.unreadOnly === 'true') filter.readAt = { $exists: false };
    if (query.productId && Types.ObjectId.isValid(query.productId)) filter.productId = new Types.ObjectId(query.productId);
    const [items, total] = await Promise.all([
      this.notificationModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean().exec(),
      this.notificationModel.countDocuments(filter).exec(),
    ]);
    return { items, page, limit, total };
  }

  async unreadCount(userId: string, productId?: string) {
    const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId), readAt: { $exists: false } };
    if (productId && Types.ObjectId.isValid(productId)) filter.productId = new Types.ObjectId(productId);
    return { unread: await this.notificationModel.countDocuments(filter).exec() };
  }

  async markRead(userId: string, notificationId: string) {
    const notification = await this.notificationModel.findOneAndUpdate({ _id: new Types.ObjectId(notificationId), userId: new Types.ObjectId(userId) }, { $set: { readAt: new Date() } }, { new: true }).lean().exec();
    if (!notification) throw new NotFoundException('notification_not_found');
    return notification;
  }

  async markAllRead(userId: string, productId?: string) {
    const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId), readAt: { $exists: false } };
    if (productId && Types.ObjectId.isValid(productId)) filter.productId = new Types.ObjectId(productId);
    const result = await this.notificationModel.updateMany(filter, { $set: { readAt: new Date() } }).exec();
    return { markedRead: result.modifiedCount };
  }

  private objectId(value: string | Types.ObjectId) {
    return value instanceof Types.ObjectId ? value : new Types.ObjectId(value);
  }

  private bound(value: string, max: number) {
    return value.replace(/[<>]/g, '').slice(0, max);
  }
}
