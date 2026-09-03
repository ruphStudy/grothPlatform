export type AudienceSegmentType = 'individual' | 'team' | 'business' | 'institution' | 'marketplace_side';

export interface AudienceSegment {
  id: string;
  name: string;
  segmentType: AudienceSegmentType;

  roles: string[];
  userTypes: string[];
  companyTypes: string[];
  companySizes: string[];
  industries: string[];

  useCases: string[];
  lifecycleStages: string[];

  buyerSignals: string[];
  businessModelSignals: string[];

  confidenceScore: number;

  evidence: string[];

  sourceSignals: string[];

  warnings: string[];
}

export interface AudienceSegmentResult {
  segments: AudienceSegment[];

  primarySegmentId?: string;

  confidenceScore: number;

  ungroupedSignals: string[];

  warnings: string[];

  generatedAt: Date;
}
