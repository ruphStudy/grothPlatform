export type CrmStageCategory = 'open' | 'won' | 'lost';
export const CRM_STAGE_CATEGORIES: CrmStageCategory[] = ['open', 'won', 'lost'];

export type CrmOpportunityStatus = 'open' | 'won' | 'lost' | 'archived';
export const CRM_OPPORTUNITY_STATUSES: CrmOpportunityStatus[] = ['open', 'won', 'lost', 'archived'];

export type CrmProbabilitySource = 'stage' | 'manual';

export type CrmActivityType =
  | 'opportunity_created'
  | 'lead_converted'
  | 'stage_changed'
  | 'opportunity_updated'
  | 'won'
  | 'lost'
  | 'reopened'
  | 'note_added';
export const CRM_ACTIVITY_TYPES: CrmActivityType[] = ['opportunity_created', 'lead_converted', 'stage_changed', 'opportunity_updated', 'won', 'lost', 'reopened', 'note_added'];

export type CrmMetadata = Record<string, string | number | boolean>;
