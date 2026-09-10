import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type EmailTemplateVersionDocument = HydratedDocument<EmailTemplateVersion>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class EmailTemplateVersion {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  templateId: Types.ObjectId;

  @Prop({ required: true })
  version: number;

  @Prop({ required: true })
  subjectTemplate: string;

  @Prop()
  htmlTemplate?: string;

  @Prop()
  textTemplate?: string;

  @Prop()
  previewText?: string;

  @Prop({ type: [String], default: [] })
  variables: string[];

  @Prop({ type: Types.ObjectId })
  createdByUserId?: Types.ObjectId;

  createdAt?: Date;
}

export const EmailTemplateVersionSchema = SchemaFactory.createForClass(EmailTemplateVersion);
EmailTemplateVersionSchema.index({ organizationId: 1, productId: 1, templateId: 1, version: 1 }, { unique: true });
