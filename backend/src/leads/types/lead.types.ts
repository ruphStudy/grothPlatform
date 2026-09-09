export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'unqualified' | 'converted' | 'archived';
export const LEAD_STATUSES: LeadStatus[] = ['new', 'contacted', 'qualified', 'unqualified', 'converted', 'archived'];

export type LeadSourceType = 'website_form' | 'landing_page' | 'manual' | 'social' | 'cms' | 'campaign' | 'api' | 'import' | 'other';
export const LEAD_SOURCE_TYPES: LeadSourceType[] = ['website_form', 'landing_page', 'manual', 'social', 'cms', 'campaign', 'api', 'import', 'other'];

export type LeadConsentStatus = 'unknown' | 'granted' | 'denied';
export const LEAD_CONSENT_STATUSES: LeadConsentStatus[] = ['unknown', 'granted', 'denied'];

export type LeadCaptureMethod = 'manual' | 'public_form' | 'api';
export const LEAD_CAPTURE_METHODS: LeadCaptureMethod[] = ['manual', 'public_form', 'api'];

export type LeadIdentityConflictStatus = 'unresolved' | 'resolved';
export const LEAD_IDENTITY_CONFLICT_STATUSES: LeadIdentityConflictStatus[] = ['unresolved', 'resolved'];

export type LeadCustomFieldValue = string | number | boolean;
export type LeadCustomFields = Record<string, LeadCustomFieldValue>;
