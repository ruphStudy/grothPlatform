import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserOnboardingStateDocument = HydratedDocument<UserOnboardingState>;

@Schema({ timestamps: true })
export class UserOnboardingState {
  @Prop({ type: Types.ObjectId, required: true, unique: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, default: 'welcome' })
  currentStep: string;

  @Prop({ type: [String], default: [] })
  completedSteps: string[];

  @Prop()
  selectedPlanKey?: string;

  @Prop({ default: 'monthly' })
  selectedBillingInterval?: 'monthly' | 'yearly';

  @Prop({ type: Types.ObjectId })
  organizationId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  productId?: Types.ObjectId;

  @Prop()
  growthGoal?: string;

  @Prop()
  completedAt?: Date;

  @Prop()
  tourStartedAt?: Date;

  @Prop()
  tourCompletedAt?: Date;

  @Prop()
  tourSkippedAt?: Date;

  @Prop()
  tourVersion?: string;
}

export const UserOnboardingStateSchema = SchemaFactory.createForClass(UserOnboardingState);
