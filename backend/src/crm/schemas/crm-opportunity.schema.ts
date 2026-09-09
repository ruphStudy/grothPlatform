import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { CRM_OPPORTUNITY_STATUSES } from '../types/crm.types';
import type { CrmOpportunityStatus, CrmProbabilitySource } from '../types/crm.types';

export type CrmOpportunityDocument = HydratedDocument<CrmOpportunity>;

@Schema({ timestamps: true })
export class CrmOpportunity {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  pipelineId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  stageId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  leadId: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  crmAccountId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  campaignId?: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ type: String, enum: CRM_OPPORTUNITY_STATUSES, required: true, default: 'open' })
  status: CrmOpportunityStatus;

  @Prop({ type: Number })
  amount?: number;

  @Prop()
  currency?: string;

  @Prop({ type: Number })
  probability?: number;

  @Prop({ type: String, enum: ['stage', 'manual'], default: 'stage' })
  probabilitySource: CrmProbabilitySource;

  @Prop()
  expectedCloseDate?: Date;

  @Prop({ type: Types.ObjectId })
  assignedToUserId?: Types.ObjectId;

  @Prop()
  sourceType?: string;

  @Prop({ type: Types.ObjectId })
  sourceEventId?: Types.ObjectId;

  @Prop()
  description?: string;

  @Prop()
  wonAt?: Date;

  @Prop()
  lostAt?: Date;

  @Prop()
  lostReason?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CrmOpportunitySchema = SchemaFactory.createForClass(CrmOpportunity);
CrmOpportunitySchema.index({ organizationId: 1, productId: 1, leadId: 1 });
CrmOpportunitySchema.index({ organizationId: 1, productId: 1, stageId: 1 });
CrmOpportunitySchema.index({ organizationId: 1, productId: 1, status: 1 });
CrmOpportunitySchema.index({ organizationId: 1, productId: 1, campaignId: 1 });
CrmOpportunitySchema.index({ organizationId: 1, productId: 1, crmAccountId: 1 });
CrmOpportunitySchema.index({ organizationId: 1, productId: 1, pipelineId: 1, stageId: 1 });
