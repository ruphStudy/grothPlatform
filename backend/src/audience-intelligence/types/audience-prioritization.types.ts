export type AudiencePriorityTier = 'primary' | 'secondary' | 'experimental' | 'insufficient_evidence';

export interface AudiencePriority {
  segmentId: string;
  segmentName: string;

  priorityScore: number;
  confidenceScore: number;

  tier: AudiencePriorityTier;

  icpFitScore?: number;

  roleSummary: string[];
  useCases: string[];

  reasons: string[];

  strengths: string[];
  weaknesses: string[];

  evidence: string[];

  warnings: string[];
}

export interface AudiencePrioritizationResult {
  priorities: AudiencePriority[];

  primarySegmentId?: string;

  secondarySegmentIds: string[];

  experimentalSegmentIds: string[];

  confidenceScore: number;

  rationale: string[];

  missingEvidence: string[];

  warnings: string[];

  generatedAt: Date;
}
