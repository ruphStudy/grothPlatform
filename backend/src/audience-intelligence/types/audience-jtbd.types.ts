export type AudienceJobType = 'functional' | 'outcome' | 'administrative' | 'decision' | 'learning' | 'coordination';

export interface AudienceJob {
  id: string;

  segmentId: string;
  segmentName: string;

  type: AudienceJobType;

  situation: string;
  motivation: string;
  desiredOutcome: string;

  statement: string;

  priorityScore: number;
  confidenceScore: number;

  relatedUseCases: string[];
  relatedPainPointIds: string[];
  relatedCommercialRoles: string[];

  evidence: string[];
  reasons: string[];

  caution: string;
}

export interface AudienceJtbdResult {
  jobs: AudienceJob[];

  bySegment: { segmentId: string; jobIds: string[] }[];

  primaryJobIdBySegment: Record<string, string>;

  strongestJobIds: string[];

  confidenceScore: number;

  missingEvidence: string[];
  warnings: string[];

  generatedAt: Date;
}
