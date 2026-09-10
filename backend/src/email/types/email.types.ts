export type EmailPlatform = 'resend';
export const EMAIL_PLATFORMS: EmailPlatform[] = ['resend'];

export type EmailConnectionStatus = 'active' | 'invalid' | 'disabled' | 'error';
export const EMAIL_CONNECTION_STATUSES: EmailConnectionStatus[] = ['active', 'invalid', 'disabled', 'error'];

export type EmailSenderType = 'email' | 'domain';
export const EMAIL_SENDER_TYPES: EmailSenderType[] = ['email', 'domain'];

export type EmailSenderStatus = 'pending' | 'verified' | 'failed' | 'disabled';
export const EMAIL_SENDER_STATUSES: EmailSenderStatus[] = ['pending', 'verified', 'failed', 'disabled'];

export type EmailMessageStatus = 'pending' | 'sending' | 'accepted' | 'failed';
export const EMAIL_MESSAGE_STATUSES: EmailMessageStatus[] = ['pending', 'sending', 'accepted', 'failed'];

export type EmailBodyType = 'html' | 'text' | 'both';
export const EMAIL_BODY_TYPES: EmailBodyType[] = ['html', 'text', 'both'];

export type EmailSendReason = 'manual' | 'crm_follow_up' | 'future_campaign' | 'future_sequence';
export const EMAIL_SEND_REASONS: EmailSendReason[] = ['manual', 'crm_follow_up', 'future_campaign', 'future_sequence'];

export type EmailPurpose = 'manual_crm' | 'marketing';
export const EMAIL_PURPOSES: EmailPurpose[] = ['manual_crm', 'marketing'];

export type EmailTemplateType = 'marketing' | 'crm' | 'newsletter' | 'announcement' | 'follow_up' | 'generic';
export const EMAIL_TEMPLATE_TYPES: EmailTemplateType[] = ['marketing', 'crm', 'newsletter', 'announcement', 'follow_up', 'generic'];

export type EmailTemplateStatus = 'draft' | 'active' | 'archived';
export const EMAIL_TEMPLATE_STATUSES: EmailTemplateStatus[] = ['draft', 'active', 'archived'];

export type EmailCampaignStatus = 'draft' | 'ready' | 'sending' | 'completed' | 'partially_failed' | 'cancelled';
export const EMAIL_CAMPAIGN_STATUSES: EmailCampaignStatus[] = ['draft', 'ready', 'sending', 'completed', 'partially_failed', 'cancelled'];

export type EmailCampaignRecipientStatus = 'pending' | 'sending' | 'accepted' | 'failed' | 'skipped';
export const EMAIL_CAMPAIGN_RECIPIENT_STATUSES: EmailCampaignRecipientStatus[] = ['pending', 'sending', 'accepted', 'failed', 'skipped'];

export type EmailSkipReason = 'no_email' | 'communication_restricted' | 'communication_unknown' | 'suppressed' | 'unsubscribed' | 'archived' | 'identity_conflict' | 'invalid_email' | 'missing_variable' | 'other';
export const EMAIL_SKIP_REASONS: EmailSkipReason[] = ['no_email', 'communication_restricted', 'communication_unknown', 'suppressed', 'unsubscribed', 'archived', 'identity_conflict', 'invalid_email', 'missing_variable', 'other'];

export type EmailSuppressionReason = 'manual' | 'unsubscribed' | 'bounced' | 'complained' | 'invalid';
export const EMAIL_SUPPRESSION_REASONS: EmailSuppressionReason[] = ['manual', 'unsubscribed', 'bounced', 'complained', 'invalid'];

export interface EmailAudienceDefinition {
  statuses?: string[];
  qualificationStatuses?: string[];
  grades?: string[];
  campaignIds?: string[];
  sourceTypes?: string[];
  consentStatuses?: string[];
  communicationEligibility?: string[];
  leadIds?: string[];
}

export interface EmailProviderCapabilities {
  sendEmail: boolean;
  sendHtml: boolean;
  sendText: boolean;
  customFrom: boolean;
  customReplyTo: boolean;
  domainVerification: boolean;
  fetchDeliveryStatus: boolean;
  webhookEvents: boolean;
  attachments: boolean;
  batchSend: boolean;
}

export interface EmailCredential {
  apiKey: string;
}

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface EmailSendRequest {
  from: EmailAddress;
  to: EmailAddress[];
  replyTo?: string;
  subject: string;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
  metadata?: Record<string, string>;
}

export interface EmailSendResult {
  providerMessageId: string;
  status: 'accepted' | 'sent';
  providerName: string;
  acceptedAt: Date;
}

export interface EmailConnectionValidationResult {
  status: 'active' | 'invalid' | 'error';
  providerName: string;
  errorCode?: string;
}

export interface EmailDnsRecord {
  type: 'TXT' | 'CNAME' | 'MX';
  name: string;
  value: string;
  priority?: number;
}

export interface EmailSenderStatusResult {
  status: 'pending' | 'verified' | 'failed' | 'unknown';
  providerSenderId?: string;
  providerDomainId?: string;
  verificationDetails?: { dnsRecords?: EmailDnsRecord[]; message?: string };
}
