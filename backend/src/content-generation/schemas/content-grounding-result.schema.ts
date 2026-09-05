import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { ContentGroundingStatus, GroundingClaimClassification } from '../types/content-grounding.types';

export const GROUNDING_CLAIM_CLASSIFICATIONS: GroundingClaimClassification[] = ['supported', 'unsupported', 'uncertain', 'non_factual'];
export const CONTENT_GROUNDING_STATUSES: ContentGroundingStatus[] = ['grounded', 'partially_grounded', 'insufficient_evidence'];

export type ContentGroundingResultDocument = HydratedDocument<ContentGroundingResult>;

@Schema({ _id: false })
export class GroundingClaimRecord {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  text: string;

  @Prop({ type: String, enum: GROUNDING_CLAIM_CLASSIFICATIONS, required: true })
  classification: GroundingClaimClassification;

  @Prop({ type: [String], default: [] })
  evidenceRefs: string[];

  @Prop({ required: true })
  reason: string;
}
export const GroundingClaimRecordSchema = SchemaFactory.createForClass(GroundingClaimRecord);

// One current grounding result per ContentVersion. Re-running grounding
// recomputes/replaces this document rather than versioning it.
@Schema({ timestamps: { createdAt: false, updatedAt: false } })
export class ContentGroundingResult {
  @Prop({ type: Types.ObjectId, ref: 'ContentVersion', required: true, unique: true })
  contentVersionId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ContentArtifact', required: true })
  artifactId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Campaign', required: true })
  campaignId: Types.ObjectId;

  @Prop({ type: String, enum: CONTENT_GROUNDING_STATUSES, required: true })
  status: ContentGroundingStatus;

  @Prop({ required: true, min: 0, max: 100 })
  score: number;

  @Prop({ type: [GroundingClaimRecordSchema], default: [] })
  claims: GroundingClaimRecord[];

  @Prop({ required: true, default: 0 })
  supportedClaimCount: number;

  @Prop({ required: true, default: 0 })
  unsupportedClaimCount: number;

  @Prop({ required: true, default: 0 })
  uncertainClaimCount: number;

  @Prop({ type: [String], default: [] })
  warnings: string[];

  @Prop({ required: true })
  checkedAt: Date;
}

export const ContentGroundingResultSchema = SchemaFactory.createForClass(ContentGroundingResult);
