import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { LEAD_COMMUNICATION_ELIGIBILITIES, LEAD_QUALIFICATION_GRADES, LEAD_QUALIFICATION_STATUSES } from '../types/lead.types';
import type { LeadCommunicationEligibility, LeadQualificationGrade, LeadQualificationReasonDirection, LeadQualificationStatus } from '../types/lead.types';

export type LeadQualificationDocument = HydratedDocument<LeadQualification>;

export interface LeadQualificationReason {
  ruleId: string;
  label: string;
  points: number;
  direction: LeadQualificationReasonDirection;
}

@Schema({ timestamps: true })
export class LeadQualification {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  leadId: Types.ObjectId;

  @Prop({ required: true, min: 0, max: 100 })
  score: number;

  @Prop({ type: String, enum: LEAD_QUALIFICATION_GRADES, required: true })
  grade: LeadQualificationGrade;

  @Prop({ type: String, enum: LEAD_QUALIFICATION_STATUSES, required: true })
  qualificationStatus: LeadQualificationStatus;

  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  reasons: LeadQualificationReason[];

  @Prop({ required: true, default: 'lead-scoring:v1' })
  scoringVersion: string;

  @Prop({ type: String, enum: LEAD_COMMUNICATION_ELIGIBILITIES, required: true })
  communicationEligibility: LeadCommunicationEligibility;

  @Prop({ required: true })
  evaluatedAt: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const LeadQualificationSchema = SchemaFactory.createForClass(LeadQualification);
LeadQualificationSchema.index({ organizationId: 1, productId: 1, leadId: 1 }, { unique: true });
LeadQualificationSchema.index({ organizationId: 1, productId: 1, qualificationStatus: 1, grade: 1 });
LeadQualificationSchema.index({ organizationId: 1, productId: 1, score: -1 });
