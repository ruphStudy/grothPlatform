export type AnalyticsEventType =
  | 'lead_created'
  | 'lead_capture'
  | 'lead_qualified'
  | 'opportunity_created'
  | 'opportunity_won'
  | 'opportunity_lost'
  | 'email_accepted'
  | 'email_delivered'
  | 'email_opened'
  | 'email_clicked'
  | 'email_bounced'
  | 'email_unsubscribed'
  | 'social_published'
  | 'cms_draft_created'
  | 'cms_published'
  | 'content_generated'
  | 'creative_generated'
  | 'web_page_view'
  | 'web_cta_click'
  | 'web_form_view'
  | 'web_form_submit'
  | 'web_custom_conversion';

export const ANALYTICS_EVENT_TYPES: AnalyticsEventType[] = [
  'lead_created',
  'lead_capture',
  'lead_qualified',
  'opportunity_created',
  'opportunity_won',
  'opportunity_lost',
  'email_accepted',
  'email_delivered',
  'email_opened',
  'email_clicked',
  'email_bounced',
  'email_unsubscribed',
  'social_published',
  'cms_draft_created',
  'cms_published',
  'content_generated',
  'creative_generated',
  'web_page_view',
  'web_cta_click',
  'web_form_view',
  'web_form_submit',
  'web_custom_conversion',
];

export type AnalyticsChannel = 'organic' | 'social' | 'email' | 'blog' | 'website' | 'crm' | 'direct' | 'import' | 'manual' | 'other' | 'linkedin' | 'x' | 'facebook' | 'instagram' | 'wordpress';
export const ANALYTICS_CHANNELS: AnalyticsChannel[] = ['organic', 'social', 'email', 'blog', 'website', 'crm', 'direct', 'import', 'manual', 'other', 'linkedin', 'x', 'facebook', 'instagram', 'wordpress'];

export type AnalyticsSourceType = 'lead' | 'lead_source_event' | 'lead_qualification' | 'email_message' | 'email_event' | 'social_publication' | 'cms_publication' | 'crm_opportunity' | 'content_version' | 'creative_asset' | 'web_analytics_event';
export const ANALYTICS_SOURCE_TYPES: AnalyticsSourceType[] = ['lead', 'lead_source_event', 'lead_qualification', 'email_message', 'email_event', 'social_publication', 'cms_publication', 'crm_opportunity', 'content_version', 'creative_asset', 'web_analytics_event'];

export type AnalyticsEntityType = AnalyticsSourceType;
export const ANALYTICS_ENTITY_TYPES = ANALYTICS_SOURCE_TYPES;

export type AnalyticsMetric =
  | 'leads_created'
  | 'lead_captures'
  | 'qualified_leads'
  | 'opportunities_created'
  | 'opportunities_won'
  | 'opportunities_lost'
  | 'emails_accepted'
  | 'emails_delivered'
  | 'emails_opened'
  | 'emails_clicked'
  | 'emails_bounced'
  | 'emails_unsubscribed'
  | 'social_posts_published'
  | 'cms_posts_published'
  | 'content_generated'
  | 'creative_generated'
  | 'web_page_views'
  | 'web_cta_clicks'
  | 'web_form_views'
  | 'web_form_submits'
  | 'web_custom_conversions';

export const ANALYTICS_METRIC_EVENT_MAP: Record<AnalyticsMetric, AnalyticsEventType> = {
  leads_created: 'lead_created',
  lead_captures: 'lead_capture',
  qualified_leads: 'lead_qualified',
  opportunities_created: 'opportunity_created',
  opportunities_won: 'opportunity_won',
  opportunities_lost: 'opportunity_lost',
  emails_accepted: 'email_accepted',
  emails_delivered: 'email_delivered',
  emails_opened: 'email_opened',
  emails_clicked: 'email_clicked',
  emails_bounced: 'email_bounced',
  emails_unsubscribed: 'email_unsubscribed',
  social_posts_published: 'social_published',
  cms_posts_published: 'cms_published',
  content_generated: 'content_generated',
  creative_generated: 'creative_generated',
  web_page_views: 'web_page_view',
  web_cta_clicks: 'web_cta_click',
  web_form_views: 'web_form_view',
  web_form_submits: 'web_form_submit',
  web_custom_conversions: 'web_custom_conversion',
};

export type WebAnalyticsEventType = 'page_view' | 'cta_click' | 'form_view' | 'form_submit' | 'custom_conversion';
export const WEB_ANALYTICS_EVENT_TYPES: WebAnalyticsEventType[] = ['page_view', 'cta_click', 'form_view', 'form_submit', 'custom_conversion'];

export type AnalyticsReportType = 'dashboard' | 'funnel' | 'content' | 'campaign_comparison' | 'website';
export const ANALYTICS_REPORT_TYPES: AnalyticsReportType[] = ['dashboard', 'funnel', 'content', 'campaign_comparison', 'website'];

export type AnalyticsBucket = 'day' | 'week' | 'month';
export const ANALYTICS_BUCKETS: AnalyticsBucket[] = ['day', 'week', 'month'];
