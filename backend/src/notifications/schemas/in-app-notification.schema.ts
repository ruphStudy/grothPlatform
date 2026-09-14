import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const IN_APP_NOTIFICATION_SEVERITIES = ['info', 'success', 'warning', 'error'] as const;
export const IN_APP_NOTIFICATION_TYPES = ['approval_requested', 'approval_approved', 'approval_rejected', 'approval_changes_requested'] as const;

export type InAppNotificationDocument = HydratedDocument<InAppNotification>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class InAppNotification {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  productId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  type: string;

  @Prop({ required: true, maxlength: 300 })
  title: string;

  @Prop({ required: true, maxlength: 1000 })
  message: string;

  @Prop()
  targetType?: string;

  @Prop()
  targetId?: string;

  @Prop({ type: Types.ObjectId })
  approvalRequestId?: Types.ObjectId;

  @Prop({ type: String, enum: IN_APP_NOTIFICATION_SEVERITIES, required: true, default: 'info' })
  severity: (typeof IN_APP_NOTIFICATION_SEVERITIES)[number];

  @Prop()
  readAt?: Date;

  @Prop()
  expiresAt?: Date;

  createdAt?: Date;
}
export const InAppNotificationSchema = SchemaFactory.createForClass(InAppNotification);
InAppNotificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
InAppNotificationSchema.index({ userId: 1, createdAt: -1 });
InAppNotificationSchema.index({ organizationId: 1, productId: 1, createdAt: -1 });
