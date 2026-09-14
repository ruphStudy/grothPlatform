import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export const APPROVAL_TARGET_TYPES = ['content_version', 'creative_asset', 'social_publication', 'cms_publication', 'email_campaign', 'email_schedule', 'weekly_growth_plan', 'growth_decision', 'strategy_adjustment', 'campaign', 'other'] as const;
export const APPROVAL_REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'changes_requested', 'cancelled', 'expired'] as const;
export const APPROVAL_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export const APPROVAL_POLICIES = ['required', 'recommended', 'optional'] as const;
export const APPROVAL_DECISIONS = ['requested', 'approved', 'rejected', 'changes_requested', 'cancelled', 'reopened', 'recommended_override'] as const;

export type ApprovalTargetType = (typeof APPROVAL_TARGET_TYPES)[number];
export type ApprovalRequestStatus = (typeof APPROVAL_REQUEST_STATUSES)[number];
export type ApprovalPolicy = (typeof APPROVAL_POLICIES)[number];
export type ApprovalDecisionType = (typeof APPROVAL_DECISIONS)[number];
export type ApprovalRequestDocument = HydratedDocument<ApprovalRequest>;
export type ApprovalDecisionDocument = HydratedDocument<ApprovalDecision>;
export type ApprovalEmailNotificationLogDocument = HydratedDocument<ApprovalEmailNotificationLog>;

@Schema({ _id: false })
export class ApprovalTargetSnapshot {
  @Prop({ required: true, maxlength: 300 })
  title: string;

  @Prop({ maxlength: 1000 })
  summary?: string;

  @Prop({ type: String, enum: APPROVAL_TARGET_TYPES, required: true })
  targetType: ApprovalTargetType;

  @Prop({ required: true })
  targetId: string;

  @Prop()
  targetVersionId?: string;

  @Prop()
  statusAtRequest?: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  relevantMetadata: Record<string, unknown>;
}
export const ApprovalTargetSnapshotSchema = SchemaFactory.createForClass(ApprovalTargetSnapshot);

@Schema({ timestamps: true })
export class ApprovalRequest {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: String, enum: APPROVAL_TARGET_TYPES, required: true })
  targetType: ApprovalTargetType;

  @Prop({ required: true })
  targetId: string;

  @Prop()
  targetVersionId?: string;

  @Prop({ type: Types.ObjectId })
  requestedByUserId?: Types.ObjectId;

  @Prop()
  reasonCode?: string;

  @Prop({ maxlength: 2000 })
  reasonText?: string;

  @Prop({ type: String, enum: APPROVAL_REQUEST_STATUSES, required: true, default: 'pending' })
  status: ApprovalRequestStatus;

  @Prop({ type: String, enum: APPROVAL_PRIORITIES, required: true, default: 'normal' })
  priority: (typeof APPROVAL_PRIORITIES)[number];

  @Prop({ type: String, enum: APPROVAL_POLICIES, required: true })
  approvalPolicy: ApprovalPolicy;

  @Prop({ type: [String], default: [] })
  reviewerUserIds: string[];

  @Prop({ type: ApprovalTargetSnapshotSchema, required: true })
  targetSnapshot: ApprovalTargetSnapshot;

  @Prop({ required: true })
  requestedAt: Date;

  @Prop()
  dueAt?: Date;

  @Prop()
  resolvedAt?: Date;

  @Prop({ type: Types.ObjectId })
  currentDecisionId?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}
export const ApprovalRequestSchema = SchemaFactory.createForClass(ApprovalRequest);
ApprovalRequestSchema.index({ organizationId: 1, productId: 1, status: 1, requestedAt: 1 });
ApprovalRequestSchema.index({ organizationId: 1, productId: 1, targetType: 1, targetId: 1 });
ApprovalRequestSchema.index({ reviewerUserIds: 1, status: 1 });
ApprovalRequestSchema.index({ dueAt: 1, status: 1 });
ApprovalRequestSchema.index(
  { organizationId: 1, productId: 1, targetType: 1, targetId: 1, targetVersionId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['pending', 'changes_requested'] } } },
);

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class ApprovalDecision {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ApprovalRequest', required: true })
  approvalRequestId: Types.ObjectId;

  @Prop({ type: String, enum: APPROVAL_DECISIONS, required: true })
  decision: ApprovalDecisionType;

  @Prop({ type: Types.ObjectId, required: true })
  decidedByUserId: Types.ObjectId;

  @Prop({ maxlength: 2000 })
  comment?: string;

  @Prop({ required: true })
  decidedAt: Date;

  @Prop({ type: String, enum: APPROVAL_REQUEST_STATUSES, required: true })
  previousStatus: ApprovalRequestStatus;

  @Prop({ type: String, enum: APPROVAL_REQUEST_STATUSES, required: true })
  resultingStatus: ApprovalRequestStatus;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata: Record<string, unknown>;

  createdAt?: Date;
}
export const ApprovalDecisionSchema = SchemaFactory.createForClass(ApprovalDecision);
ApprovalDecisionSchema.index({ approvalRequestId: 1, decidedAt: 1 });
ApprovalDecisionSchema.index({ organizationId: 1, productId: 1, decidedAt: -1 });

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class ApprovalEmailNotificationLog {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ApprovalRequest', required: true })
  approvalRequestId: Types.ObjectId;

  @Prop({ required: true })
  eventType: string;

  @Prop({ type: Types.ObjectId })
  recipientUserId?: Types.ObjectId;

  @Prop()
  recipientEmail?: string;

  @Prop({ required: true })
  status: 'skipped' | 'sent' | 'failed';

  @Prop()
  emailMessageId?: string;

  @Prop()
  errorCode?: string;

  createdAt?: Date;
}
export const ApprovalEmailNotificationLogSchema = SchemaFactory.createForClass(ApprovalEmailNotificationLog);
ApprovalEmailNotificationLogSchema.index({ organizationId: 1, productId: 1, createdAt: -1 });
ApprovalEmailNotificationLogSchema.index({ approvalRequestId: 1, eventType: 1 });
