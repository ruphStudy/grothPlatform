import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { CRM_ACTIVITY_TYPES } from '../types/crm.types';
import type { CrmActivityType, CrmMetadata } from '../types/crm.types';

export type CrmActivityDocument = HydratedDocument<CrmActivity>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class CrmActivity {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  opportunityId: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  leadId?: Types.ObjectId;

  @Prop({ type: String, enum: CRM_ACTIVITY_TYPES, required: true })
  type: CrmActivityType;

  @Prop({ type: Types.ObjectId })
  fromStageId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  toStageId?: Types.ObjectId;

  @Prop()
  note?: string;

  @Prop({ type: Map, of: MongooseSchema.Types.Mixed, default: {} })
  metadata: CrmMetadata;

  @Prop({ type: Types.ObjectId })
  actorUserId?: Types.ObjectId;

  createdAt?: Date;
}

export const CrmActivitySchema = SchemaFactory.createForClass(CrmActivity);
CrmActivitySchema.index({ organizationId: 1, productId: 1, opportunityId: 1, createdAt: -1 });
CrmActivitySchema.index({ organizationId: 1, productId: 1, leadId: 1, createdAt: -1 });
