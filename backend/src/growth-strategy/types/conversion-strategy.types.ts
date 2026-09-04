export type ConversionActionType =
  | 'signup'
  | 'trial'
  | 'demo'
  | 'lead_capture'
  | 'purchase'
  | 'contact'
  | 'product_exploration'
  | 'activation'
  | 'generic_conversion';

export type ConversionFrictionType =
  | 'unclear_value'
  | 'weak_differentiation'
  | 'insufficient_proof'
  | 'pricing_uncertainty'
  | 'action_uncertainty'
  | 'buyer_risk'
  | 'implementation_uncertainty'
  | 'trust_gap'
  | 'onboarding_friction';

export interface ConversionAction {
  id: string;
  type: ConversionActionType;
  label: string;

  priorityScore: number;
  confidenceScore: number;

  funnelStage: string;

  targetAudienceSegmentIds: string[];
  relatedObjectiveIds: string[];
  relatedAcquisitionPathIds: string[];

  supportingSignalIds: string[];
  supportingKeywords: string[];

  reasons: string[];
  warnings: string[];
}

export interface ConversionFriction {
  id: string;
  type: ConversionFrictionType;
  title: string;
  hypothesis: string;

  severityScore: number;
  confidenceScore: number;

  funnelStage: string;
  audienceSegmentIds: string[];

  supportingSignalIds: string[];
  evidence: string[];

  recommendedResponses: string[];

  warnings: string[];
}

export interface ConversionProofNeed {
  id: string;
  title: string;
  type: string;

  priorityScore: number;
  confidenceScore: number;

  funnelStage: string;
  audienceSegmentIds: string[];

  evidenceSources: string[];
  recommendedProofDirection: string[];

  warnings: string[];
}

export interface ConversionPath {
  id: string;
  title: string;

  audienceSegmentIds: string[];
  acquisitionPathId?: string;

  entryStage: string;
  conversionStage: string;

  messageDirection: string[];
  proofNeeds: string[];
  frictionIds: string[];

  primaryActionId?: string;

  priorityScore: number;
  confidenceScore: number;

  reasons: string[];
}

export interface ConversionStrategyResult {
  actions: ConversionAction[];
  frictions: ConversionFriction[];
  proofNeeds: ConversionProofNeed[];
  paths: ConversionPath[];

  primaryActionId?: string;
  primaryPathId?: string;

  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];

  generatedAt: Date;
}
