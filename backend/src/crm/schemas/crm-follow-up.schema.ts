import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { CRM_FOLLOW_UP_STATUSES, CRM_FOLLOW_UP_TYPES } from '../types/crm.types';
import type { CrmFollowUpStatus, CrmFollowUpType } from '../types/crm.types';

export type CrmFollowUpDocument = HydratedDocument<CrmFollowUp>;

@Schema({ timestamps: true })
export class CrmFollowUp {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  opportunityId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  leadId: Types.ObjectId;

  @Prop({ type: String, enum: CRM_FOLLOW_UP_TYPES, required: true })
  type: CrmFollowUpType;

  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  @Prop({ required: true })
  dueAt: Date;

  @Prop()
  timezone?: string;

  @Prop({ type: String, enum: CRM_FOLLOW_UP_STATUSES, required: true, default: 'pending' })
  status: CrmFollowUpStatus;

  @Prop({ type: Types.ObjectId })
  assignedToUserId?: Types.ObjectId;

  @Prop()
  completedAt?: Date;

  @Prop()
  cancelledAt?: Date;

  @Prop()
  outcome?: string;

  @Prop({ type: Types.ObjectId })
  createdByUserId?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CrmFollowUpSchema = SchemaFactory.createForClass(CrmFollowUp);
CrmFollowUpSchema.index({ organizationId: 1, productId: 1, status: 1, dueAt: 1 });
CrmFollowUpSchema.index({ organizationId: 1, productId: 1, assignedToUserId: 1, dueAt: 1 });
CrmFollowUpSchema.index({ organizationId: 1, productId: 1, opportunityId: 1, dueAt: 1 });
CrmFollowUpSchema.index({ organizationId: 1, productId: 1, leadId: 1, dueAt: 1 });
