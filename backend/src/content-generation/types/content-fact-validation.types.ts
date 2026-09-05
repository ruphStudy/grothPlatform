import type { ContentVersionGroundingEvidenceSnapshot } from './content-grounding.types';

export type FactValidationClaimClassification = 'validated' | 'needs_review' | 'invalid' | 'non_factual';

export type ContentFactValidationStatus = 'validated' | 'needs_review' | 'failed_validation';

export type FactValidationClaimSeverity = 'low' | 'medium' | 'high';

export type FactValidationClaimFactType =
  | 'product_fact'
  | 'capability'
  | 'number'
  | 'pricing'
  | 'comparison'
  | 'proof'
  | 'customer_result'
  | 'integration'
  | 'certification'
  | 'guarantee'
  | 'market_claim'
  | 'other';

export interface FactValidationClaim {
  id: string;
  text: string;
  classification: FactValidationClaimClassification;
  factType: FactValidationClaimFactType;
  evidenceRefs: string[];
  reason: string;
  severity: FactValidationClaimSeverity;
}

export interface ContentFactValidationResultResponse {
  contentVersionId: string;
  artifactId: string;
  organizationId: string;
  productId: string;
  campaignId: string;
  status: ContentFactValidationStatus;
  score: number;
  claims: FactValidationClaim[];
  validatedClaimCount: number;
  reviewClaimCount: number;
  failedClaimCount: number;
  warnings: string[];
  validatedAt: Date;
}

export interface ContentFactValidationSummary {
  status: ContentFactValidationStatus;
  score: number;
  reviewClaimCount: number;
  failedClaimCount: number;
}

export interface ValidateContentVersionInput {
  contentVersionId: string;
  artifactId: string;
  organizationId: string;
  productId: string;
  campaignId: string;
  text: string;
  evidence?: ContentVersionGroundingEvidenceSnapshot;
}
