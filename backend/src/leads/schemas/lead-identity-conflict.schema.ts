import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { LEAD_IDENTITY_CONFLICT_STATUSES } from '../types/lead.types';
import type { LeadCustomFields, LeadIdentityConflictStatus } from '../types/lead.types';

export type LeadIdentityConflictDocument = HydratedDocument<LeadIdentityConflict>;

@Schema({ timestamps: true })
export class LeadIdentityConflict {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  emailLeadId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  phoneLeadId: Types.ObjectId;

  @Prop({ required: true })
  normalizedEmail: string;

  @Prop({ required: true })
  normalizedPhone: string;

  @Prop({ type: Map, of: MongooseSchema.Types.Mixed, default: {} })
  sourceEventSnapshot: LeadCustomFields;

  @Prop({ type: String, enum: LEAD_IDENTITY_CONFLICT_STATUSES, required: true, default: 'unresolved' })
  status: LeadIdentityConflictStatus;

  @Prop()
  resolvedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const LeadIdentityConflictSchema = SchemaFactory.createForClass(LeadIdentityConflict);
LeadIdentityConflictSchema.index({ organizationId: 1, productId: 1, status: 1, createdAt: -1 });
