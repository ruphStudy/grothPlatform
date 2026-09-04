export interface MessagingPillar {
  id: string;
  title: string;
  theme: string;

  priorityScore: number;
  confidenceScore: number;

  targetAudienceSegmentIds: string[];
  relatedObjectiveIds: string[];
  relatedFunnelStages: string[];

  supportingSignalIds: string[];
  supportingKeywords: string[];

  reasons: string[];
  warnings: string[];
}

export interface AudienceMessage {
  audienceSegmentId: string;

  primaryNeed: string;
  valueMessage: string;
  proofFocus: string[];
  objectionFocus: string[];

  confidenceScore: number;
  supportingSignalIds: string[];
}

export interface FunnelMessage {
  stage: string;

  messageGoal: string;
  messageThemes: string[];
  proofFocus: string[];
  ctaDirection: string[];

  confidenceScore: number;
}

export interface MessagingStrategyResult {
  pillars: MessagingPillar[];
  audienceMessages: AudienceMessage[];
  funnelMessages: FunnelMessage[];

  primaryPillarId?: string;

  toneGuidance: string[];
  avoidClaims: string[];

  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];

  generatedAt: Date;
}
