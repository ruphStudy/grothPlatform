import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type BrandVisualProfileDocument = HydratedDocument<BrandVisualProfile>;

@Schema({ _id: false })
export class BrandColors {
  @Prop()
  primary?: string;

  @Prop()
  secondary?: string;

  @Prop()
  accent?: string;

  @Prop()
  background?: string;
}
export const BrandColorsSchema = SchemaFactory.createForClass(BrandColors);

@Schema({ _id: false })
export class BrandLogoUsage {
  @Prop({ required: true, default: false })
  enabled: boolean;

  @Prop({ type: Types.ObjectId, ref: 'BrandAsset' })
  preferredAssetId?: Types.ObjectId;
}
export const BrandLogoUsageSchema = SchemaFactory.createForClass(BrandLogoUsage);

// One per product. Genuine, explicitly-configured brand visual direction
// that 17C-17E creative generation may consult — absent fields mean
// "no data," never a fabricated default (see image-prompt-builder.service.ts).
@Schema({ timestamps: { createdAt: false, updatedAt: true } })
export class BrandVisualProfile {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: BrandColorsSchema })
  colors?: BrandColors;

  @Prop({ type: [String], default: [] })
  visualStyle: string[];

  @Prop({ type: [String], default: [] })
  avoidStyles: string[];

  @Prop({ type: [String], default: [] })
  preferredSubjects: string[];

  @Prop({ type: [String], default: [] })
  avoidSubjects: string[];

  @Prop({ type: BrandLogoUsageSchema })
  logoUsage?: BrandLogoUsage;

  updatedAt?: Date;
}
export const BrandVisualProfileSchema = SchemaFactory.createForClass(BrandVisualProfile);
BrandVisualProfileSchema.index({ organizationId: 1, productId: 1 }, { unique: true });
