import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type {
  ContentFactValidationStatus,
  FactValidationClaimClassification,
  FactValidationClaimFactType,
  FactValidationClaimSeverity,
} from '../types/content-fact-validation.types';

export const FACT_VALIDATION_CLAIM_CLASSIFICATIONS: FactValidationClaimClassification[] = ['validated', 'needs_review', 'invalid', 'non_factual'];
export const CONTENT_FACT_VALIDATION_STATUSES: ContentFactValidationStatus[] = ['validated', 'needs_review', 'failed_validation'];
export const FACT_VALIDATION_CLAIM_SEVERITIES: FactValidationClaimSeverity[] = ['low', 'medium', 'high'];
export const FACT_VALIDATION_CLAIM_FACT_TYPES: FactValidationClaimFactType[] = [
  'product_fact',
  'capability',
  'number',
  'pricing',
  'comparison',
  'proof',
  'customer_result',
  'integration',
  'certification',
  'guarantee',
  'market_claim',
  'other',
];

export type ContentFactValidationResultDocument = HydratedDocument<ContentFactValidationResult>;

@Schema({ _id: false })
export class FactValidationClaimRecord {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  text: string;

  @Prop({ type: String, enum: FACT_VALIDATION_CLAIM_CLASSIFICATIONS, required: true })
  classification: FactValidationClaimClassification;

  @Prop({ type: String, enum: FACT_VALIDATION_CLAIM_FACT_TYPES, required: true })
  factType: FactValidationClaimFactType;

  @Prop({ type: [String], default: [] })
  evidenceRefs: string[];

  @Prop({ required: true })
  reason: string;

  @Prop({ type: String, enum: FACT_VALIDATION_CLAIM_SEVERITIES, required: true })
  severity: FactValidationClaimSeverity;
}
export const FactValidationClaimRecordSchema = SchemaFactory.createForClass(FactValidationClaimRecord);

// One current fact-validation result per ContentVersion. Recheck
// recomputes/replaces this document — no separate validation history yet.
@Schema({ timestamps: { createdAt: false, updatedAt: false } })
export class ContentFactValidationResult {
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

  @Prop({ type: String, enum: CONTENT_FACT_VALIDATION_STATUSES, required: true })
  status: ContentFactValidationStatus;

  @Prop({ required: true, min: 0, max: 100 })
  score: number;

  @Prop({ type: [FactValidationClaimRecordSchema], default: [] })
  claims: FactValidationClaimRecord[];

  @Prop({ required: true, default: 0 })
  validatedClaimCount: number;

  @Prop({ required: true, default: 0 })
  reviewClaimCount: number;

  @Prop({ required: true, default: 0 })
  failedClaimCount: number;

  @Prop({ type: [String], default: [] })
  warnings: string[];

  @Prop({ required: true })
  validatedAt: Date;
}

export const ContentFactValidationResultSchema = SchemaFactory.createForClass(ContentFactValidationResult);
