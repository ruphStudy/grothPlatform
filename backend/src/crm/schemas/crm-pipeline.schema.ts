import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CrmPipelineDocument = HydratedDocument<CrmPipeline>;

@Schema({ timestamps: true })
export class CrmPipeline {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  slug: string;

  @Prop()
  description?: string;

  @Prop({ required: true, default: false })
  isDefault: boolean;

  @Prop({ required: true, default: true })
  isActive: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CrmPipelineSchema = SchemaFactory.createForClass(CrmPipeline);
CrmPipelineSchema.index({ organizationId: 1, productId: 1, isDefault: 1 });
CrmPipelineSchema.index({ organizationId: 1, productId: 1, slug: 1 }, { unique: true });
