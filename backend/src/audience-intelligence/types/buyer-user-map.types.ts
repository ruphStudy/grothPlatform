export type AudienceCommercialRole =
  | 'end_user'
  | 'primary_user'
  | 'buyer'
  | 'economic_buyer'
  | 'decision_maker'
  | 'influencer'
  | 'administrator'
  | 'beneficiary';

export type BuyerUserRelationshipType =
  | 'buys_for'
  | 'administers_for'
  | 'decides_for'
  | 'influences'
  | 'uses_with'
  | 'benefits_from';

export interface BuyerUserEntity {
  segmentId: string;
  segmentName: string;

  roles: string[];

  commercialRoles: AudienceCommercialRole[];

  confidenceScore: number;

  evidence: string[];

  reasons: string[];

  warnings: string[];
}

export interface BuyerUserRelationship {
  fromSegmentId: string;
  toSegmentId: string;

  relationship: BuyerUserRelationshipType;

  confidenceScore: number;

  reasons: string[];
}

export interface BuyerUserMapResult {
  entities: BuyerUserEntity[];

  relationships: BuyerUserRelationship[];

  endUserSegmentIds: string[];

  buyerSegmentIds: string[];

  decisionMakerSegmentIds: string[];

  administratorSegmentIds: string[];

  primaryBuyerSegmentId?: string;

  primaryUserSegmentId?: string;

  confidenceScore: number;

  missingEvidence: string[];

  warnings: string[];

  generatedAt: Date;
}
