import type { LeadCommunicationEligibility, LeadConsentStatus, LeadCustomFields, LeadQualificationGrade, LeadQualificationReasonDirection, LeadQualificationStatus, LeadSourceType } from './lead.types';

export interface CaptureLeadInput {
  organizationId: string;
  productId: string;
  campaignId?: string;
  contact: {
    firstName?: string;
    lastName?: string;
    fullName?: string;
    email?: string;
    phone?: string;
    companyName?: string;
    jobTitle?: string;
    country?: string;
    region?: string;
    city?: string;
  };
  source: {
    type: LeadSourceType;
    name?: string;
    channel?: string;
    platform?: string;
    sourceUrl?: string;
    landingPageUrl?: string;
    referrerUrl?: string;
    externalSourceId?: string;
  };
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
    term?: string;
    content?: string;
  };
  consent?: {
    status: LeadConsentStatus;
    capturedAt?: string;
    source?: string;
  };
  customFields?: Record<string, unknown>;
  notes?: string;
  captureMethod: 'manual' | 'public_form' | 'api';
}

export type LeadCaptureOutcome = 'created' | 'matched' | 'conflict';

export interface LeadListFilter {
  status?: string;
  campaignId?: string;
  sourceType?: string;
  search?: string;
  createdFrom?: string;
  createdTo?: string;
  latestCapturedFrom?: string;
  latestCapturedTo?: string;
  qualificationStatus?: string;
  grade?: string;
  communicationEligibility?: string;
  consentStatus?: string;
  hasEmail?: string;
  hasPhone?: string;
  limit?: number;
  page?: number;
  sort?: string;
  order?: string;
}

export interface LeadQualificationReasonResponse {
  ruleId: string;
  label: string;
  points: number;
  direction: LeadQualificationReasonDirection;
}

export interface LeadQualificationResponse {
  score: number;
  grade: LeadQualificationGrade;
  qualificationStatus: LeadQualificationStatus;
  reasons: LeadQualificationReasonResponse[];
  scoringVersion: string;
  communicationEligibility: LeadCommunicationEligibility;
  evaluatedAt: Date;
}

export interface LeadResponse {
  id: string;
  organizationId: string;
  productId: string;
  campaignId?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  jobTitle?: string;
  country?: string;
  region?: string;
  city?: string;
  status: string;
  sourceType: string;
  sourceName?: string;
  firstSourceEventId?: string;
  latestSourceEventId?: string;
  firstCapturedAt: Date;
  latestCapturedAt: Date;
  consentStatus: string;
  consentCapturedAt?: Date;
  consentSource?: string;
  customFields: LeadCustomFields;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  qualification?: LeadQualificationResponse;
}

export interface LeadSourceEventResponse {
  id: string;
  campaignId?: string;
  sourceType: string;
  sourceName?: string;
  channel?: string;
  platform?: string;
  sourceUrl?: string;
  landingPageUrl?: string;
  referrerUrl?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  externalSourceId?: string;
  captureMethod: string;
  submittedDataSnapshot: LeadCustomFields;
  occurredAt: Date;
  createdAt: Date;
}

export interface LeadDetailResponse extends LeadResponse {
  sourceEvents: LeadSourceEventResponse[];
}
