import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { InAppNotificationService } from '../../notifications/services/in-app-notification.service';
import { ApprovalEmailNotificationLog, ApprovalEmailNotificationLogDocument, ApprovalRequestDocument } from '../schemas/approval.schema';

@Injectable()
export class ApprovalNotificationService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(ApprovalEmailNotificationLog.name) private readonly emailLogModel: Model<ApprovalEmailNotificationLogDocument>,
    private readonly inApp: InAppNotificationService,
  ) {}

  async dispatch(eventType: 'approval_requested' | 'approval_approved' | 'approval_rejected' | 'approval_changes_requested', request: ApprovalRequestDocument, actorUserId: string, comment?: string) {
    const recipients = await this.recipients(eventType, request, actorUserId);
    const title = this.title(eventType, request.targetSnapshot.title);
    const message = this.message(eventType, request.targetSnapshot.title, comment);
    for (const user of recipients) {
      try {
        await this.inApp.create({
          organizationId: request.organizationId,
          productId: request.productId,
          userId: user._id,
          type: eventType,
          title,
          message,
          targetType: request.targetType,
          targetId: request.targetId,
          approvalRequestId: request._id,
          severity: eventType === 'approval_approved' ? 'success' : eventType === 'approval_requested' ? 'info' : 'warning',
        });
      } catch {
        // Notification failure is intentionally isolated from approval state.
      }
      await this.emailLogModel.create({
        organizationId: request.organizationId,
        productId: request.productId,
        approvalRequestId: request._id,
        eventType,
        recipientUserId: user._id,
        recipientEmail: user.email,
        status: 'skipped',
        errorCode: 'system_email_delivery_not_configured',
      });
    }
  }

  private async recipients(eventType: string, request: ApprovalRequestDocument, actorUserId: string) {
    const ids = new Set<string>();
    if (eventType === 'approval_requested') {
      request.reviewerUserIds.forEach((id) => ids.add(id));
    } else if (request.requestedByUserId) {
      ids.add(request.requestedByUserId.toString());
    }
    ids.add(actorUserId);
    const objectIds = [...ids].filter(Types.ObjectId.isValid).map((id) => new Types.ObjectId(id));
    if (!objectIds.length) return [];
    return this.userModel.find({ _id: { $in: objectIds }, status: 'active' }).select('email name status').lean().exec();
  }

  private title(eventType: string, itemTitle: string) {
    if (eventType === 'approval_requested') return `Review requested for ${itemTitle}`;
    if (eventType === 'approval_approved') return `${itemTitle} was approved`;
    if (eventType === 'approval_rejected') return `${itemTitle} was rejected`;
    return `Changes requested for ${itemTitle}`;
  }

  private message(eventType: string, itemTitle: string, comment?: string) {
    const safeComment = comment ? ` Comment: ${comment.replace(/[<>]/g, '').slice(0, 500)}` : '';
    return `${this.title(eventType, itemTitle)}.${safeComment}`;
  }
}
