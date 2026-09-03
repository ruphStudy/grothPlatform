export type IcpFitLevel = 'strong' | 'moderate' | 'weak';

export interface IcpCandidate {
  id: string;
  name: string;

  segmentId: string;
  segmentName: string;

  fitScore: number;
  confidenceScore: number;
  fitLevel: IcpFitLevel;

  roles: string[];
  userTypes: string[];

  companyTypes: string[];
  companySizes: string[];

  industries: string[];

  useCases: string[];

  buyerSignals: string[];
  businessModelSignals: string[];

  reasons: string[];

  evidence: string[];

  missingEvidence: string[];

  warnings: string[];
}

export interface IcpResult {
  candidates: IcpCandidate[];

  primaryIcpId?: string;

  confidenceScore: number;

  missingEvidence: string[];

  warnings: string[];

  generatedAt: Date;
}
