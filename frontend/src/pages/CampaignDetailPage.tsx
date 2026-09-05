import { type FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { Card } from '../components/Card';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import type {
  Campaign,
  CampaignActivity,
  CampaignAudienceChannelMapping,
  CampaignGoalType,
  CampaignReviewSection,
  CampaignSectionReviewStatus,
  CampaignStatus,
  CampaignType,
  ContentIdeaResult,
  BlogCalendarResult,
  SocialCalendarResult,
  VideoCalendarResult,
  CampaignContentPillarTier,
  ContentPillarPlanResult,
  ContentTopicTier,
  TopicPrioritizationResult,
  RepurposingPlanResult,
  BlogDraftResult,
  BlogGenerationOptions,
  LinkedInDraftResult,
  LinkedInGenerationOptions,
  SocialCalendarItem,
} from '../types';

const CAMPAIGN_STATUSES: CampaignStatus[] = ['draft', 'planned', 'approved', 'active', 'paused', 'completed', 'archived'];
const CAMPAIGN_TYPES: CampaignType[] = [
  'awareness',
  'education',
  'consideration',
  'lead_generation',
  'conversion',
  'activation',
  'retention',
  'product_launch',
  'promotion',
  'evergreen',
  'custom',
];
const CAMPAIGN_GOAL_TYPES: CampaignGoalType[] = [
  'awareness',
  'education',
  'consideration',
  'lead_generation',
  'conversion',
  'activation',
  'retention',
  'positioning',
  'differentiation',
  'buyer_enablement',
  'product_launch',
  'custom',
];
const CAMPAIGN_REVIEW_SECTION_LIST: { key: CampaignReviewSection; label: string }[] = [
  { key: 'goal', label: 'Goal' },
  { key: 'audience_channels', label: 'Audience & Channels' },
  { key: 'plan', label: 'Plan' },
  { key: 'calendar', label: 'Calendar' },
];
const CAMPAIGN_SECTION_REVIEW_STATUSES: CampaignSectionReviewStatus[] = ['pending', 'approved', 'changes_requested'];

function labelize(value: string): string {
  return value
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function statusQualityClass(status: CampaignStatus): string {
  if (status === 'approved' || status === 'active' || status === 'completed') return 'quality-good';
  if (status === 'planned' || status === 'paused') return 'quality-limited';
  return 'quality-unavailable';
}

function scoreQuality(score: number): 'high' | 'medium' | 'low' {
  if (score >= 80) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

function qualityBadgeClass(quality: 'high' | 'medium' | 'low'): string {
  if (quality === 'high') return 'quality-good';
  if (quality === 'medium') return 'quality-limited';
  return 'quality-empty';
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items));
}

function actualDateForDay(startDate: string | undefined, day: number): string | null {
  if (!startDate) return null;
  const d = new Date(startDate);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + (day - 1));
  return d.toLocaleDateString();
}

function audienceLabel(mapping: CampaignAudienceChannelMapping | undefined, id: string): string {
  return mapping?.audiences.find((a) => a.audienceSegmentId === id)?.label ?? id;
}

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function ActivityCard({ activity, mapping, allActivities }: { activity: CampaignActivity; mapping: CampaignAudienceChannelMapping | undefined; allActivities: CampaignActivity[] }) {
  const dependencyTitles = activity.dependencies.map((depId) => allActivities.find((a) => a.id === depId)?.title ?? depId);
  return (
    <div className="activity-card">
      <div className="activity-card-title">{activity.title}</div>
      <div className="tag-list">
        <span className="tag">{labelize(activity.type)}</span>
        <span className="tag">{labelize(activity.channel)}</span>
        <span className="tag">{labelize(activity.funnelStage)}</span>
        <span className={`quality-badge ${qualityBadgeClass(scoreQuality(activity.priorityScore))}`}>Priority {activity.priorityScore}</span>
        <span className={`quality-badge ${statusQualityClass(activity.status as CampaignStatus)}`}>{labelize(activity.status)}</span>
      </div>
      {activity.audienceSegmentIds.length > 0 && (
        <div className="entity-card-meta">Audience: {activity.audienceSegmentIds.map((id) => audienceLabel(mapping, id)).join(', ')}</div>
      )}
      <details style={{ marginTop: 6 }}>
        <summary className="summary-label" style={{ cursor: 'pointer' }}>
          Details
        </summary>
        <div style={{ marginTop: 8 }}>
          <span className="summary-label">Objective</span>
          <p>{activity.objective}</p>

          {activity.recommendedActions.length > 0 && (
            <>
              <span className="summary-label">Recommended Actions</span>
              <ul className="bullet-list">
                {activity.recommendedActions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </>
          )}

          {activity.keywordDirections.length > 0 && (
            <>
              <span className="summary-label">Keyword Directions</span>
              <div className="tag-list">
                {activity.keywordDirections.map((k, i) => (
                  <span className="tag" key={i}>
                    {k}
                  </span>
                ))}
              </div>
            </>
          )}

          {activity.contentFormat && (
            <>
              <span className="summary-label">Content Format</span>
              <p>{labelize(activity.contentFormat)}</p>
            </>
          )}

          {activity.conversionDirection && (
            <>
              <span className="summary-label">Conversion Direction</span>
              <p>{labelize(activity.conversionDirection)}</p>
            </>
          )}

          {(activity.messagingPillarIds.length > 0 || activity.contentPillarIds.length > 0) && (
            <>
              <span className="summary-label">Related Pillars</span>
              <p className="entity-card-meta">
                {[...activity.messagingPillarIds, ...activity.contentPillarIds].join(', ') || '-'}
              </p>
            </>
          )}

          {dependencyTitles.length > 0 && (
            <>
              <span className="summary-label">Depends On</span>
              <ul className="bullet-list">
                {dependencyTitles.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </>
          )}

          {activity.successSignals.length > 0 && (
            <>
              <span className="summary-label">Success Signals</span>
              <div className="tag-list">
                {activity.successSignals.map((s, i) => (
                  <span className="tag" key={i}>
                    {s}
                  </span>
                ))}
              </div>
            </>
          )}

          {activity.reasons.length > 0 && (
            <>
              <span className="summary-label">Reasons</span>
              <ul className="bullet-list">
                {activity.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </>
          )}

          {activity.warnings.length > 0 && (
            <div className="content-warning" style={{ marginTop: 8 }}>
              {activity.warnings.join(' ')}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

export default function CampaignDetailPage() {
  const { organizationId, productId, campaignId } = useParams<{ organizationId: string; productId: string; campaignId: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editingOverview, setEditingOverview] = useState(false);
  const [overviewForm, setOverviewForm] = useState({ name: '', description: '', type: '', status: '', startDate: '', endDate: '' });
  const [savingOverview, setSavingOverview] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const [goalBusy, setGoalBusy] = useState<'deriving' | 'saving' | null>(null);
  const [goalError, setGoalError] = useState<string | null>(null);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalForm, setGoalForm] = useState({ type: 'awareness', title: '', description: '', successSignals: '' });

  const [mappingBusy, setMappingBusy] = useState<'deriving' | 'saving' | null>(null);
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [showMappingForm, setShowMappingForm] = useState(false);
  const [mappingForm, setMappingForm] = useState({ audienceSegmentIds: '', channelIds: '', primaryAudienceSegmentId: '', primaryChannel: '' });

  const [planBusy, setPlanBusy] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [calendarView, setCalendarView] = useState<'calendar' | 'list'>('calendar');

  const [reviewBusy, setReviewBusy] = useState<'saving' | 'approving' | 'requesting' | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSavedMessage, setReviewSavedMessage] = useState<string | null>(null);
  const [sectionDrafts, setSectionDrafts] = useState<Record<CampaignReviewSection, { status: CampaignSectionReviewStatus; note: string }>>(
    () => Object.fromEntries(CAMPAIGN_REVIEW_SECTION_LIST.map((s) => [s.key, { status: 'pending', note: '' }])) as Record<CampaignReviewSection, { status: CampaignSectionReviewStatus; note: string }>,
  );
  const [overallNoteDraft, setOverallNoteDraft] = useState('');

  const [contentIdeas, setContentIdeas] = useState<ContentIdeaResult | null>(null);
  const [contentIdeasBusy, setContentIdeasBusy] = useState(false);
  const [contentIdeasError, setContentIdeasError] = useState<string | null>(null);
  const [ideaChannelFilter, setIdeaChannelFilter] = useState('');
  const [ideaFunnelStageFilter, setIdeaFunnelStageFilter] = useState('');
  const [ideaTypeFilter, setIdeaTypeFilter] = useState('');
  const [showAllIdeas, setShowAllIdeas] = useState(false);

  const [topics, setTopics] = useState<TopicPrioritizationResult | null>(null);
  const [topicsBusy, setTopicsBusy] = useState(false);
  const [topicsError, setTopicsError] = useState<string | null>(null);
  const [topicTierFilter, setTopicTierFilter] = useState('');
  const [topicChannelFilter, setTopicChannelFilter] = useState('');
  const [topicFunnelStageFilter, setTopicFunnelStageFilter] = useState('');

  const [pillarPlan, setPillarPlan] = useState<ContentPillarPlanResult | null>(null);
  const [pillarPlanBusy, setPillarPlanBusy] = useState(false);
  const [pillarPlanError, setPillarPlanError] = useState<string | null>(null);

  const [blogCalendar, setBlogCalendar] = useState<BlogCalendarResult | null>(null);
  const [blogCalendarBusy, setBlogCalendarBusy] = useState(false);
  const [blogCalendarError, setBlogCalendarError] = useState<string | null>(null);
  const [blogDrafts, setBlogDrafts] = useState<Record<string, BlogDraftResult>>({});
  const [blogDraftBusyIds, setBlogDraftBusyIds] = useState<Record<string, boolean>>({});
  const [blogDraftErrors, setBlogDraftErrors] = useState<Record<string, string | null>>({});

  const [socialCalendar, setSocialCalendar] = useState<SocialCalendarResult | null>(null);
  const [socialCalendarBusy, setSocialCalendarBusy] = useState(false);
  const [socialCalendarError, setSocialCalendarError] = useState<string | null>(null);
  const [socialPlatformFilter, setSocialPlatformFilter] = useState('');
  const [socialTypeFilter, setSocialTypeFilter] = useState('');
  const [socialFunnelStageFilter, setSocialFunnelStageFilter] = useState('');
  const [linkedInDrafts, setLinkedInDrafts] = useState<Record<string, LinkedInDraftResult>>({});
  const [linkedInBusyIds, setLinkedInBusyIds] = useState<Record<string, boolean>>({});
  const [linkedInErrors, setLinkedInErrors] = useState<Record<string, string | null>>({});
  const [linkedInOptionsById, setLinkedInOptionsById] = useState<Record<string, LinkedInGenerationOptions>>({});

  const [videoCalendar, setVideoCalendar] = useState<VideoCalendarResult | null>(null);
  const [videoCalendarBusy, setVideoCalendarBusy] = useState(false);
  const [videoCalendarError, setVideoCalendarError] = useState<string | null>(null);
  const [videoTypeFilter, setVideoTypeFilter] = useState('');
  const [videoFormatFilter, setVideoFormatFilter] = useState('');
  const [videoFunnelStageFilter, setVideoFunnelStageFilter] = useState('');

  const [repurposingPlan, setRepurposingPlan] = useState<RepurposingPlanResult | null>(null);
  const [repurposingBusy, setRepurposingBusy] = useState(false);
  const [repurposingError, setRepurposingError] = useState<string | null>(null);
  const [repurposingSourceFilter, setRepurposingSourceFilter] = useState('');
  const [repurposingTargetFilter, setRepurposingTargetFilter] = useState('');
  const [repurposingFunnelStageFilter, setRepurposingFunnelStageFilter] = useState('');
  const [repurposingView, setRepurposingView] = useState<'chains' | 'items'>('chains');

  const basePath = `/organizations/${organizationId}/products/${productId}/campaigns/${campaignId}`;

  async function loadData() {
    if (!organizationId || !productId || !campaignId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiRequest<Campaign>(basePath);
      setCampaign(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load campaign');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, productId, campaignId]);

  // Initialize the review draft from persisted state once per campaign load
  // (not on every subsequent update) so unrelated actions elsewhere on the
  // page never clobber an in-progress, unsaved review edit.
  useEffect(() => {
    if (!campaign) return;
    setSectionDrafts(
      Object.fromEntries(
        CAMPAIGN_REVIEW_SECTION_LIST.map((s) => {
          const existing = campaign.review.sectionReviews.find((sr) => sr.section === s.key);
          return [s.key, { status: existing?.status ?? 'pending', note: existing?.note ?? '' }];
        }),
      ) as Record<CampaignReviewSection, { status: CampaignSectionReviewStatus; note: string }>,
    );
    setOverallNoteDraft(campaign.review.overallNote ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.id]);

  function startEditOverview() {
    if (!campaign) return;
    setOverviewForm({
      name: campaign.name,
      description: campaign.description ?? '',
      type: campaign.type ?? '',
      status: campaign.status,
      startDate: campaign.startDate ? campaign.startDate.slice(0, 10) : '',
      endDate: campaign.endDate ? campaign.endDate.slice(0, 10) : '',
    });
    setOverviewError(null);
    setEditingOverview(true);
  }

  async function handleSaveOverview(e: FormEvent) {
    e.preventDefault();
    setSavingOverview(true);
    setOverviewError(null);
    try {
      const body: Record<string, unknown> = {
        name: overviewForm.name,
        description: overviewForm.description,
        type: overviewForm.type || undefined,
        status: overviewForm.status,
        startDate: overviewForm.startDate ? new Date(overviewForm.startDate).toISOString() : undefined,
        endDate: overviewForm.endDate ? new Date(overviewForm.endDate).toISOString() : undefined,
      };
      const updated = await apiRequest<Campaign>(basePath, { method: 'PATCH', body });
      setCampaign(updated);
      setEditingOverview(false);
    } catch (err) {
      setOverviewError(err instanceof ApiError ? err.message : 'Failed to update campaign');
    } finally {
      setSavingOverview(false);
    }
  }

  async function handleDeriveGoal() {
    setGoalBusy('deriving');
    setGoalError(null);
    try {
      const updated = await apiRequest<Campaign>(`${basePath}/goal/derive`, { method: 'POST', body: {} });
      setCampaign(updated);
      setShowGoalForm(false);
    } catch (err) {
      setGoalError(err instanceof ApiError ? err.message : 'Failed to derive campaign goal');
    } finally {
      setGoalBusy(null);
    }
  }

  function startEditGoal() {
    if (campaign?.goal) {
      setGoalForm({
        type: campaign.goal.type,
        title: campaign.goal.title,
        description: campaign.goal.description,
        successSignals: campaign.goal.successSignals.join(', '),
      });
    }
    setGoalError(null);
    setShowGoalForm(true);
  }

  async function handleSaveGoal(e: FormEvent) {
    e.preventDefault();
    setGoalBusy('saving');
    setGoalError(null);
    try {
      const body = {
        type: goalForm.type,
        title: goalForm.title,
        description: goalForm.description || undefined,
        successSignals: splitCsv(goalForm.successSignals),
      };
      const updated = await apiRequest<Campaign>(`${basePath}/goal`, { method: 'PATCH', body });
      setCampaign(updated);
      setShowGoalForm(false);
    } catch (err) {
      setGoalError(err instanceof ApiError ? err.message : 'Failed to save campaign goal');
    } finally {
      setGoalBusy(null);
    }
  }

  async function handleDeriveMapping() {
    setMappingBusy('deriving');
    setMappingError(null);
    try {
      const updated = await apiRequest<Campaign>(`${basePath}/audience-channel/derive`, { method: 'POST', body: {} });
      setCampaign(updated);
      setShowMappingForm(false);
    } catch (err) {
      setMappingError(err instanceof ApiError ? err.message : 'Failed to derive audience/channel mapping');
    } finally {
      setMappingBusy(null);
    }
  }

  function startEditMapping() {
    if (campaign?.audienceChannelMapping) {
      setMappingForm({
        audienceSegmentIds: campaign.audienceChannelMapping.audiences.map((a) => a.audienceSegmentId).join(', '),
        channelIds: campaign.audienceChannelMapping.channels.map((c) => c.channel).join(', '),
        primaryAudienceSegmentId: campaign.audienceChannelMapping.primaryAudienceSegmentId ?? '',
        primaryChannel: campaign.audienceChannelMapping.primaryChannel ?? '',
      });
    }
    setMappingError(null);
    setShowMappingForm(true);
  }

  async function handleSaveMapping(e: FormEvent) {
    e.preventDefault();
    setMappingBusy('saving');
    setMappingError(null);
    try {
      const body = {
        audienceSegmentIds: splitCsv(mappingForm.audienceSegmentIds),
        channelIds: splitCsv(mappingForm.channelIds),
        primaryAudienceSegmentId: mappingForm.primaryAudienceSegmentId || undefined,
        primaryChannel: mappingForm.primaryChannel || undefined,
      };
      const updated = await apiRequest<Campaign>(`${basePath}/audience-channel`, { method: 'PATCH', body });
      setCampaign(updated);
      setShowMappingForm(false);
    } catch (err) {
      setMappingError(err instanceof ApiError ? err.message : 'Failed to save audience/channel mapping');
    } finally {
      setMappingBusy(null);
    }
  }

  async function handleGeneratePlan() {
    setPlanBusy(true);
    setPlanError(null);
    try {
      const updated = await apiRequest<Campaign>(`${basePath}/plan/generate`, { method: 'POST', body: {} });
      setCampaign(updated);
      setConfirmRegenerate(false);
    } catch (err) {
      setPlanError(err instanceof ApiError ? err.message : 'Failed to generate campaign plan');
    } finally {
      setPlanBusy(false);
    }
  }

  async function handleSaveReview() {
    setReviewBusy('saving');
    setReviewError(null);
    setReviewSavedMessage(null);
    try {
      const body = {
        overallNote: overallNoteDraft || undefined,
        sectionReviews: CAMPAIGN_REVIEW_SECTION_LIST.map((s) => ({
          section: s.key,
          status: sectionDrafts[s.key].status,
          note: sectionDrafts[s.key].note || undefined,
        })),
      };
      const updated = await apiRequest<Campaign>(`${basePath}/review`, { method: 'PATCH', body });
      setCampaign(updated);
      setReviewSavedMessage('Review saved.');
    } catch (err) {
      setReviewError(err instanceof ApiError ? err.message : 'Failed to save review');
    } finally {
      setReviewBusy(null);
    }
  }

  async function handleApproveCampaign() {
    setReviewBusy('approving');
    setReviewError(null);
    setReviewSavedMessage(null);
    try {
      const updated = await apiRequest<Campaign>(`${basePath}/review/approve`, { method: 'POST', body: {} });
      setCampaign(updated);
    } catch (err) {
      setReviewError(err instanceof ApiError ? err.message : 'Failed to approve campaign');
    } finally {
      setReviewBusy(null);
    }
  }

  async function handleRequestChanges() {
    setReviewBusy('requesting');
    setReviewError(null);
    setReviewSavedMessage(null);
    try {
      const updated = await apiRequest<Campaign>(`${basePath}/review/request-changes`, { method: 'POST', body: { note: overallNoteDraft || undefined } });
      setCampaign(updated);
    } catch (err) {
      setReviewError(err instanceof ApiError ? err.message : 'Failed to request changes');
    } finally {
      setReviewBusy(null);
    }
  }

  async function handleGenerateContentIdeas() {
    setContentIdeasBusy(true);
    setContentIdeasError(null);
    try {
      const result = await apiRequest<ContentIdeaResult>(`${basePath}/content-planning/ideas-preview`, { method: 'POST', body: {} });
      setContentIdeas(result);
      setShowAllIdeas(false);
    } catch (err) {
      setContentIdeasError(err instanceof ApiError ? err.message : 'Failed to generate content ideas');
    } finally {
      setContentIdeasBusy(false);
    }
  }

  async function handlePrioritizeTopics() {
    setTopicsBusy(true);
    setTopicsError(null);
    try {
      const result = await apiRequest<TopicPrioritizationResult>(`${basePath}/content-planning/topics-preview`, { method: 'POST', body: {} });
      setTopics(result);
    } catch (err) {
      setTopicsError(err instanceof ApiError ? err.message : 'Failed to prioritize content topics');
    } finally {
      setTopicsBusy(false);
    }
  }

  async function handleBuildContentPillars() {
    setPillarPlanBusy(true);
    setPillarPlanError(null);
    try {
      const result = await apiRequest<ContentPillarPlanResult>(`${basePath}/content-planning/pillars-preview`, { method: 'POST', body: {} });
      setPillarPlan(result);
    } catch (err) {
      setPillarPlanError(err instanceof ApiError ? err.message : 'Failed to build content pillars');
    } finally {
      setPillarPlanBusy(false);
    }
  }

  async function handleBuildBlogCalendar() {
    setBlogCalendarBusy(true);
    setBlogCalendarError(null);
    try {
      const result = await apiRequest<BlogCalendarResult>(`${basePath}/content-planning/blog-calendar-preview`, { method: 'POST', body: {} });
      setBlogCalendar(result);
    } catch (err) {
      setBlogCalendarError(err instanceof ApiError ? err.message : 'Failed to build blog calendar');
    } finally {
      setBlogCalendarBusy(false);
    }
  }

  // One click = one paid AI call. Regeneration requires explicit confirmation.
  async function generateBlogDraft(blogCalendarItemId: string, options?: BlogGenerationOptions): Promise<BlogDraftResult> {
    return apiRequest<BlogDraftResult>(`${basePath}/content-generation/blog/${blogCalendarItemId}`, { method: 'POST', body: options ?? {} });
  }

  async function handleGenerateBlogDraft(blogCalendarItemId: string, isRegenerate: boolean) {
    if (isRegenerate) {
      const confirmed = window.confirm('Regenerating will make another AI request and may incur additional cost. Continue?');
      if (!confirmed) return;
    }
    setBlogDraftBusyIds((prev) => ({ ...prev, [blogCalendarItemId]: true }));
    setBlogDraftErrors((prev) => ({ ...prev, [blogCalendarItemId]: null }));
    try {
      const result = await generateBlogDraft(blogCalendarItemId);
      setBlogDrafts((prev) => ({ ...prev, [blogCalendarItemId]: result }));
    } catch (err) {
      setBlogDraftErrors((prev) => ({ ...prev, [blogCalendarItemId]: err instanceof ApiError ? err.message : 'Failed to generate blog draft' }));
    } finally {
      setBlogDraftBusyIds((prev) => ({ ...prev, [blogCalendarItemId]: false }));
    }
  }

  function handleCopyBlogDraft(content: string) {
    void navigator.clipboard.writeText(content);
  }

  function getLinkedInOptions(item: SocialCalendarItem): LinkedInGenerationOptions {
    return linkedInOptionsById[item.id] ?? { tone: 'professional', length: 'medium', includeCTA: !!item.suggestedCTA, includeHashtags: false, maxHashtags: 3 };
  }

  function updateLinkedInOptions(item: SocialCalendarItem, patch: Partial<LinkedInGenerationOptions>) {
    setLinkedInOptionsById((prev) => ({ ...prev, [item.id]: { ...getLinkedInOptions(item), ...patch } }));
  }

  async function generateLinkedInDraft(socialCalendarItemId: string, options?: LinkedInGenerationOptions): Promise<LinkedInDraftResult> {
    return apiRequest<LinkedInDraftResult>(`${basePath}/content-generation/linkedin/${socialCalendarItemId}`, { method: 'POST', body: options ?? {} });
  }

  async function handleGenerateLinkedInDraft(item: SocialCalendarItem, isRegenerate: boolean) {
    if (isRegenerate) {
      const confirmed = window.confirm('Regenerating will make another AI request and may incur additional cost. Continue?');
      if (!confirmed) return;
    }
    setLinkedInBusyIds((prev) => ({ ...prev, [item.id]: true }));
    setLinkedInErrors((prev) => ({ ...prev, [item.id]: null }));
    try {
      const result = await generateLinkedInDraft(item.id, getLinkedInOptions(item));
      setLinkedInDrafts((prev) => ({ ...prev, [item.id]: result }));
    } catch (err) {
      setLinkedInErrors((prev) => ({ ...prev, [item.id]: err instanceof ApiError ? err.message : 'Failed to generate LinkedIn draft' }));
    } finally {
      setLinkedInBusyIds((prev) => ({ ...prev, [item.id]: false }));
    }
  }

  function handleCopyLinkedInDraft(content: string) {
    void navigator.clipboard.writeText(content);
  }

  async function handleBuildSocialCalendar() {
    setSocialCalendarBusy(true);
    setSocialCalendarError(null);
    try {
      const result = await apiRequest<SocialCalendarResult>(`${basePath}/content-planning/social-calendar-preview`, { method: 'POST', body: {} });
      setSocialCalendar(result);
    } catch (err) {
      setSocialCalendarError(err instanceof ApiError ? err.message : 'Failed to build social calendar');
    } finally {
      setSocialCalendarBusy(false);
    }
  }

  async function handleBuildVideoCalendar() {
    setVideoCalendarBusy(true);
    setVideoCalendarError(null);
    try {
      const result = await apiRequest<VideoCalendarResult>(`${basePath}/content-planning/video-calendar-preview`, { method: 'POST', body: {} });
      setVideoCalendar(result);
    } catch (err) {
      setVideoCalendarError(err instanceof ApiError ? err.message : 'Failed to build video calendar');
    } finally {
      setVideoCalendarBusy(false);
    }
  }

  async function handleBuildRepurposingPlan() {
    setRepurposingBusy(true);
    setRepurposingError(null);
    try {
      const result = await apiRequest<RepurposingPlanResult>(`${basePath}/content-planning/repurposing-preview`, { method: 'POST', body: {} });
      setRepurposingPlan(result);
    } catch (err) {
      setRepurposingError(err instanceof ApiError ? err.message : 'Failed to build cross-channel repurposing plan');
    } finally {
      setRepurposingBusy(false);
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <Loading text="Loading campaign..." />
      </AppLayout>
    );
  }

  if (loadError || !campaign) {
    return (
      <AppLayout>
        <ErrorMessage message={loadError ?? 'Campaign not found'} />
      </AppLayout>
    );
  }

  const mapping = campaign.audienceChannelMapping;
  const hasMapping = !!mapping && (mapping.audiences.length > 0 || mapping.channels.length > 0);
  const missingPrereq = !campaign.goal ? 'Define a campaign goal first.' : !hasMapping ? 'Define an audience/channel mapping first.' : null;
  const plan = campaign.plan;

  const primaryAudienceRec = mapping?.audiences.find((a) => a.audienceSegmentId === mapping.primaryAudienceSegmentId);
  const planWarnings = plan ? dedupe(plan.warnings) : [];
  const planMissingEvidence = plan ? dedupe(plan.missingEvidence) : [];
  const topPriorities = plan ? plan.topPriorityActivityIds.map((id) => plan.activities.find((a) => a.id === id)).filter((a): a is CampaignActivity => !!a) : [];
  const sortedActivities = plan ? [...plan.activities].sort((a, b) => a.day - b.day || b.priorityScore - a.priorityScore) : [];

  const review = campaign.review;
  const isReviewStale =
    review.status === 'approved' &&
    (campaign.planningMetadata.version > (review.reviewedPlanningVersion ?? 0) ||
      (!!plan?.generatedAt && !!review.reviewedPlanGeneratedAt && new Date(plan.generatedAt).getTime() > new Date(review.reviewedPlanGeneratedAt).getTime()));
  const effectiveReviewStatusLabel = isReviewStale ? 'Review Required (Stale)' : labelize(review.status);
  const missingApprovalPrereqs: string[] = [];
  if (!campaign.goal) missingApprovalPrereqs.push('the campaign goal');
  if (!hasMapping) missingApprovalPrereqs.push('the audience/channel mapping');
  if (!plan) missingApprovalPrereqs.push('the 30-day plan');
  const hasUnresolvedSectionChanges = review.sectionReviews.some((s) => s.status === 'changes_requested');
  const canApprove = missingApprovalPrereqs.length === 0 && !hasUnresolvedSectionChanges;

  const ideaChannels = contentIdeas ? dedupe(contentIdeas.ideas.map((i) => i.channel)) : [];
  const ideaFunnelStages = contentIdeas ? dedupe(contentIdeas.ideas.map((i) => i.funnelStage)) : [];
  const ideaTypes = contentIdeas ? dedupe(contentIdeas.ideas.map((i) => i.type)) : [];
  const filteredIdeas = contentIdeas
    ? [...contentIdeas.ideas]
        .filter((i) => !ideaChannelFilter || i.channel === ideaChannelFilter)
        .filter((i) => !ideaFunnelStageFilter || i.funnelStage === ideaFunnelStageFilter)
        .filter((i) => !ideaTypeFilter || i.type === ideaTypeFilter)
        .sort((a, b) => b.priorityScore - a.priorityScore)
    : [];
  const visibleIdeas = showAllIdeas ? filteredIdeas : filteredIdeas.slice(0, 12);
  const ideaMissingEvidence = contentIdeas ? dedupe(contentIdeas.missingEvidence) : [];
  const ideaWarnings = contentIdeas ? dedupe(contentIdeas.warnings) : [];

  const ideaTitleById = new Map((contentIdeas?.ideas ?? []).map((i) => [i.id, i.title]));
  const topicChannels = topics ? dedupe(topics.topics.flatMap((t) => t.channels)) : [];
  const topicFunnelStages = topics ? dedupe(topics.topics.flatMap((t) => t.funnelStages)) : [];
  const filteredTopics = topics
    ? topics.topics
        .filter((t) => !topicTierFilter || t.tier === topicTierFilter)
        .filter((t) => !topicChannelFilter || t.channels.includes(topicChannelFilter))
        .filter((t) => !topicFunnelStageFilter || t.funnelStages.includes(topicFunnelStageFilter))
    : [];
  const TOPIC_TIER_ORDER: ContentTopicTier[] = ['primary', 'secondary', 'experimental', 'deferred'];
  const TOPIC_TIER_VISIBLE_CAP: Record<ContentTopicTier, number> = { primary: Infinity, secondary: 8, experimental: 6, deferred: Infinity };
  const topicMissingEvidence = topics ? dedupe(topics.missingEvidence) : [];
  const topicWarnings = topics ? dedupe(topics.warnings) : [];

  const topicTitleById = new Map((topics?.topics ?? []).map((t) => [t.id, t.title]));
  const PILLAR_TIER_ORDER: CampaignContentPillarTier[] = ['primary', 'supporting', 'experimental'];
  const pillarMissingEvidence = pillarPlan ? dedupe(pillarPlan.missingEvidence) : [];
  const pillarWarnings = pillarPlan ? dedupe(pillarPlan.warnings) : [];

  const pillarTitleById = new Map((pillarPlan?.pillars ?? []).map((p) => [p.id, p.title]));
  const blogCalendarMissingEvidence = blogCalendar ? dedupe(blogCalendar.missingEvidence) : [];
  const blogCalendarWarnings = blogCalendar ? dedupe(blogCalendar.warnings) : [];
  const blogFunnelStages = blogCalendar ? dedupe(blogCalendar.items.map((i) => i.funnelStage)) : [];

  const blogTitleById = new Map((blogCalendar?.items ?? []).map((i) => [i.id, i.title]));
  const socialCalendarMissingEvidence = socialCalendar ? dedupe(socialCalendar.missingEvidence) : [];
  const socialCalendarWarnings = socialCalendar ? dedupe(socialCalendar.warnings) : [];
  const socialPlatforms = socialCalendar ? dedupe(socialCalendar.items.map((i) => i.platform)) : [];
  const socialTypes = socialCalendar ? dedupe(socialCalendar.items.map((i) => i.type)) : [];
  const socialFunnelStages = socialCalendar ? dedupe(socialCalendar.items.map((i) => i.funnelStage)) : [];
  const filteredSocialWeeks = socialCalendar
    ? socialCalendar.weeks
        .map((week) => ({
          ...week,
          itemIds: week.itemIds.filter((id) => {
            const item = socialCalendar.items.find((i) => i.id === id);
            if (!item) return false;
            if (socialPlatformFilter && item.platform !== socialPlatformFilter) return false;
            if (socialTypeFilter && item.type !== socialTypeFilter) return false;
            if (socialFunnelStageFilter && item.funnelStage !== socialFunnelStageFilter) return false;
            return true;
          }),
        }))
        .filter((week) => week.itemIds.length > 0)
    : [];

  const socialTitleById = new Map((socialCalendar?.items ?? []).map((i) => [i.id, i.title]));
  const videoCalendarMissingEvidence = videoCalendar ? dedupe(videoCalendar.missingEvidence) : [];
  const videoCalendarWarnings = videoCalendar ? dedupe(videoCalendar.warnings) : [];
  const videoTypes = videoCalendar ? dedupe(videoCalendar.items.map((i) => i.type)) : [];
  const videoFormats = videoCalendar ? dedupe(videoCalendar.items.map((i) => i.formatDirection)) : [];
  const videoFunnelStages = videoCalendar ? dedupe(videoCalendar.items.map((i) => i.funnelStage)) : [];
  const filteredVideoWeeks = videoCalendar
    ? videoCalendar.weeks
        .map((week) => ({
          ...week,
          itemIds: week.itemIds.filter((id) => {
            const item = videoCalendar.items.find((i) => i.id === id);
            if (!item) return false;
            if (videoTypeFilter && item.type !== videoTypeFilter) return false;
            if (videoFormatFilter && item.formatDirection !== videoFormatFilter) return false;
            if (videoFunnelStageFilter && item.funnelStage !== videoFunnelStageFilter) return false;
            return true;
          }),
        }))
        .filter((week) => week.itemIds.length > 0)
    : [];

  const repurposingMissingEvidence = repurposingPlan ? dedupe(repurposingPlan.missingEvidence) : [];
  const repurposingWarnings = repurposingPlan ? dedupe(repurposingPlan.warnings) : [];
  const repurposingSourceTypes = repurposingPlan ? dedupe(repurposingPlan.items.map((i) => i.sourceType)) : [];
  const repurposingTargetTypes = repurposingPlan ? dedupe(repurposingPlan.items.map((i) => i.targetType)) : [];
  const repurposingFunnelStages = repurposingPlan ? dedupe(repurposingPlan.items.map((i) => i.funnelStage)) : [];
  const filteredRepurposingItems = repurposingPlan
    ? repurposingPlan.items
        .filter((i) => !repurposingSourceFilter || i.sourceType === repurposingSourceFilter)
        .filter((i) => !repurposingTargetFilter || i.targetType === repurposingTargetFilter)
        .filter((i) => !repurposingFunnelStageFilter || i.funnelStage === repurposingFunnelStageFilter)
    : [];
  const filteredRepurposingItemIds = new Set(filteredRepurposingItems.map((i) => i.id));
  const filteredRepurposingChains = repurposingPlan
    ? repurposingPlan.chains
        .map((chain) => ({ ...chain, repurposingItemIds: chain.repurposingItemIds.filter((id) => filteredRepurposingItemIds.has(id)) }))
        .filter((chain) => chain.repurposingItemIds.length > 0)
    : [];

  return (
    <AppLayout>
      <PageHeader
        backTo={{ to: `/organizations/${organizationId}/products/${productId}/campaigns`, label: 'Campaigns' }}
        title={campaign.name}
        actions={<span className={`quality-badge ${statusQualityClass(campaign.status)}`}>{labelize(campaign.status)}</span>}
      />

      {/* A. Campaign Overview */}
      <Card className="analysis-card">
        <div className="analysis-header">
          <div>
            <h2 className="card-title">Overview</h2>
            <p className="card-subtitle">Campaign metadata and planning status.</p>
          </div>
          {!editingOverview && (
            <button className="btn btn-secondary" onClick={startEditOverview}>
              Edit
            </button>
          )}
        </div>

        {editingOverview ? (
          <form onSubmit={handleSaveOverview} className="form form-grid-2">
            <div className="field">
              <label htmlFor="ov-name">Name</label>
              <input id="ov-name" required value={overviewForm.name} onChange={(e) => setOverviewForm({ ...overviewForm, name: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="ov-type">Type</label>
              <select id="ov-type" value={overviewForm.type} onChange={(e) => setOverviewForm({ ...overviewForm, type: e.target.value })}>
                <option value="">-</option>
                {CAMPAIGN_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {labelize(t)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field field-full">
              <label htmlFor="ov-description">Description</label>
              <textarea id="ov-description" value={overviewForm.description} onChange={(e) => setOverviewForm({ ...overviewForm, description: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="ov-status">Status</label>
              <select id="ov-status" value={overviewForm.status} onChange={(e) => setOverviewForm({ ...overviewForm, status: e.target.value })}>
                {CAMPAIGN_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {labelize(s)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ov-start">Start Date</label>
              <input id="ov-start" type="date" value={overviewForm.startDate} onChange={(e) => setOverviewForm({ ...overviewForm, startDate: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="ov-end">End Date</label>
              <input id="ov-end" type="date" value={overviewForm.endDate} onChange={(e) => setOverviewForm({ ...overviewForm, endDate: e.target.value })} />
            </div>
            <ErrorMessage message={overviewError} />
            <div className="form-inline">
              <button type="submit" className="btn btn-primary" disabled={savingOverview}>
                {savingOverview ? 'Updating campaign...' : 'Save'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setEditingOverview(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="summary-grid">
            <div>
              <span className="summary-label">Description</span>
              <p>{campaign.description || 'No description provided.'}</p>
            </div>
            <div>
              <span className="summary-label">Type</span>
              <p>{campaign.type ? labelize(campaign.type) : '-'}</p>
            </div>
            <div>
              <span className="summary-label">Planning Version</span>
              <p>v{campaign.planningMetadata.version}</p>
            </div>
            <div>
              <span className="summary-label">Planning Source</span>
              <p>{labelize(campaign.planningMetadata.source)}</p>
            </div>
            <div>
              <span className="summary-label">Dates</span>
              <p>
                {campaign.startDate ? new Date(campaign.startDate).toLocaleDateString() : '-'} &rarr;{' '}
                {campaign.endDate ? new Date(campaign.endDate).toLocaleDateString() : '-'}
              </p>
            </div>
            <div>
              <span className="summary-label">Strategy Reference</span>
              <p>
                {campaign.strategyReference?.reviewedStrategyGeneratedAt
                  ? `Linked to strategy reviewed ${new Date(campaign.strategyReference.reviewedStrategyGeneratedAt).toLocaleString()}`
                  : 'Not yet linked to an approved strategy.'}
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* B. Campaign Goal */}
      <Card className="analysis-card">
        <div className="analysis-header">
          <div>
            <h2 className="card-title">Campaign Goal</h2>
            <p className="card-subtitle">The objective this campaign is built around.</p>
          </div>
          <div className="form-inline" style={{ margin: 0 }}>
            <button className="btn btn-primary" onClick={handleDeriveGoal} disabled={goalBusy !== null}>
              {goalBusy === 'deriving' ? 'Deriving goal...' : 'Derive from Approved Strategy'}
            </button>
            <button className="btn btn-secondary" onClick={startEditGoal} disabled={goalBusy !== null}>
              {campaign.goal ? 'Edit Manually' : 'Define Manually'}
            </button>
          </div>
        </div>

        <ErrorMessage message={goalError} />

        {showGoalForm && (
          <form onSubmit={handleSaveGoal} className="form form-grid-2">
            <div className="field">
              <label htmlFor="goal-type">Type</label>
              <select id="goal-type" value={goalForm.type} onChange={(e) => setGoalForm({ ...goalForm, type: e.target.value })}>
                {CAMPAIGN_GOAL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {labelize(t)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="goal-title">Title</label>
              <input id="goal-title" required value={goalForm.title} onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })} />
            </div>
            <div className="field field-full">
              <label htmlFor="goal-description">Description</label>
              <textarea id="goal-description" value={goalForm.description} onChange={(e) => setGoalForm({ ...goalForm, description: e.target.value })} />
            </div>
            <div className="field field-full">
              <label htmlFor="goal-signals">Success Signals (comma-separated)</label>
              <input id="goal-signals" value={goalForm.successSignals} onChange={(e) => setGoalForm({ ...goalForm, successSignals: e.target.value })} />
            </div>
            <div className="form-inline">
              <button type="submit" className="btn btn-primary" disabled={goalBusy !== null}>
                {goalBusy === 'saving' ? 'Saving goal...' : 'Save Goal'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowGoalForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {!campaign.goal && !showGoalForm && <p className="muted">No campaign goal has been defined yet.</p>}

        {campaign.goal && !showGoalForm && (
          <div className="summary-grid">
            <div>
              <span className="summary-label">Title</span>
              <p>{campaign.goal.title}</p>
            </div>
            <div>
              <span className="summary-label">Type</span>
              <p>{labelize(campaign.goal.type)}</p>
            </div>
            <div>
              <span className="summary-label">Source</span>
              <p>{labelize(campaign.goal.source)}</p>
            </div>
            {campaign.goal.description && (
              <div className="field-full" style={{ gridColumn: '1 / -1' }}>
                <span className="summary-label">Description</span>
                <p>{campaign.goal.description}</p>
              </div>
            )}
            {campaign.goal.priorityScore !== undefined && (
              <div>
                <span className="summary-label">Priority</span>
                <p>{campaign.goal.priorityScore}</p>
              </div>
            )}
            {campaign.goal.confidenceScore !== undefined && (
              <div>
                <span className="summary-label">Confidence</span>
                <p>{campaign.goal.confidenceScore}</p>
              </div>
            )}
            {campaign.goal.successSignals.length > 0 && (
              <div style={{ gridColumn: '1 / -1' }}>
                <span className="summary-label">Success Signals</span>
                <div className="tag-list">
                  {campaign.goal.successSignals.map((s, i) => (
                    <span className="tag" key={i}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {campaign.goal.warnings.length > 0 && (
              <div className="content-warning" style={{ gridColumn: '1 / -1' }}>
                {dedupe(campaign.goal.warnings).join(' ')}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* C. Audience & Channels */}
      <Card className="analysis-card">
        <div className="analysis-header">
          <div>
            <h2 className="card-title">Audience &amp; Channel Mapping</h2>
            <p className="card-subtitle">Which segments and channels this campaign targets.</p>
          </div>
          <div className="form-inline" style={{ margin: 0 }}>
            <button className="btn btn-primary" onClick={handleDeriveMapping} disabled={mappingBusy !== null}>
              {mappingBusy === 'deriving' ? 'Deriving audience/channel mapping...' : 'Derive from Approved Strategy'}
            </button>
            <button className="btn btn-secondary" onClick={startEditMapping} disabled={mappingBusy !== null}>
              {hasMapping ? 'Edit Manually' : 'Define Manually'}
            </button>
          </div>
        </div>

        <ErrorMessage message={mappingError} />

        {showMappingForm && (
          <form onSubmit={handleSaveMapping} className="form form-grid-2">
            <div className="field field-full">
              <label htmlFor="map-audiences">Audience Segment IDs (comma-separated)</label>
              <input id="map-audiences" value={mappingForm.audienceSegmentIds} onChange={(e) => setMappingForm({ ...mappingForm, audienceSegmentIds: e.target.value })} />
            </div>
            <div className="field field-full">
              <label htmlFor="map-channels">Channel IDs (comma-separated)</label>
              <input id="map-channels" value={mappingForm.channelIds} onChange={(e) => setMappingForm({ ...mappingForm, channelIds: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="map-primary-audience">Primary Audience Segment ID</label>
              <input id="map-primary-audience" value={mappingForm.primaryAudienceSegmentId} onChange={(e) => setMappingForm({ ...mappingForm, primaryAudienceSegmentId: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="map-primary-channel">Primary Channel</label>
              <input id="map-primary-channel" value={mappingForm.primaryChannel} onChange={(e) => setMappingForm({ ...mappingForm, primaryChannel: e.target.value })} />
            </div>
            <div className="form-inline">
              <button type="submit" className="btn btn-primary" disabled={mappingBusy !== null}>
                {mappingBusy === 'saving' ? 'Saving mapping...' : 'Save Mapping'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowMappingForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {!hasMapping && !showMappingForm && <p className="muted">No audience/channel mapping has been defined yet.</p>}

        {hasMapping && !showMappingForm && (
          <div className="summary-grid">
            <div>
              <span className="summary-label">Primary Audience</span>
              <p>{primaryAudienceRec?.label ?? mapping?.primaryAudienceSegmentId ?? '-'}</p>
            </div>
            <div>
              <span className="summary-label">Primary Channel</span>
              <p>{mapping?.primaryChannel ? labelize(mapping.primaryChannel) : '-'}</p>
            </div>
            <div>
              <span className="summary-label">Confidence</span>
              <p>{mapping?.confidenceScore ?? 0}</p>
            </div>
            <div>
              <span className="summary-label">Source</span>
              <p>{mapping ? labelize(mapping.source) : '-'}</p>
            </div>
            {mapping && mapping.audiences.length > 0 && (
              <div style={{ gridColumn: '1 / -1' }}>
                <span className="summary-label">Selected Audiences</span>
                <div className="tag-list">
                  {mapping.audiences.map((a) => (
                    <span className="tag" key={a.audienceSegmentId}>
                      {a.label ?? a.audienceSegmentId}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {mapping && mapping.channels.length > 0 && (
              <div style={{ gridColumn: '1 / -1' }}>
                <span className="summary-label">Selected Channels</span>
                <div className="tag-list">
                  {mapping.channels.map((c) => (
                    <span className="tag" key={c.channel}>
                      {labelize(c.channel)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {mapping && dedupe([...mapping.audiences.flatMap((a) => a.reasons), ...mapping.channels.flatMap((c) => c.reasons)]).length > 0 && (
              <details style={{ gridColumn: '1 / -1', marginTop: 8 }}>
                <summary className="summary-label" style={{ cursor: 'pointer' }}>
                  Reasons
                </summary>
                <ul className="bullet-list">
                  {dedupe([...mapping.audiences.flatMap((a) => a.reasons), ...mapping.channels.flatMap((c) => c.reasons)]).map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </details>
            )}
            {mapping && dedupe([...mapping.missingEvidence, ...mapping.warnings]).length > 0 && (
              <div className="content-warning" style={{ gridColumn: '1 / -1' }}>
                {dedupe([...mapping.missingEvidence, ...mapping.warnings]).join(' ')}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* D + E. 30-Day Campaign Calendar + Plan Summary */}
      <Card className="analysis-card">
        <div className="analysis-header">
          <div>
            <h2 className="card-title">30-Day Campaign Calendar</h2>
            <p className="card-subtitle">Generated, evidence-based activity sequence for this campaign.</p>
          </div>
          {plan && (
            <div className="form-inline" style={{ margin: 0 }}>
              <button className="btn btn-ghost" onClick={() => setCalendarView(calendarView === 'calendar' ? 'list' : 'calendar')}>
                {calendarView === 'calendar' ? 'List View' : 'Calendar View'}
              </button>
            </div>
          )}
        </div>

        <ErrorMessage message={planError} />

        {!plan && missingPrereq && <p className="muted">{missingPrereq}</p>}

        {!plan && !missingPrereq && (
          <>
            <p className="muted">No 30-day campaign plan has been generated yet.</p>
            <button className="btn btn-primary" onClick={handleGeneratePlan} disabled={planBusy}>
              {planBusy ? 'Generating campaign plan...' : 'Generate 30-Day Campaign Plan'}
            </button>
          </>
        )}

        {plan && (
          <>
            <div className="summary-grid" style={{ marginBottom: 16 }}>
              <div>
                <span className="summary-label">Plan Confidence</span>
                <p>{plan.confidenceScore}</p>
              </div>
              <div>
                <span className="summary-label">Activities</span>
                <p>{plan.activities.length}</p>
              </div>
              <div>
                <span className="summary-label">Generated</span>
                <p>{plan.generatedAt ? new Date(plan.generatedAt).toLocaleString() : '-'}</p>
              </div>
            </div>

            {(planMissingEvidence.length > 0 || planWarnings.length > 0) && (
              <div className="content-warning" style={{ marginBottom: 16 }}>
                {[...planMissingEvidence, ...planWarnings].join(' ')}
              </div>
            )}

            {topPriorities.length > 0 && (
              <div className="section" style={{ marginTop: 0 }}>
                <h3 className="section-title">Top Campaign Priorities</h3>
                <div className="priority-list">
                  {topPriorities.map((a) => (
                    <div className="priority-item" key={a.id}>
                      <div className="entity-card-meta">Day {a.day}</div>
                      <div style={{ fontWeight: 600 }}>{a.title}</div>
                      <div className="tag-list" style={{ marginTop: 4 }}>
                        <span className="tag">{labelize(a.channel)}</span>
                        <span className={`quality-badge ${qualityBadgeClass(scoreQuality(a.priorityScore))}`}>Priority {a.priorityScore}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {calendarView === 'calendar' ? (
              plan.weeks.map((week) => {
                const activitiesByDay = new Map<number, CampaignActivity[]>();
                for (const activity of plan.activities) {
                  if (!week.days.includes(activity.day)) continue;
                  const list = activitiesByDay.get(activity.day) ?? [];
                  list.push(activity);
                  activitiesByDay.set(activity.day, list);
                }
                return (
                  <div className="calendar-week" key={week.week}>
                    <div className="calendar-week-header">
                      <div>
                        <strong>
                          Week {week.week} &mdash; {week.theme}
                        </strong>
                        <div className="entity-card-meta">{week.objective}</div>
                      </div>
                      <div className="entity-card-meta">
                        {week.activityIds.length} {week.activityIds.length === 1 ? 'activity' : 'activities'} &middot; Confidence {week.confidenceScore}
                      </div>
                    </div>
                    <div className="calendar-days">
                      {week.days.map((day) => {
                        const dayActivities = activitiesByDay.get(day) ?? [];
                        const actualDate = actualDateForDay(campaign.startDate, day);
                        return (
                          <div className="calendar-day" key={day}>
                            <div className="calendar-day-number">
                              Day {day}
                              {actualDate ? ` · ${actualDate}` : ''}
                            </div>
                            {dayActivities.length === 0 ? (
                              <div className="calendar-day-empty">No planned activity</div>
                            ) : (
                              dayActivities.map((activity) => <ActivityCard key={activity.id} activity={activity} mapping={mapping} allActivities={plan.activities} />)
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="section" style={{ marginTop: 0 }}>
                {sortedActivities.map((activity) => (
                  <div key={activity.id} style={{ marginBottom: 10 }}>
                    <div className="entity-card-meta">Day {activity.day}</div>
                    <ActivityCard activity={activity} mapping={mapping} allActivities={plan.activities} />
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              {confirmRegenerate ? (
                <div>
                  <div className="content-warning" style={{ marginBottom: 8 }}>
                    Regenerating replaces the current plan and resets generated activity statuses to Planned. Regenerating the plan will make the current campaign approval stale.
                  </div>
                  <div className="form-inline">
                    <button className="btn btn-primary" onClick={handleGeneratePlan} disabled={planBusy}>
                      {planBusy ? 'Generating campaign plan...' : 'Confirm Regenerate'}
                    </button>
                    <button className="btn btn-ghost" onClick={() => setConfirmRegenerate(false)} disabled={planBusy}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button className="btn btn-secondary" onClick={() => setConfirmRegenerate(true)}>
                  Regenerate Plan
                </button>
              )}
            </div>
          </>
        )}
      </Card>

      {/* Campaign Review & Approval */}
      <Card className="analysis-card">
        <div className="analysis-header">
          <div>
            <h2 className="card-title">Campaign Review &amp; Approval</h2>
            <p className="card-subtitle">Explicit review before this campaign can move toward publishing/scheduling.</p>
          </div>
          <span className={`quality-badge ${isReviewStale ? 'quality-limited' : statusQualityClass(review.status as CampaignStatus)}`}>{effectiveReviewStatusLabel}</span>
        </div>

        <ErrorMessage message={reviewError} />
        {reviewSavedMessage && <p className="muted">{reviewSavedMessage}</p>}

        {isReviewStale && <div className="content-warning" style={{ marginBottom: 12 }}>Campaign changed after the last approval. Review is required again.</div>}

        <div className="summary-grid" style={{ marginBottom: 16 }}>
          <div>
            <span className="summary-label">Approved At</span>
            <p>{review.approvedAt ? new Date(review.approvedAt).toLocaleString() : '-'}</p>
          </div>
          <div>
            <span className="summary-label">Changes Requested At</span>
            <p>{review.changesRequestedAt ? new Date(review.changesRequestedAt).toLocaleString() : '-'}</p>
          </div>
          <div>
            <span className="summary-label">Reviewed Planning Version</span>
            <p>{review.reviewedPlanningVersion ?? '-'}</p>
          </div>
          <div>
            <span className="summary-label">Current Planning Version</span>
            <p>{campaign.planningMetadata.version}</p>
          </div>
        </div>

        <div className="section" style={{ marginTop: 0 }}>
          <h3 className="section-title">Section Reviews</h3>
          {CAMPAIGN_REVIEW_SECTION_LIST.map((s) => (
            <div key={s.key} className="form-inline" style={{ alignItems: 'flex-start', marginBottom: 10 }}>
              <div style={{ minWidth: 160, fontWeight: 600 }}>{s.label}</div>
              <div className="field" style={{ marginBottom: 0 }}>
                <select
                  value={sectionDrafts[s.key].status}
                  onChange={(e) =>
                    setSectionDrafts({ ...sectionDrafts, [s.key]: { ...sectionDrafts[s.key], status: e.target.value as CampaignSectionReviewStatus } })
                  }
                >
                  {CAMPAIGN_SECTION_REVIEW_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {labelize(status)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field field-full" style={{ marginBottom: 0, flex: 1 }}>
                <input
                  placeholder="Optional note"
                  value={sectionDrafts[s.key].note}
                  onChange={(e) => setSectionDrafts({ ...sectionDrafts, [s.key]: { ...sectionDrafts[s.key], note: e.target.value } })}
                />
              </div>
            </div>
          ))}
          <div className="field field-full">
            <label htmlFor="review-overall-note">Overall Note</label>
            <textarea id="review-overall-note" value={overallNoteDraft} onChange={(e) => setOverallNoteDraft(e.target.value)} />
          </div>
        </div>

        {missingApprovalPrereqs.length > 0 && (
          <p className="muted">Complete {missingApprovalPrereqs.join(', ')} before approval.</p>
        )}
        {missingApprovalPrereqs.length === 0 && hasUnresolvedSectionChanges && <p className="muted">Resolve requested changes before approving this campaign.</p>}

        <div className="form-inline">
          <button className="btn btn-secondary" onClick={handleSaveReview} disabled={reviewBusy !== null}>
            {reviewBusy === 'saving' ? 'Saving review...' : 'Save Review'}
          </button>
          <button className="btn btn-primary" onClick={handleApproveCampaign} disabled={reviewBusy !== null || !canApprove}>
            {reviewBusy === 'approving' ? 'Approving campaign...' : 'Approve Campaign'}
          </button>
          <button className="btn btn-ghost" onClick={handleRequestChanges} disabled={reviewBusy !== null}>
            {reviewBusy === 'requesting' ? 'Requesting changes...' : 'Request Changes'}
          </button>
        </div>
      </Card>

      {/* Content Planning */}
      <Card className="analysis-card">
        <div className="analysis-header">
          <div>
            <h2 className="card-title">Content Planning</h2>
            <p className="card-subtitle">Strategic content directions derived from the approved strategy and this campaign's plan.</p>
          </div>
        </div>

        <div className="section" style={{ marginTop: 0 }}>
          <h3 className="section-title">Content Ideas</h3>

          <ErrorMessage message={contentIdeasError} />

          {!contentIdeas && !contentIdeasBusy && <p className="muted">No content ideas have been generated for this campaign yet.</p>}

          <button className="btn btn-primary" onClick={handleGenerateContentIdeas} disabled={contentIdeasBusy}>
            {contentIdeasBusy ? 'Generating content ideas...' : contentIdeas ? 'Regenerate Content Ideas' : 'Generate Content Ideas'}
          </button>

          {contentIdeas && (
            <div style={{ marginTop: 16 }}>
              <div className="summary-grid" style={{ marginBottom: 16 }}>
                <div>
                  <span className="summary-label">Idea Count</span>
                  <p>{contentIdeas.ideas.length}</p>
                </div>
                <div>
                  <span className="summary-label">Primary Ideas</span>
                  <p>{contentIdeas.primaryIdeaIds.length}</p>
                </div>
                <div>
                  <span className="summary-label">Overall Confidence</span>
                  <p>{contentIdeas.confidenceScore}</p>
                </div>
                <div>
                  <span className="summary-label">Channels Represented</span>
                  <p>{ideaChannels.length ? ideaChannels.map((c) => labelize(c)).join(', ') : '-'}</p>
                </div>
                <div>
                  <span className="summary-label">Funnel Stages Represented</span>
                  <p>{ideaFunnelStages.length ? ideaFunnelStages.map((s) => labelize(s)).join(', ') : '-'}</p>
                </div>
              </div>

              {(ideaMissingEvidence.length > 0 || ideaWarnings.length > 0) && (
                <div className="content-warning" style={{ marginBottom: 16 }}>
                  {[...ideaMissingEvidence, ...ideaWarnings].join(' ')}
                </div>
              )}

              {contentIdeas.ideas.length === 0 ? (
                <p className="muted">No reliable content ideas were detected from the current approved strategy and campaign plan.</p>
              ) : (
                <>
                  <div className="form-inline">
                    <div className="field" style={{ marginBottom: 0 }}>
                      <select value={ideaChannelFilter} onChange={(e) => setIdeaChannelFilter(e.target.value)}>
                        <option value="">All channels</option>
                        {ideaChannels.map((c) => (
                          <option key={c} value={c}>
                            {labelize(c)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <select value={ideaFunnelStageFilter} onChange={(e) => setIdeaFunnelStageFilter(e.target.value)}>
                        <option value="">All funnel stages</option>
                        {ideaFunnelStages.map((s) => (
                          <option key={s} value={s}>
                            {labelize(s)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <select value={ideaTypeFilter} onChange={(e) => setIdeaTypeFilter(e.target.value)}>
                        <option value="">All idea types</option>
                        {ideaTypes.map((t) => (
                          <option key={t} value={t}>
                            {labelize(t)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid-cards" style={{ marginTop: 12 }}>
                    {visibleIdeas.map((idea) => {
                      const isPrimary = contentIdeas.primaryIdeaIds.includes(idea.id);
                      return (
                        <Card key={idea.id} className="entity-card">
                          <div className="entity-card-header">
                            <h3>{idea.title}</h3>
                            {isPrimary && <span className="tag">Primary</span>}
                          </div>
                          <div className="tag-list">
                            <span className="tag">{labelize(idea.type)}</span>
                            <span className="tag">{labelize(idea.channel)}</span>
                            <span className="tag">{labelize(idea.funnelStage)}</span>
                            <span className={`quality-badge ${qualityBadgeClass(scoreQuality(idea.priorityScore))}`}>Priority {idea.priorityScore}</span>
                          </div>
                          <p className="entity-card-meta">{idea.angle}</p>
                          {idea.audienceSegmentIds.length > 0 && (
                            <div className="entity-card-meta">Audience: {idea.audienceSegmentIds.map((id) => audienceLabel(mapping, id)).join(', ')}</div>
                          )}
                          <details style={{ marginTop: 6 }}>
                            <summary className="summary-label" style={{ cursor: 'pointer' }}>
                              Details
                            </summary>
                            <div style={{ marginTop: 8 }}>
                              <span className="summary-label">Objective</span>
                              <p>{idea.objective}</p>
                              <span className="summary-label">Format Direction</span>
                              <p>{labelize(idea.formatDirection)}</p>
                              {idea.suggestedCTA && (
                                <>
                                  <span className="summary-label">Suggested CTA</span>
                                  <p>{idea.suggestedCTA}</p>
                                </>
                              )}
                              {idea.keywords.length > 0 && (
                                <>
                                  <span className="summary-label">Keyword Directions</span>
                                  <div className="tag-list">
                                    {idea.keywords.map((k, i) => (
                                      <span className="tag" key={i}>
                                        {k}
                                      </span>
                                    ))}
                                  </div>
                                </>
                              )}
                              {(idea.messagingPillarIds.length > 0 || idea.contentPillarIds.length > 0) && (
                                <>
                                  <span className="summary-label">Related Pillars</span>
                                  <p className="entity-card-meta">{[...idea.messagingPillarIds, ...idea.contentPillarIds].join(', ') || '-'}</p>
                                </>
                              )}
                              <span className="summary-label">Confidence</span>
                              <p>{idea.confidenceScore}</p>
                              {idea.reasons.length > 0 && (
                                <>
                                  <span className="summary-label">Reasons</span>
                                  <ul className="bullet-list">
                                    {idea.reasons.map((r, i) => (
                                      <li key={i}>{r}</li>
                                    ))}
                                  </ul>
                                </>
                              )}
                              {idea.warnings.length > 0 && <div className="content-warning" style={{ marginTop: 8 }}>{idea.warnings.join(' ')}</div>}
                            </div>
                          </details>
                        </Card>
                      );
                    })}
                  </div>

                  {filteredIdeas.length > 12 && (
                    <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => setShowAllIdeas(!showAllIdeas)}>
                      {showAllIdeas ? 'Show fewer ideas' : `Show all ${filteredIdeas.length} ideas`}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="section">
          <h3 className="section-title">Topic Prioritization</h3>

          <ErrorMessage message={topicsError} />

          {!topics && !topicsBusy && <p className="muted">No topics have been prioritized yet.</p>}

          <button className="btn btn-primary" onClick={handlePrioritizeTopics} disabled={topicsBusy}>
            {topicsBusy ? 'Prioritizing topics...' : topics ? 'Reprioritize Topics' : 'Prioritize Topics'}
          </button>

          {topics && (
            <div style={{ marginTop: 16 }}>
              <div className="summary-grid" style={{ marginBottom: 16 }}>
                <div>
                  <span className="summary-label">Total Topics</span>
                  <p>{topics.topics.length}</p>
                </div>
                <div>
                  <span className="summary-label">Primary</span>
                  <p>{topics.topics.filter((t) => t.tier === 'primary').length}</p>
                </div>
                <div>
                  <span className="summary-label">Secondary</span>
                  <p>{topics.topics.filter((t) => t.tier === 'secondary').length}</p>
                </div>
                <div>
                  <span className="summary-label">Experimental</span>
                  <p>{topics.topics.filter((t) => t.tier === 'experimental').length}</p>
                </div>
                <div>
                  <span className="summary-label">Overall Confidence</span>
                  <p>{topics.confidenceScore}</p>
                </div>
              </div>

              {(topicMissingEvidence.length > 0 || topicWarnings.length > 0) && (
                <div className="content-warning" style={{ marginBottom: 16 }}>
                  {[...topicMissingEvidence, ...topicWarnings].join(' ')}
                </div>
              )}

              {topics.topics.length === 0 ? (
                <p className="muted">No reliable content topics were detected from the approved campaign and strategy evidence.</p>
              ) : (
                <>
                  <div className="form-inline">
                    <div className="field" style={{ marginBottom: 0 }}>
                      <select value={topicTierFilter} onChange={(e) => setTopicTierFilter(e.target.value)}>
                        <option value="">All tiers</option>
                        {TOPIC_TIER_ORDER.map((t) => (
                          <option key={t} value={t}>
                            {labelize(t)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <select value={topicChannelFilter} onChange={(e) => setTopicChannelFilter(e.target.value)}>
                        <option value="">All channels</option>
                        {topicChannels.map((c) => (
                          <option key={c} value={c}>
                            {labelize(c)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <select value={topicFunnelStageFilter} onChange={(e) => setTopicFunnelStageFilter(e.target.value)}>
                        <option value="">All funnel stages</option>
                        {topicFunnelStages.map((s) => (
                          <option key={s} value={s}>
                            {labelize(s)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {TOPIC_TIER_ORDER.filter((tier) => filteredTopics.some((t) => t.tier === tier)).map((tier) => {
                    const tierTopics = filteredTopics.filter((t) => t.tier === tier).sort((a, b) => b.priorityScore - a.priorityScore);
                    const cap = TOPIC_TIER_VISIBLE_CAP[tier];
                    const visibleTierTopics = tierTopics.slice(0, cap === Infinity ? tierTopics.length : cap);
                    const overflowCount = tierTopics.length - visibleTierTopics.length;
                    return (
                      <div key={tier} style={{ marginTop: 16 }}>
                        <h4 style={{ marginBottom: 8 }}>
                          {labelize(tier)} ({tierTopics.length})
                        </h4>
                        <div className="grid-cards">
                          {visibleTierTopics.map((topic) => (
                            <Card key={topic.id} className="entity-card">
                              <div className="entity-card-header">
                                <h3>{topic.title}</h3>
                                {tier === 'primary' && <span className="tag">Primary</span>}
                              </div>
                              <div className="tag-list">
                                <span className={`quality-badge ${qualityBadgeClass(scoreQuality(topic.priorityScore))}`}>Priority {topic.priorityScore}</span>
                                <span className="tag">Confidence {topic.confidenceScore}</span>
                                <span className="tag">{topic.relatedIdeaIds.length} supporting idea{topic.relatedIdeaIds.length === 1 ? '' : 's'}</span>
                              </div>
                              {topic.channels.length > 0 && <div className="entity-card-meta">Channels: {topic.channels.map((c) => labelize(c)).join(', ')}</div>}
                              {topic.funnelStages.length > 0 && <div className="entity-card-meta">Funnel: {topic.funnelStages.map((s) => labelize(s)).join(', ')}</div>}
                              {topic.audienceSegmentIds.length > 0 && (
                                <div className="entity-card-meta">Audience: {topic.audienceSegmentIds.map((id) => audienceLabel(mapping, id)).join(', ')}</div>
                              )}
                              <details style={{ marginTop: 6 }}>
                                <summary className="summary-label" style={{ cursor: 'pointer' }}>
                                  Details
                                </summary>
                                <div style={{ marginTop: 8 }}>
                                  {topic.keywords.length > 0 && (
                                    <>
                                      <span className="summary-label">Keywords</span>
                                      <div className="tag-list">
                                        {topic.keywords.map((k, i) => (
                                          <span className="tag" key={i}>
                                            {k}
                                          </span>
                                        ))}
                                      </div>
                                    </>
                                  )}
                                  {topic.intentTypes.length > 0 && (
                                    <>
                                      <span className="summary-label">Intent Types</span>
                                      <div className="tag-list">
                                        {topic.intentTypes.map((t, i) => (
                                          <span className="tag" key={i}>
                                            {labelize(t)}
                                          </span>
                                        ))}
                                      </div>
                                    </>
                                  )}
                                  <span className="summary-label">Supporting Ideas</span>
                                  <ul className="bullet-list">
                                    {topic.relatedIdeaIds.map((id) => (
                                      <li key={id}>{ideaTitleById.get(id) ?? id}</li>
                                    ))}
                                  </ul>
                                  {topic.reasons.length > 0 && (
                                    <>
                                      <span className="summary-label">Reasons</span>
                                      <ul className="bullet-list">
                                        {topic.reasons.map((r, i) => (
                                          <li key={i}>{r}</li>
                                        ))}
                                      </ul>
                                    </>
                                  )}
                                  {topic.weaknesses.length > 0 && (
                                    <>
                                      <span className="summary-label">Weaknesses</span>
                                      <ul className="bullet-list">
                                        {topic.weaknesses.map((w, i) => (
                                          <li key={i}>{w}</li>
                                        ))}
                                      </ul>
                                    </>
                                  )}
                                  {topic.warnings.length > 0 && <div className="content-warning" style={{ marginTop: 8 }}>{topic.warnings.join(' ')}</div>}
                                </div>
                              </details>
                            </Card>
                          ))}
                        </div>
                        {overflowCount > 0 && <p className="muted" style={{ marginTop: 8 }}>{overflowCount} more {labelize(tier).toLowerCase()} topic{overflowCount === 1 ? '' : 's'} not shown.</p>}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>

        <div className="section">
          <h3 className="section-title">Content Pillars</h3>

          <ErrorMessage message={pillarPlanError} />

          {!pillarPlan && !pillarPlanBusy && <p className="muted">No campaign content pillars have been built yet.</p>}

          <button className="btn btn-primary" onClick={handleBuildContentPillars} disabled={pillarPlanBusy}>
            {pillarPlanBusy ? 'Building content pillars...' : pillarPlan ? 'Rebuild Content Pillars' : 'Build Content Pillars'}
          </button>

          {pillarPlan && (
            <div style={{ marginTop: 16 }}>
              <div className="summary-grid" style={{ marginBottom: 16 }}>
                <div>
                  <span className="summary-label">Total Pillars</span>
                  <p>{pillarPlan.pillars.length}</p>
                </div>
                <div>
                  <span className="summary-label">Primary</span>
                  <p>{pillarPlan.pillars.filter((p) => p.tier === 'primary').length}</p>
                </div>
                <div>
                  <span className="summary-label">Supporting</span>
                  <p>{pillarPlan.pillars.filter((p) => p.tier === 'supporting').length}</p>
                </div>
                <div>
                  <span className="summary-label">Experimental</span>
                  <p>{pillarPlan.pillars.filter((p) => p.tier === 'experimental').length}</p>
                </div>
                <div>
                  <span className="summary-label">Overall Confidence</span>
                  <p>{pillarPlan.confidenceScore}</p>
                </div>
              </div>

              {(pillarMissingEvidence.length > 0 || pillarWarnings.length > 0) && (
                <div className="content-warning" style={{ marginBottom: 16 }}>
                  {[...pillarMissingEvidence, ...pillarWarnings].join(' ')}
                </div>
              )}

              {pillarPlan.pillars.length === 0 ? (
                <p className="muted">No reliable content pillars were detected from the approved campaign and strategy evidence.</p>
              ) : (
                PILLAR_TIER_ORDER.filter((tier) => pillarPlan.pillars.some((p) => p.tier === tier)).map((tier) => {
                  const tierPillars = pillarPlan.pillars.filter((p) => p.tier === tier).sort((a, b) => b.priorityScore - a.priorityScore);
                  return (
                    <div key={tier} style={{ marginTop: 16 }}>
                      <h4 style={{ marginBottom: 8 }}>
                        {labelize(tier)} ({tierPillars.length})
                      </h4>
                      <div className="grid-cards">
                        {tierPillars.map((pillar) => (
                          <Card key={pillar.id} className="entity-card">
                            <div className="entity-card-header">
                              <h3>{pillar.title}</h3>
                              {tier === 'primary' && <span className="tag">Primary</span>}
                            </div>
                            <div className="tag-list">
                              <span className="tag">{labelize(pillar.theme)}</span>
                              <span className={`quality-badge ${qualityBadgeClass(scoreQuality(pillar.priorityScore))}`}>Priority {pillar.priorityScore}</span>
                              <span className="tag">Confidence {pillar.confidenceScore}</span>
                              <span className="tag">
                                {pillar.topicIds.length} topic{pillar.topicIds.length === 1 ? '' : 's'}
                              </span>
                            </div>
                            <p className="entity-card-meta">{pillar.purpose}</p>
                            {pillar.channels.length > 0 && <div className="entity-card-meta">Channels: {pillar.channels.map((c) => labelize(c)).join(', ')}</div>}
                            {pillar.funnelStages.length > 0 && <div className="entity-card-meta">Funnel: {pillar.funnelStages.map((s) => labelize(s)).join(', ')}</div>}
                            {pillar.audienceSegmentIds.length > 0 && (
                              <div className="entity-card-meta">Audience: {pillar.audienceSegmentIds.map((id) => audienceLabel(mapping, id)).join(', ')}</div>
                            )}
                            <details style={{ marginTop: 6 }}>
                              <summary className="summary-label" style={{ cursor: 'pointer' }}>
                                Details
                              </summary>
                              <div style={{ marginTop: 8 }}>
                                {pillar.keywords.length > 0 && (
                                  <>
                                    <span className="summary-label">Keywords</span>
                                    <div className="tag-list">
                                      {pillar.keywords.map((k, i) => (
                                        <span className="tag" key={i}>
                                          {k}
                                        </span>
                                      ))}
                                    </div>
                                  </>
                                )}
                                {pillar.intentTypes.length > 0 && (
                                  <>
                                    <span className="summary-label">Intent Types</span>
                                    <div className="tag-list">
                                      {pillar.intentTypes.map((t, i) => (
                                        <span className="tag" key={i}>
                                          {labelize(t)}
                                        </span>
                                      ))}
                                    </div>
                                  </>
                                )}
                                <span className="summary-label">Member Topics</span>
                                <ul className="bullet-list">
                                  {pillar.topicIds.map((id) => (
                                    <li key={id}>{topicTitleById.get(id) ?? id}</li>
                                  ))}
                                </ul>
                                {pillar.reasons.length > 0 && (
                                  <>
                                    <span className="summary-label">Reasons</span>
                                    <ul className="bullet-list">
                                      {pillar.reasons.map((r, i) => (
                                        <li key={i}>{r}</li>
                                      ))}
                                    </ul>
                                  </>
                                )}
                                {pillar.weaknesses.length > 0 && (
                                  <>
                                    <span className="summary-label">Weaknesses</span>
                                    <ul className="bullet-list">
                                      {pillar.weaknesses.map((w, i) => (
                                        <li key={i}>{w}</li>
                                      ))}
                                    </ul>
                                  </>
                                )}
                                {pillar.warnings.length > 0 && <div className="content-warning" style={{ marginTop: 8 }}>{pillar.warnings.join(' ')}</div>}
                              </div>
                            </details>
                          </Card>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div className="section">
          <h3 className="section-title">Blog Calendar</h3>

          <ErrorMessage message={blogCalendarError} />

          {!blogCalendar && !blogCalendarBusy && <p className="muted">No blog calendar has been built yet.</p>}

          <button className="btn btn-primary" onClick={handleBuildBlogCalendar} disabled={blogCalendarBusy}>
            {blogCalendarBusy ? 'Building blog calendar...' : blogCalendar ? 'Rebuild Blog Calendar' : 'Build Blog Calendar'}
          </button>

          {blogCalendar && (
            <div style={{ marginTop: 16 }}>
              <div className="summary-grid" style={{ marginBottom: 16 }}>
                <div>
                  <span className="summary-label">Total Blog Items</span>
                  <p>{blogCalendar.items.length}</p>
                </div>
                <div>
                  <span className="summary-label">Overall Confidence</span>
                  <p>{blogCalendar.confidenceScore}</p>
                </div>
                <div>
                  <span className="summary-label">Top Priority Items</span>
                  <p>{blogCalendar.topPriorityItemIds.length}</p>
                </div>
                <div>
                  <span className="summary-label">Weeks Represented</span>
                  <p>{blogCalendar.weeks.map((w) => `Week ${w.week}`).join(', ') || '-'}</p>
                </div>
                <div>
                  <span className="summary-label">Funnel Stages Represented</span>
                  <p>{blogFunnelStages.length ? blogFunnelStages.map((s) => labelize(s)).join(', ') : '-'}</p>
                </div>
              </div>

              {(blogCalendarMissingEvidence.length > 0 || blogCalendarWarnings.length > 0) && (
                <div className="content-warning" style={{ marginBottom: 16 }}>
                  {[...blogCalendarMissingEvidence, ...blogCalendarWarnings].join(' ')}
                </div>
              )}

              {blogCalendar.items.length === 0 ? (
                <p className="muted">No reliable blog calendar was detected for the current campaign channels and content strategy.</p>
              ) : (
                blogCalendar.weeks.map((week) => {
                  const weekItems = week.itemIds.map((id) => blogCalendar.items.find((i) => i.id === id)).filter((i): i is NonNullable<typeof i> => !!i);
                  return (
                    <div className="calendar-week" key={week.week}>
                      <div className="calendar-week-header">
                        <div>
                          <strong>
                            Week {week.week} &mdash; {week.theme}
                          </strong>
                        </div>
                        <div className="entity-card-meta">
                          {weekItems.length} item{weekItems.length === 1 ? '' : 's'} &middot; Confidence {week.confidenceScore}
                        </div>
                      </div>
                      <div className="calendar-days">
                        {weekItems.map((item) => {
                          const actualDate = actualDateForDay(campaign.startDate, item.day);
                          const dependencyTitles = item.dependencies.map((depId) => blogCalendar.items.find((i) => i.id === depId)?.title ?? depId);
                          return (
                            <div className="calendar-day" key={item.id}>
                              <div className="calendar-day-number">
                                Day {item.day}
                                {actualDate ? ` · ${actualDate}` : ''}
                              </div>
                              <div className="activity-card">
                                <div className="activity-card-title">{item.title}</div>
                                <div className="tag-list">
                                  <span className="tag">{labelize(item.type)}</span>
                                  <span className="tag">{labelize(item.funnelStage)}</span>
                                  <span className={`quality-badge ${qualityBadgeClass(scoreQuality(item.priorityScore))}`}>Priority {item.priorityScore}</span>
                                </div>
                                <div className="entity-card-meta">Pillar: {pillarTitleById.get(item.pillarId) ?? item.pillarId}</div>
                                {item.audienceSegmentIds.length > 0 && (
                                  <div className="entity-card-meta">Audience: {item.audienceSegmentIds.map((id) => audienceLabel(mapping, id)).join(', ')}</div>
                                )}
                                {item.primaryKeyword && <div className="entity-card-meta">Primary keyword: {item.primaryKeyword}</div>}
                                {item.suggestedCTA && <div className="entity-card-meta">CTA: {item.suggestedCTA}</div>}
                                <details style={{ marginTop: 6 }}>
                                  <summary className="summary-label" style={{ cursor: 'pointer' }}>
                                    Details
                                  </summary>
                                  <div style={{ marginTop: 8 }}>
                                    <span className="summary-label">Angle</span>
                                    <p>{item.angle}</p>
                                    {item.supportingKeywords.length > 0 && (
                                      <>
                                        <span className="summary-label">Supporting Keywords</span>
                                        <div className="tag-list">
                                          {item.supportingKeywords.map((k, i) => (
                                            <span className="tag" key={i}>
                                              {k}
                                            </span>
                                          ))}
                                        </div>
                                      </>
                                    )}
                                    {item.intentTypes.length > 0 && (
                                      <>
                                        <span className="summary-label">Intent Types</span>
                                        <div className="tag-list">
                                          {item.intentTypes.map((t, i) => (
                                            <span className="tag" key={i}>
                                              {labelize(t)}
                                            </span>
                                          ))}
                                        </div>
                                      </>
                                    )}
                                    {dependencyTitles.length > 0 && (
                                      <>
                                        <span className="summary-label">Depends On</span>
                                        <ul className="bullet-list">
                                          {dependencyTitles.map((t, i) => (
                                            <li key={i}>{t}</li>
                                          ))}
                                        </ul>
                                      </>
                                    )}
                                    {item.relatedCampaignActivityIds.length > 0 && (
                                      <>
                                        <span className="summary-label">Related Campaign Activities</span>
                                        <p className="entity-card-meta">{item.relatedCampaignActivityIds.join(', ')}</p>
                                      </>
                                    )}
                                    {item.successSignals.length > 0 && (
                                      <>
                                        <span className="summary-label">Success Signals</span>
                                        <div className="tag-list">
                                          {item.successSignals.map((s, i) => (
                                            <span className="tag" key={i}>
                                              {s}
                                            </span>
                                          ))}
                                        </div>
                                      </>
                                    )}
                                    {item.reasons.length > 0 && (
                                      <>
                                        <span className="summary-label">Reasons</span>
                                        <ul className="bullet-list">
                                          {item.reasons.map((r, i) => (
                                            <li key={i}>{r}</li>
                                          ))}
                                        </ul>
                                      </>
                                    )}
                                    {item.warnings.length > 0 && <div className="content-warning" style={{ marginTop: 8 }}>{item.warnings.join(' ')}</div>}
                                  </div>
                                </details>

                                <div style={{ marginTop: 10 }}>
                                  <ErrorMessage message={blogDraftErrors[item.id] ?? null} />
                                  {!blogDrafts[item.id] && <p className="entity-card-meta">AI generation uses your configured provider and may incur usage cost.</p>}
                                  <button
                                    className="btn btn-secondary"
                                    onClick={() => handleGenerateBlogDraft(item.id, !!blogDrafts[item.id])}
                                    disabled={!!blogDraftBusyIds[item.id]}
                                  >
                                    {blogDraftBusyIds[item.id] ? 'Generating draft...' : blogDrafts[item.id] ? 'Regenerate Draft' : 'Generate Draft'}
                                  </button>

                                  {blogDrafts[item.id] && (
                                    <div style={{ marginTop: 10 }}>
                                      <div className="tag-list">
                                        <span className="tag">{blogDrafts[item.id].wordCount} words</span>
                                        <span className="tag">{blogDrafts[item.id].provider} / {blogDrafts[item.id].model}</span>
                                        {blogDrafts[item.id].usage.totalTokens !== undefined && <span className="tag">{blogDrafts[item.id].usage.totalTokens} tokens</span>}
                                        {blogDrafts[item.id].cost && <span className="tag">${blogDrafts[item.id].cost!.estimated.toFixed(4)} {blogDrafts[item.id].cost!.currency}</span>}
                                        <span className="tag">Prompt {blogDrafts[item.id].promptVersion}</span>
                                      </div>
                                      <div className="entity-card-meta">Generated {new Date(blogDrafts[item.id].generatedAt).toLocaleString()}</div>
                                      {blogDrafts[item.id].warnings.length > 0 && (
                                        <div className="content-warning" style={{ marginTop: 6 }}>{blogDrafts[item.id].warnings.join(' ')}</div>
                                      )}
                                      <pre
                                        style={{
                                          marginTop: 8,
                                          padding: 10,
                                          whiteSpace: 'pre-wrap',
                                          wordBreak: 'break-word',
                                          maxHeight: 320,
                                          overflowY: 'auto',
                                          background: 'var(--surface-muted, #f5f5f5)',
                                          borderRadius: 6,
                                        }}
                                      >
                                        {blogDrafts[item.id].content}
                                      </pre>
                                      <button className="btn btn-secondary" style={{ marginTop: 6 }} onClick={() => handleCopyBlogDraft(blogDrafts[item.id].content)}>
                                        Copy Draft
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div className="section">
          <h3 className="section-title">Social Calendar</h3>

          <ErrorMessage message={socialCalendarError} />

          {!socialCalendar && !socialCalendarBusy && <p className="muted">No social calendar has been built yet.</p>}

          <button className="btn btn-primary" onClick={handleBuildSocialCalendar} disabled={socialCalendarBusy}>
            {socialCalendarBusy ? 'Building social calendar...' : socialCalendar ? 'Rebuild Social Calendar' : 'Build Social Calendar'}
          </button>

          {socialCalendar && (
            <div style={{ marginTop: 16 }}>
              <div className="summary-grid" style={{ marginBottom: 16 }}>
                <div>
                  <span className="summary-label">Total Items</span>
                  <p>{socialCalendar.items.length}</p>
                </div>
                <div>
                  <span className="summary-label">Overall Confidence</span>
                  <p>{socialCalendar.confidenceScore}</p>
                </div>
                <div>
                  <span className="summary-label">Top Priority Items</span>
                  <p>{socialCalendar.topPriorityItemIds.length}</p>
                </div>
                <div>
                  <span className="summary-label">Weeks Represented</span>
                  <p>{socialCalendar.weeks.map((w) => `Week ${w.week}`).join(', ') || '-'}</p>
                </div>
                <div>
                  <span className="summary-label">Platforms Represented</span>
                  <p>{socialPlatforms.length ? socialPlatforms.map((p) => labelize(p)).join(', ') : '-'}</p>
                </div>
                <div>
                  <span className="summary-label">Funnel Stages Represented</span>
                  <p>{socialFunnelStages.length ? socialFunnelStages.map((s) => labelize(s)).join(', ') : '-'}</p>
                </div>
              </div>

              {(socialCalendarMissingEvidence.length > 0 || socialCalendarWarnings.length > 0) && (
                <div className="content-warning" style={{ marginBottom: 16 }}>
                  {[...socialCalendarMissingEvidence, ...socialCalendarWarnings].join(' ')}
                </div>
              )}

              {socialCalendar.items.length === 0 ? (
                <p className="muted">No reliable social content directions were detected from the approved campaign and strategy evidence.</p>
              ) : (
                <>
                  <div className="form-inline">
                    <div className="field" style={{ marginBottom: 0 }}>
                      <select value={socialPlatformFilter} onChange={(e) => setSocialPlatformFilter(e.target.value)}>
                        <option value="">All platforms</option>
                        {socialPlatforms.map((p) => (
                          <option key={p} value={p}>
                            {labelize(p)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <select value={socialTypeFilter} onChange={(e) => setSocialTypeFilter(e.target.value)}>
                        <option value="">All content types</option>
                        {socialTypes.map((t) => (
                          <option key={t} value={t}>
                            {labelize(t)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <select value={socialFunnelStageFilter} onChange={(e) => setSocialFunnelStageFilter(e.target.value)}>
                        <option value="">All funnel stages</option>
                        {socialFunnelStages.map((s) => (
                          <option key={s} value={s}>
                            {labelize(s)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {filteredSocialWeeks.map((week) => {
                    const weekItems = week.itemIds.map((id) => socialCalendar.items.find((i) => i.id === id)).filter((i): i is NonNullable<typeof i> => !!i);
                    return (
                      <div className="calendar-week" key={week.week}>
                        <div className="calendar-week-header">
                          <div>
                            <strong>
                              Week {week.week} &mdash; {week.theme}
                            </strong>
                          </div>
                          <div className="entity-card-meta">
                            {weekItems.length} item{weekItems.length === 1 ? '' : 's'} &middot; Confidence {week.confidenceScore}
                          </div>
                        </div>
                        <div className="calendar-days">
                          {weekItems.map((item) => {
                            const actualDate = actualDateForDay(campaign.startDate, item.day);
                            return (
                              <div className="calendar-day" key={item.id}>
                                <div className="calendar-day-number">
                                  Day {item.day}
                                  {actualDate ? ` · ${actualDate}` : ''}
                                </div>
                                <div className="activity-card">
                                  <div className="activity-card-title">{item.title}</div>
                                  <div className="tag-list">
                                    <span className="tag">{labelize(item.type)}</span>
                                    <span className="tag">{labelize(item.platform)}</span>
                                    <span className="tag">{labelize(item.recommendedFormat)}</span>
                                    <span className={`quality-badge ${qualityBadgeClass(scoreQuality(item.priorityScore))}`}>Priority {item.priorityScore}</span>
                                  </div>
                                  {item.sourceBlogItemId && (
                                    <div className="entity-card-meta">Repurposed from Blog Calendar: {blogTitleById.get(item.sourceBlogItemId) ?? item.sourceBlogItemId}</div>
                                  )}
                                  {item.audienceSegmentIds.length > 0 && (
                                    <div className="entity-card-meta">Audience: {item.audienceSegmentIds.map((id) => audienceLabel(mapping, id)).join(', ')}</div>
                                  )}
                                  {item.suggestedCTA && <div className="entity-card-meta">CTA: {item.suggestedCTA}</div>}
                                  <details style={{ marginTop: 6 }}>
                                    <summary className="summary-label" style={{ cursor: 'pointer' }}>
                                      Details
                                    </summary>
                                    <div style={{ marginTop: 8 }}>
                                      <span className="summary-label">Angle</span>
                                      <p>{item.angle}</p>
                                      {item.messagingPillarIds.length > 0 && (
                                        <>
                                          <span className="summary-label">Messaging Pillars</span>
                                          <p className="entity-card-meta">{item.messagingPillarIds.join(', ')}</p>
                                        </>
                                      )}
                                      {item.keywords.length > 0 && (
                                        <>
                                          <span className="summary-label">Keywords</span>
                                          <div className="tag-list">
                                            {item.keywords.map((k, i) => (
                                              <span className="tag" key={i}>
                                                {k}
                                              </span>
                                            ))}
                                          </div>
                                        </>
                                      )}
                                      {item.relatedCampaignActivityIds.length > 0 && (
                                        <>
                                          <span className="summary-label">Related Campaign Activities</span>
                                          <p className="entity-card-meta">{item.relatedCampaignActivityIds.join(', ')}</p>
                                        </>
                                      )}
                                      {item.dependencies.length > 0 && (
                                        <>
                                          <span className="summary-label">Dependencies</span>
                                          <p className="entity-card-meta">{item.dependencies.join(', ')}</p>
                                        </>
                                      )}
                                      {item.successSignals.length > 0 && (
                                        <>
                                          <span className="summary-label">Success Signals</span>
                                          <div className="tag-list">
                                            {item.successSignals.map((s, i) => (
                                              <span className="tag" key={i}>
                                                {s}
                                              </span>
                                            ))}
                                          </div>
                                        </>
                                      )}
                                      {item.reasons.length > 0 && (
                                        <>
                                          <span className="summary-label">Reasons</span>
                                          <ul className="bullet-list">
                                            {item.reasons.map((r, i) => (
                                              <li key={i}>{r}</li>
                                            ))}
                                          </ul>
                                        </>
                                      )}
                                      {item.warnings.length > 0 && <div className="content-warning" style={{ marginTop: 8 }}>{item.warnings.join(' ')}</div>}
                                    </div>
                                  </details>

                                  {(() => {
                                    const isLinkedInEligible = item.platform !== 'facebook' && item.platform !== 'instagram' && item.platform !== 'x';
                                    if (!isLinkedInEligible) return null;
                                    const linkedInOptions = getLinkedInOptions(item);
                                    const draft = linkedInDrafts[item.id];
                                    return (
                                      <div style={{ marginTop: 10 }}>
                                        {item.platform === 'generic_social' && (
                                          <p className="entity-card-meta">LinkedIn is being chosen as the generation target; this social item was planned generically.</p>
                                        )}
                                        <ErrorMessage message={linkedInErrors[item.id] ?? null} />
                                        {!draft && <p className="entity-card-meta">AI generation uses your configured provider and may incur usage cost.</p>}

                                        <div className="form-inline">
                                          <div className="field" style={{ marginBottom: 0 }}>
                                            <select value={linkedInOptions.tone} onChange={(e) => updateLinkedInOptions(item, { tone: e.target.value as LinkedInGenerationOptions['tone'] })}>
                                              <option value="professional">Professional</option>
                                              <option value="conversational">Conversational</option>
                                              <option value="thought_leadership">Thought Leadership</option>
                                            </select>
                                          </div>
                                          <div className="field" style={{ marginBottom: 0 }}>
                                            <select value={linkedInOptions.length} onChange={(e) => updateLinkedInOptions(item, { length: e.target.value as LinkedInGenerationOptions['length'] })}>
                                              <option value="short">Short</option>
                                              <option value="medium">Medium</option>
                                              <option value="long">Long</option>
                                            </select>
                                          </div>
                                          <label className="entity-card-meta" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <input type="checkbox" checked={!!linkedInOptions.includeCTA} onChange={(e) => updateLinkedInOptions(item, { includeCTA: e.target.checked })} />
                                            Include CTA
                                          </label>
                                          <label className="entity-card-meta" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <input type="checkbox" checked={!!linkedInOptions.includeHashtags} onChange={(e) => updateLinkedInOptions(item, { includeHashtags: e.target.checked })} />
                                            Include hashtags
                                          </label>
                                          {linkedInOptions.includeHashtags && (
                                            <div className="field" style={{ marginBottom: 0 }}>
                                              <select value={linkedInOptions.maxHashtags} onChange={(e) => updateLinkedInOptions(item, { maxHashtags: Number(e.target.value) })}>
                                                {[1, 2, 3, 4, 5].map((n) => (
                                                  <option key={n} value={n}>
                                                    Max {n} hashtag{n === 1 ? '' : 's'}
                                                  </option>
                                                ))}
                                              </select>
                                            </div>
                                          )}
                                        </div>

                                        <button className="btn btn-secondary" onClick={() => handleGenerateLinkedInDraft(item, !!draft)} disabled={!!linkedInBusyIds[item.id]}>
                                          {linkedInBusyIds[item.id] ? 'Generating draft...' : draft ? 'Regenerate LinkedIn Draft' : 'Generate LinkedIn'}
                                        </button>

                                        {draft && (
                                          <div style={{ marginTop: 10 }}>
                                            <div className="tag-list">
                                              <span className="tag">{draft.characterCount} chars</span>
                                              <span className="tag">{draft.wordCount} words</span>
                                              <span className="tag">{labelize(draft.tone)}</span>
                                              <span className="tag">{labelize(draft.length)}</span>
                                              <span className="tag">{draft.provider} / {draft.model}</span>
                                              {draft.usage.totalTokens !== undefined && <span className="tag">{draft.usage.totalTokens} tokens</span>}
                                              {draft.cost && <span className="tag">${draft.cost.estimated.toFixed(4)} {draft.cost.currency}</span>}
                                              <span className="tag">Prompt {draft.promptVersion}</span>
                                            </div>
                                            <div className="entity-card-meta">Generated {new Date(draft.generatedAt).toLocaleString()}</div>
                                            {draft.warnings.length > 0 && <div className="content-warning" style={{ marginTop: 6 }}>{draft.warnings.join(' ')}</div>}
                                            <pre
                                              style={{
                                                marginTop: 8,
                                                padding: 10,
                                                whiteSpace: 'pre-wrap',
                                                wordBreak: 'break-word',
                                                maxHeight: 320,
                                                overflowY: 'auto',
                                                background: 'var(--surface-muted, #f5f5f5)',
                                                borderRadius: 6,
                                              }}
                                            >
                                              {draft.content}
                                            </pre>
                                            <button className="btn btn-secondary" style={{ marginTop: 6 }} onClick={() => handleCopyLinkedInDraft(draft.content)}>
                                              Copy Post
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>

        <div className="section">
          <h3 className="section-title">Video Calendar</h3>

          <ErrorMessage message={videoCalendarError} />

          {!videoCalendar && !videoCalendarBusy && <p className="muted">No video calendar has been built yet.</p>}

          <button className="btn btn-primary" onClick={handleBuildVideoCalendar} disabled={videoCalendarBusy}>
            {videoCalendarBusy ? 'Building video calendar...' : videoCalendar ? 'Rebuild Video Calendar' : 'Build Video Calendar'}
          </button>

          {videoCalendar && (
            <div style={{ marginTop: 16 }}>
              <div className="summary-grid" style={{ marginBottom: 16 }}>
                <div>
                  <span className="summary-label">Total Items</span>
                  <p>{videoCalendar.items.length}</p>
                </div>
                <div>
                  <span className="summary-label">Overall Confidence</span>
                  <p>{videoCalendar.confidenceScore}</p>
                </div>
                <div>
                  <span className="summary-label">Top Priority Items</span>
                  <p>{videoCalendar.topPriorityItemIds.length}</p>
                </div>
                <div>
                  <span className="summary-label">Weeks Represented</span>
                  <p>{videoCalendar.weeks.map((w) => `Week ${w.week}`).join(', ') || '-'}</p>
                </div>
                <div>
                  <span className="summary-label">Format Directions Represented</span>
                  <p>{videoFormats.length ? videoFormats.map((f) => labelize(f)).join(', ') : '-'}</p>
                </div>
                <div>
                  <span className="summary-label">Funnel Stages Represented</span>
                  <p>{videoFunnelStages.length ? videoFunnelStages.map((s) => labelize(s)).join(', ') : '-'}</p>
                </div>
              </div>

              {(videoCalendarMissingEvidence.length > 0 || videoCalendarWarnings.length > 0) && (
                <div className="content-warning" style={{ marginBottom: 16 }}>
                  {[...videoCalendarMissingEvidence, ...videoCalendarWarnings].join(' ')}
                </div>
              )}

              {videoCalendar.items.length === 0 ? (
                <p className="muted">No reliable video calendar was detected from the current campaign channels, formats, and content evidence.</p>
              ) : (
                <>
                  <div className="form-inline">
                    <div className="field" style={{ marginBottom: 0 }}>
                      <select value={videoTypeFilter} onChange={(e) => setVideoTypeFilter(e.target.value)}>
                        <option value="">All content types</option>
                        {videoTypes.map((t) => (
                          <option key={t} value={t}>
                            {labelize(t)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <select value={videoFormatFilter} onChange={(e) => setVideoFormatFilter(e.target.value)}>
                        <option value="">All formats</option>
                        {videoFormats.map((f) => (
                          <option key={f} value={f}>
                            {labelize(f)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <select value={videoFunnelStageFilter} onChange={(e) => setVideoFunnelStageFilter(e.target.value)}>
                        <option value="">All funnel stages</option>
                        {videoFunnelStages.map((s) => (
                          <option key={s} value={s}>
                            {labelize(s)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {filteredVideoWeeks.map((week) => {
                    const weekItems = week.itemIds.map((id) => videoCalendar.items.find((i) => i.id === id)).filter((i): i is NonNullable<typeof i> => !!i);
                    return (
                      <div className="calendar-week" key={week.week}>
                        <div className="calendar-week-header">
                          <div>
                            <strong>
                              Week {week.week} &mdash; {week.theme}
                            </strong>
                          </div>
                          <div className="entity-card-meta">
                            {weekItems.length} item{weekItems.length === 1 ? '' : 's'} &middot; Confidence {week.confidenceScore}
                          </div>
                        </div>
                        <div className="calendar-days">
                          {weekItems.map((item) => {
                            const actualDate = actualDateForDay(campaign.startDate, item.day);
                            return (
                              <div className="calendar-day" key={item.id}>
                                <div className="calendar-day-number">
                                  Day {item.day}
                                  {actualDate ? ` · ${actualDate}` : ''}
                                </div>
                                <div className="activity-card">
                                  <div className="activity-card-title">{item.title}</div>
                                  <div className="tag-list">
                                    <span className="tag">{labelize(item.type)}</span>
                                    <span className="tag">{labelize(item.formatDirection)}</span>
                                    <span className={`quality-badge ${qualityBadgeClass(scoreQuality(item.priorityScore))}`}>Priority {item.priorityScore}</span>
                                  </div>
                                  <div className="entity-card-meta">Pillar: {pillarTitleById.get(item.pillarId) ?? item.pillarId}</div>
                                  {item.topicId && <div className="entity-card-meta">Topic: {topicTitleById.get(item.topicId) ?? item.topicId}</div>}
                                  {item.sourceBlogItemId && (
                                    <div className="entity-card-meta">Repurposed from Blog: {blogTitleById.get(item.sourceBlogItemId) ?? item.sourceBlogItemId}</div>
                                  )}
                                  {item.sourceSocialItemId && (
                                    <div className="entity-card-meta">Repurposed from Social: {socialTitleById.get(item.sourceSocialItemId) ?? item.sourceSocialItemId}</div>
                                  )}
                                  {item.audienceSegmentIds.length > 0 && (
                                    <div className="entity-card-meta">Audience: {item.audienceSegmentIds.map((id) => audienceLabel(mapping, id)).join(', ')}</div>
                                  )}
                                  {item.suggestedCTA && <div className="entity-card-meta">CTA: {item.suggestedCTA}</div>}
                                  <details style={{ marginTop: 6 }}>
                                    <summary className="summary-label" style={{ cursor: 'pointer' }}>
                                      Details
                                    </summary>
                                    <div style={{ marginTop: 8 }}>
                                      <span className="summary-label">Angle</span>
                                      <p>{item.angle}</p>
                                      {item.messagingPillarIds.length > 0 && (
                                        <>
                                          <span className="summary-label">Messaging Pillars</span>
                                          <p className="entity-card-meta">{item.messagingPillarIds.join(', ')}</p>
                                        </>
                                      )}
                                      {item.keywords.length > 0 && (
                                        <>
                                          <span className="summary-label">Keywords</span>
                                          <div className="tag-list">
                                            {item.keywords.map((k, i) => (
                                              <span className="tag" key={i}>
                                                {k}
                                              </span>
                                            ))}
                                          </div>
                                        </>
                                      )}
                                      {item.relatedCampaignActivityIds.length > 0 && (
                                        <>
                                          <span className="summary-label">Related Campaign Activities</span>
                                          <p className="entity-card-meta">{item.relatedCampaignActivityIds.join(', ')}</p>
                                        </>
                                      )}
                                      {item.dependencies.length > 0 && (
                                        <>
                                          <span className="summary-label">Dependencies</span>
                                          <p className="entity-card-meta">{item.dependencies.join(', ')}</p>
                                        </>
                                      )}
                                      {item.successSignals.length > 0 && (
                                        <>
                                          <span className="summary-label">Success Signals</span>
                                          <div className="tag-list">
                                            {item.successSignals.map((s, i) => (
                                              <span className="tag" key={i}>
                                                {s}
                                              </span>
                                            ))}
                                          </div>
                                        </>
                                      )}
                                      {item.reasons.length > 0 && (
                                        <>
                                          <span className="summary-label">Reasons</span>
                                          <ul className="bullet-list">
                                            {item.reasons.map((r, i) => (
                                              <li key={i}>{r}</li>
                                            ))}
                                          </ul>
                                        </>
                                      )}
                                      {item.warnings.length > 0 && <div className="content-warning" style={{ marginTop: 8 }}>{item.warnings.join(' ')}</div>}
                                    </div>
                                  </details>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>

        <div className="section">
          <h3 className="section-title">Cross-Channel Repurposing</h3>

          <ErrorMessage message={repurposingError} />

          {!repurposingPlan && !repurposingBusy && <p className="muted">No cross-channel repurposing plan has been built yet.</p>}

          <button className="btn btn-primary" onClick={handleBuildRepurposingPlan} disabled={repurposingBusy}>
            {repurposingBusy ? 'Building cross-channel repurposing plan...' : repurposingPlan ? 'Rebuild Repurposing Plan' : 'Build Repurposing Plan'}
          </button>

          {repurposingPlan && (
            <div style={{ marginTop: 16 }}>
              <div className="summary-grid" style={{ marginBottom: 16 }}>
                <div>
                  <span className="summary-label">Total Repurposing Items</span>
                  <p>{repurposingPlan.items.length}</p>
                </div>
                <div>
                  <span className="summary-label">Repurposing Chains</span>
                  <p>{repurposingPlan.chains.length}</p>
                </div>
                <div>
                  <span className="summary-label">Overall Confidence</span>
                  <p>{repurposingPlan.confidenceScore}</p>
                </div>
                <div>
                  <span className="summary-label">Top Priority Items</span>
                  <p>{repurposingPlan.topPriorityItemIds.length}</p>
                </div>
                <div>
                  <span className="summary-label">Existing Calendar Linkages</span>
                  <p>{repurposingPlan.items.filter((i) => i.isExistingLinkage).length}</p>
                </div>
                <div>
                  <span className="summary-label">Target Channels Represented</span>
                  <p>{repurposingTargetTypes.length ? repurposingTargetTypes.map((t) => labelize(t)).join(', ') : '-'}</p>
                </div>
              </div>

              {(repurposingMissingEvidence.length > 0 || repurposingWarnings.length > 0) && (
                <div className="content-warning" style={{ marginBottom: 16 }}>
                  {[...repurposingMissingEvidence, ...repurposingWarnings].join(' ')}
                </div>
              )}

              {repurposingPlan.items.length === 0 ? (
                <p className="muted">No reliable cross-channel repurposing opportunities were detected from the current calendars and campaign channels.</p>
              ) : (
                <>
                  <div className="form-inline">
                    <div className="field" style={{ marginBottom: 0 }}>
                      <select value={repurposingSourceFilter} onChange={(e) => setRepurposingSourceFilter(e.target.value)}>
                        <option value="">All source types</option>
                        {repurposingSourceTypes.map((t) => (
                          <option key={t} value={t}>
                            {labelize(t)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <select value={repurposingTargetFilter} onChange={(e) => setRepurposingTargetFilter(e.target.value)}>
                        <option value="">All target types</option>
                        {repurposingTargetTypes.map((t) => (
                          <option key={t} value={t}>
                            {labelize(t)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <select value={repurposingFunnelStageFilter} onChange={(e) => setRepurposingFunnelStageFilter(e.target.value)}>
                        <option value="">All funnel stages</option>
                        {repurposingFunnelStages.map((s) => (
                          <option key={s} value={s}>
                            {labelize(s)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <select value={repurposingView} onChange={(e) => setRepurposingView(e.target.value as 'chains' | 'items')}>
                        <option value="chains">Chain view</option>
                        <option value="items">Item view</option>
                      </select>
                    </div>
                  </div>

                  {filteredRepurposingChains.length === 0 && filteredRepurposingItems.length === 0 ? (
                    <p className="muted">No repurposing items match the selected filters.</p>
                  ) : repurposingView === 'chains' ? (
                    <div className="calendar-days">
                      {filteredRepurposingChains.map((chain) => {
                        const derivatives = chain.repurposingItemIds
                          .map((id) => repurposingPlan.items.find((i) => i.id === id))
                          .filter((i): i is NonNullable<typeof i> => !!i);
                        const sourceLabel = derivatives[0];
                        return (
                          <div className="activity-card" key={chain.id} style={{ minWidth: 320 }}>
                            <div className="activity-card-title">{chain.title}</div>
                            {sourceLabel && (
                              <div className="entity-card-meta">
                                Source: {labelize(sourceLabel.sourceType)} &mdash; {sourceLabel.sourceTitle}
                              </div>
                            )}
                            <div className="tag-list">
                              <span className={`quality-badge ${qualityBadgeClass(scoreQuality(chain.priorityScore))}`}>Priority {chain.priorityScore}</span>
                              <span className="tag">Confidence {chain.confidenceScore}</span>
                            </div>
                            <div style={{ marginTop: 8 }}>
                              {derivatives.map((item) => (
                                <div className="entity-card-meta" key={item.id} style={{ marginTop: 4 }}>
                                  &rarr; {labelize(item.targetType)} ({labelize(item.actionType)}): {item.targetTitle}
                                  {item.isExistingLinkage && <span className="tag" style={{ marginLeft: 6 }}>Existing calendar linkage</span>}
                                </div>
                              ))}
                            </div>
                            {chain.reasons.length > 0 && (
                              <details style={{ marginTop: 6 }}>
                                <summary className="summary-label" style={{ cursor: 'pointer' }}>
                                  Reasons
                                </summary>
                                <ul className="bullet-list">
                                  {chain.reasons.map((r, i) => (
                                    <li key={i}>{r}</li>
                                  ))}
                                </ul>
                              </details>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="calendar-days">
                      {filteredRepurposingItems.map((item) => (
                        <div className="activity-card" key={item.id} style={{ minWidth: 320 }}>
                          <div className="activity-card-title">{item.targetTitle}</div>
                          <div className="tag-list">
                            <span className="tag">{labelize(item.sourceType)} &rarr; {labelize(item.targetType)}</span>
                            <span className="tag">{labelize(item.actionType)}</span>
                            <span className="tag">{labelize(item.targetFormatDirection)}</span>
                            <span className={`quality-badge ${qualityBadgeClass(scoreQuality(item.priorityScore))}`}>Priority {item.priorityScore}</span>
                            {item.isExistingLinkage && <span className="tag">Existing calendar linkage</span>}
                          </div>
                          <div className="entity-card-meta">Source: {item.sourceTitle}</div>
                          {item.sourceDay && item.recommendedTargetDay && (
                            <div className="entity-card-meta">
                              Day {item.sourceDay} &rarr; Day {item.recommendedTargetDay}
                            </div>
                          )}
                          {item.audienceSegmentIds.length > 0 && (
                            <div className="entity-card-meta">Audience: {item.audienceSegmentIds.map((id) => audienceLabel(mapping, id)).join(', ')}</div>
                          )}
                          {item.suggestedCTA && <div className="entity-card-meta">CTA: {item.suggestedCTA}</div>}
                          <details style={{ marginTop: 6 }}>
                            <summary className="summary-label" style={{ cursor: 'pointer' }}>
                              Details
                            </summary>
                            <div style={{ marginTop: 8 }}>
                              {item.keywords.length > 0 && (
                                <>
                                  <span className="summary-label">Keywords</span>
                                  <div className="tag-list">
                                    {item.keywords.map((k, i) => (
                                      <span className="tag" key={i}>
                                        {k}
                                      </span>
                                    ))}
                                  </div>
                                </>
                              )}
                              {item.messagingPillarIds.length > 0 && (
                                <>
                                  <span className="summary-label">Messaging Pillars</span>
                                  <p className="entity-card-meta">{item.messagingPillarIds.join(', ')}</p>
                                </>
                              )}
                              {item.reasons.length > 0 && (
                                <>
                                  <span className="summary-label">Reasons</span>
                                  <ul className="bullet-list">
                                    {item.reasons.map((r, i) => (
                                      <li key={i}>{r}</li>
                                    ))}
                                  </ul>
                                </>
                              )}
                              {item.warnings.length > 0 && <div className="content-warning" style={{ marginTop: 8 }}>{item.warnings.join(' ')}</div>}
                            </div>
                          </details>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </Card>
    </AppLayout>
  );
}
