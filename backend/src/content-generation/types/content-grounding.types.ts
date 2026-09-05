export type GroundingClaimClassification = 'supported' | 'unsupported' | 'uncertain' | 'non_factual';

export type ContentGroundingStatus = 'grounded' | 'partially_grounded' | 'insufficient_evidence';

export interface GroundingClaim {
  id: string;
  text: string;
  classification: GroundingClaimClassification;
  evidenceRefs: string[];
  reason: string;
}

// Denormalized evidence boundary captured at generation time, persisted on
// the ContentVersion so grounding (and re-grounding) never needs to rebuild
// Growth Strategy / campaign planning to re-derive it. Only genuine upstream
// evidence — never confidence/priority scores, proof "needs", or another
// version's own generated text.
export interface ContentVersionGroundingEvidenceSnapshot {
  productName?: string;
  productCategory?: string;
  productDescription?: string;
  valueProposition?: string;
  capabilities: string[];
  useCases: string[];
  differentiators: string[];
  pains: string[];
  goals: string[];
  objections: string[];
  proofPoints: string[];
  facts: string[];
  campaignGoal?: string;
  funnelStage?: string;
  suggestedCTA?: string;
  keywords: string[];
  topic?: string;
  pillar?: string;
}

export interface ContentGroundingResultResponse {
  contentVersionId: string;
  artifactId: string;
  organizationId: string;
  productId: string;
  campaignId: string;
  status: ContentGroundingStatus;
  score: number;
  claims: GroundingClaim[];
  supportedClaimCount: number;
  unsupportedClaimCount: number;
  uncertainClaimCount: number;
  warnings: string[];
  checkedAt: Date;
}

export interface ContentGroundingSummary {
  status: ContentGroundingStatus;
  score: number;
  unsupportedClaimCount: number;
  uncertainClaimCount: number;
}

export interface AnalyzeContentVersionInput {
  contentVersionId: string;
  artifactId: string;
  organizationId: string;
  productId: string;
  campaignId: string;
  text: string;
  evidence?: ContentVersionGroundingEvidenceSnapshot;
}
