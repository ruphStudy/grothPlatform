export type CampaignReviewStatus = 'draft' | 'approved' | 'changes_requested';

export type CampaignReviewSection = 'goal' | 'audience_channels' | 'plan' | 'calendar';

export type CampaignSectionReviewStatus = 'pending' | 'approved' | 'changes_requested';

export interface CampaignSectionReview {
  section: CampaignReviewSection;
  status: CampaignSectionReviewStatus;
  note?: string;
  reviewedAt?: Date;
}

export interface CampaignReview {
  status: CampaignReviewStatus;
  sectionReviews: CampaignSectionReview[];
  overallNote?: string;
  approvedAt?: Date;
  changesRequestedAt?: Date;
  reviewedPlanningVersion?: number;
  reviewedPlanGeneratedAt?: Date;
  updatedAt?: Date;
}

// Reserved for future publishing gates (Sprint 19+) — not enforced anywhere
// yet in this sprint.
export interface CampaignApprovalStatus {
  approved: boolean;
  stale: boolean;
  reason?: string;
}
