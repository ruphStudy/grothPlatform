import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { CRM_STAGE_CATEGORIES } from '../types/crm.types';
import type { CrmStageCategory } from '../types/crm.types';

export type CrmStageDocument = HydratedDocument<CrmStage>;

@Schema({ timestamps: true })
export class CrmStage {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  pipelineId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  key: string;

  @Prop({ required: true })
  order: number;

  @Prop({ type: String, enum: CRM_STAGE_CATEGORIES, required: true })
  category: CrmStageCategory;

  @Prop({ type: Number })
  probability?: number;

  @Prop({ required: true, default: true })
  isActive: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CrmStageSchema = SchemaFactory.createForClass(CrmStage);
CrmStageSchema.index({ organizationId: 1, productId: 1, pipelineId: 1, order: 1 }, { unique: true });
CrmStageSchema.index({ organizationId: 1, productId: 1, pipelineId: 1, key: 1 }, { unique: true });
