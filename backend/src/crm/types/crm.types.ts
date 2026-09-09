export type CrmStageCategory = 'open' | 'won' | 'lost';
export const CRM_STAGE_CATEGORIES: CrmStageCategory[] = ['open', 'won', 'lost'];

export type CrmOpportunityStatus = 'open' | 'won' | 'lost' | 'archived';
export const CRM_OPPORTUNITY_STATUSES: CrmOpportunityStatus[] = ['open', 'won', 'lost', 'archived'];

export type CrmAccountStatus = 'active' | 'inactive' | 'archived';
export const CRM_ACCOUNT_STATUSES: CrmAccountStatus[] = ['active', 'inactive', 'archived'];

export type CrmProbabilitySource = 'stage' | 'manual';

export type CrmActivityType =
  | 'opportunity_created'
  | 'lead_converted'
  | 'stage_changed'
  | 'opportunity_updated'
  | 'won'
  | 'lost'
  | 'reopened'
  | 'note_added'
  | 'follow_up_created'
  | 'follow_up_updated'
  | 'follow_up_completed'
  | 'follow_up_cancelled'
  | 'call_logged'
  | 'meeting_logged'
  | 'other';
export const CRM_ACTIVITY_TYPES: CrmActivityType[] = ['opportunity_created', 'lead_converted', 'stage_changed', 'opportunity_updated', 'won', 'lost', 'reopened', 'note_added', 'follow_up_created', 'follow_up_updated', 'follow_up_completed', 'follow_up_cancelled', 'call_logged', 'meeting_logged', 'other'];

export type CrmFollowUpType = 'call' | 'meeting' | 'email' | 'demo' | 'proposal' | 'reminder' | 'other';
export const CRM_FOLLOW_UP_TYPES: CrmFollowUpType[] = ['call', 'meeting', 'email', 'demo', 'proposal', 'reminder', 'other'];

export type CrmFollowUpStatus = 'pending' | 'completed' | 'cancelled' | 'overdue';
export const CRM_FOLLOW_UP_STATUSES: CrmFollowUpStatus[] = ['pending', 'completed', 'cancelled', 'overdue'];

export type CrmMetadata = Record<string, string | number | boolean>;
