import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OrganizationDocument = HydratedDocument<Organization>;

@Schema({ timestamps: true })
export class Organization {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  slug: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  ownerUserId: Types.ObjectId;

  @Prop({ required: true, enum: ['active', 'inactive'], default: 'active' })
  status: 'active' | 'inactive';
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);
