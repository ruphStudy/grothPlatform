import { type FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { Card } from '../components/Card';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import type { Campaign, CampaignActivity, CampaignAudienceChannelMapping, CampaignGoalType, CampaignStatus, CampaignType } from '../types';

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
                    Regenerating replaces the current plan and resets generated activity statuses to Planned.
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
    </AppLayout>
  );
}
