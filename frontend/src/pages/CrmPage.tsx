import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { Card } from '../components/Card';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import type { CrmBoardResponse, CrmDashboardResponse, CrmFollowUp, CrmFollowUpListResponse, CrmFollowUpType, CrmOpportunity, CrmPipeline, CrmStage } from '../types';

function labelize(value: string): string {
  return value.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function money(opportunity: CrmOpportunity): string {
  if (opportunity.amount === undefined || !opportunity.currency) return '-';
  return `${opportunity.currency} ${opportunity.amount}`;
}

function amountList(values?: { currency: string; amount: number }[]): string {
  if (!values?.length) return '-';
  return values.map((item) => `${item.currency} ${item.amount}`).join(', ');
}

function formatDate(value?: string): string {
  return value ? new Date(value).toLocaleString() : '-';
}

export default function CrmPage() {
  const { organizationId, productId } = useParams<{ organizationId: string; productId: string }>();
  const basePath = `/organizations/${organizationId}/products/${productId}`;
  const [pipelines, setPipelines] = useState<CrmPipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState('');
  const [board, setBoard] = useState<CrmBoardResponse | null>(null);
  const [dashboard, setDashboard] = useState<CrmDashboardResponse | null>(null);
  const [followUps, setFollowUps] = useState<CrmFollowUp[]>([]);
  const [selectedOpportunity, setSelectedOpportunity] = useState<CrmOpportunity | null>(null);
  const [note, setNote] = useState('');
  const [activityDraft, setActivityDraft] = useState({ type: 'call_logged', note: '', outcome: '' });
  const [followUpDraft, setFollowUpDraft] = useState({ type: 'call' as CrmFollowUpType, title: '', dueAt: '', assignedToUserId: '', description: '' });
  const [pipelineName, setPipelineName] = useState('');
  const [range, setRange] = useState('30d');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stages = useMemo(() => board?.stages ?? pipelines.find((pipeline) => pipeline.id === selectedPipelineId)?.stages ?? [], [board, pipelines, selectedPipelineId]);

  async function load() {
    if (!organizationId || !productId) return;
    setLoading(true);
    setError(null);
    try {
      await apiRequest(`${basePath}/crm/initialize`, { method: 'POST' });
      const loaded = await apiRequest<CrmPipeline[]>(`${basePath}/crm/pipelines`);
      setPipelines(loaded);
      const pipelineId = selectedPipelineId || loaded.find((pipeline) => pipeline.isDefault)?.id || loaded[0]?.id || '';
      setSelectedPipelineId(pipelineId);
      if (pipelineId) setBoard(await apiRequest<CrmBoardResponse>(`${basePath}/crm/pipelines/${pipelineId}/board`));
      const [dashboardData, followUpData] = await Promise.all([
        apiRequest<CrmDashboardResponse>(`${basePath}/crm/dashboard?range=${range}${pipelineId ? `&pipelineId=${pipelineId}` : ''}&timezone=UTC`),
        apiRequest<CrmFollowUpListResponse>(`${basePath}/crm/follow-ups?limit=50`),
      ]);
      setDashboard(dashboardData);
      setFollowUps(followUpData.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load CRM');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, productId, selectedPipelineId, range]);

  async function openOpportunity(id: string) {
    try {
      setSelectedOpportunity(await apiRequest<CrmOpportunity>(`${basePath}/crm/opportunities/${id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load opportunity');
    }
  }

  async function moveOpportunity(opportunity: CrmOpportunity, stageId: string) {
    setBusy(true);
    try {
      await apiRequest(`${basePath}/crm/opportunities/${opportunity.id}/move-stage`, { method: 'POST', body: { stageId } });
      await load();
      if (selectedOpportunity?.id === opportunity.id) await openOpportunity(opportunity.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to move opportunity');
    } finally {
      setBusy(false);
    }
  }

  async function mark(opportunity: CrmOpportunity, action: 'mark-won' | 'mark-lost') {
    const lostReason = action === 'mark-lost' ? window.prompt('Lost reason') ?? undefined : undefined;
    setBusy(true);
    try {
      await apiRequest(`${basePath}/crm/opportunities/${opportunity.id}/${action}`, { method: 'POST', body: { lostReason } });
      await load();
      await openOpportunity(opportunity.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update opportunity');
    } finally {
      setBusy(false);
    }
  }

  async function addNote(event: FormEvent) {
    event.preventDefault();
    if (!selectedOpportunity || !note.trim()) return;
    setBusy(true);
    try {
      const updated = await apiRequest<CrmOpportunity>(`${basePath}/crm/opportunities/${selectedOpportunity.id}/notes`, { method: 'POST', body: { note } });
      setSelectedOpportunity(updated);
      setNote('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add note');
    } finally {
      setBusy(false);
    }
  }

  async function addFollowUp(event: FormEvent) {
    event.preventDefault();
    if (!selectedOpportunity || !followUpDraft.title.trim() || !followUpDraft.dueAt) return;
    setBusy(true);
    try {
      await apiRequest<CrmFollowUp>(`${basePath}/crm/opportunities/${selectedOpportunity.id}/follow-ups`, {
        method: 'POST',
        body: { ...followUpDraft, assignedToUserId: followUpDraft.assignedToUserId || undefined, dueAt: new Date(followUpDraft.dueAt).toISOString(), timezone: 'UTC' },
      });
      setSelectedOpportunity(await apiRequest<CrmOpportunity>(`${basePath}/crm/opportunities/${selectedOpportunity.id}`));
      setFollowUpDraft({ type: 'call', title: '', dueAt: '', assignedToUserId: '', description: '' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add follow-up');
    } finally {
      setBusy(false);
    }
  }

  async function completeFollowUp(followUp: CrmFollowUp) {
    const outcome = window.prompt('Outcome') ?? undefined;
    setBusy(true);
    try {
      await apiRequest(`${basePath}/crm/follow-ups/${followUp.id}/complete`, { method: 'POST', body: { outcome } });
      await load();
      if (selectedOpportunity) await openOpportunity(selectedOpportunity.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to complete follow-up');
    } finally {
      setBusy(false);
    }
  }

  async function cancelFollowUp(followUp: CrmFollowUp) {
    setBusy(true);
    try {
      await apiRequest(`${basePath}/crm/follow-ups/${followUp.id}/cancel`, { method: 'POST' });
      await load();
      if (selectedOpportunity) await openOpportunity(selectedOpportunity.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to cancel follow-up');
    } finally {
      setBusy(false);
    }
  }

  async function logManualActivity(event: FormEvent) {
    event.preventDefault();
    if (!selectedOpportunity || (!activityDraft.note.trim() && !activityDraft.outcome.trim())) return;
    setBusy(true);
    try {
      const updated = await apiRequest<CrmOpportunity>(`${basePath}/crm/opportunities/${selectedOpportunity.id}/activities`, { method: 'POST', body: activityDraft });
      setSelectedOpportunity(updated);
      setActivityDraft({ type: 'call_logged', note: '', outcome: '' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to log activity');
    } finally {
      setBusy(false);
    }
  }

  async function renamePipeline(event: FormEvent) {
    event.preventDefault();
    if (!selectedPipelineId || !pipelineName.trim()) return;
    setBusy(true);
    try {
      await apiRequest(`${basePath}/crm/pipelines/${selectedPipelineId}`, { method: 'PATCH', body: { name: pipelineName } });
      setPipelineName('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save pipeline');
    } finally {
      setBusy(false);
    }
  }

  async function updateStage(stage: CrmStage, patch: Partial<CrmStage>) {
    setBusy(true);
    try {
      await apiRequest(`${basePath}/crm/stages/${stage.id}`, { method: 'PATCH', body: patch });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update stage');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppLayout>
      <PageHeader title="CRM" backTo={{ to: basePath, label: 'Product' }} actions={<Link className="btn btn-secondary" to={`${basePath}/leads`}>Leads</Link>} />
      <ErrorMessage message={error} />
      {loading && <Loading />}

      {dashboard && (
        <Card>
          <div className="entity-card-header">
            <h2 className="card-title">CRM Dashboard</h2>
            <select value={range} onChange={(e) => setRange(e.target.value)}>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </div>
          <div className="summary-grid">
            <div><span className="summary-label">Open</span><p>{dashboard.summary.openOpportunities}</p></div>
            <div><span className="summary-label">Won</span><p>{dashboard.summary.wonOpportunities}</p></div>
            <div><span className="summary-label">Lost</span><p>{dashboard.summary.lostOpportunities}</p></div>
            <div><span className="summary-label">Win Rate</span><p>{dashboard.summary.closedOpportunityWinRate === null ? '-' : `${dashboard.summary.closedOpportunityWinRate}%`}</p></div>
            <div><span className="summary-label">Open Value</span><p>{amountList(dashboard.summary.totalOpenAmountByCurrency)}</p></div>
            <div><span className="summary-label">Won Value</span><p>{amountList(dashboard.summary.wonAmountByCurrency)}</p></div>
          </div>
          <div className="summary-grid" style={{ marginTop: 12 }}>
            <div><span className="summary-label">Pending Follow-ups</span><p>{dashboard.followUps.pending}</p></div>
            <div><span className="summary-label">Due Today</span><p>{dashboard.followUps.dueToday}</p></div>
            <div><span className="summary-label">Due Next 7 Days</span><p>{dashboard.followUps.dueNext7Days}</p></div>
            <div><span className="summary-label">Overdue</span><p>{dashboard.followUps.overdue}</p></div>
            <div><span className="summary-label">Stale Opportunities</span><p>{dashboard.pipelineHealth.staleOpportunityCount}</p></div>
            <div><span className="summary-label">No Next Follow-up</span><p>{dashboard.pipelineHealth.opportunitiesWithoutNextFollowUp}</p></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginTop: 16 }}>
            <section>
              <h3 className="section-title">Stage Distribution</h3>
              {dashboard.stageDistribution.map((stage) => (
                <p key={stage.stageId} className="entity-card-meta">{stage.stageName} · {labelize(stage.category)} · {stage.opportunityCount} · {amountList(stage.amountByCurrency)}</p>
              ))}
              {!dashboard.stageDistribution.length && <p className="entity-card-meta">No stage activity yet.</p>}
            </section>
            <section>
              <h3 className="section-title">Pipeline Health</h3>
              <p className="entity-card-meta">Expected close overdue · {dashboard.pipelineHealth.expectedCloseOverdueCount}</p>
              <p className="entity-card-meta">Overdue follow-ups · {dashboard.pipelineHealth.overdueFollowUpCount}</p>
              {dashboard.pipelineHealth.staleOpportunities.slice(0, 5).map((opportunity) => (
                <p key={opportunity.id} className="entity-card-meta">Stale · {opportunity.name} · {formatDate(opportunity.updatedAt)}</p>
              ))}
            </section>
            <section>
              <h3 className="section-title">Recent Activity</h3>
              {dashboard.recentActivities.slice(0, 10).map((activity) => (
                <p key={activity.id} className="entity-card-meta">{formatDate(activity.createdAt)} · {labelize(activity.type)}</p>
              ))}
              {!dashboard.recentActivities.length && <p className="entity-card-meta">No recent CRM activity.</p>}
            </section>
            <section>
              <h3 className="section-title">Largest Open</h3>
              {dashboard.largestOpenOpportunities.slice(0, 5).map((opportunity) => (
                <p key={opportunity.id} className="entity-card-meta">{opportunity.name} · {money(opportunity)}</p>
              ))}
              {!dashboard.largestOpenOpportunities.length && <p className="entity-card-meta">No open opportunity value yet.</p>}
            </section>
          </div>
          {!!dashboard.followUps.overdueItems.length && (
            <>
              <h3 className="section-title">Overdue Follow-ups</h3>
              {dashboard.followUps.overdueItems.map((followUp) => (
                <p key={followUp.id} className="entity-card-meta">{formatDate(followUp.dueAt)} · {labelize(followUp.type)} · {followUp.title}</p>
              ))}
            </>
          )}
        </Card>
      )}

      <Card>
        <div className="entity-card-header">
          <h2 className="card-title">Follow-ups</h2>
          <span className="entity-card-meta">{followUps.length} listed</span>
        </div>
        {followUps.slice(0, 10).map((followUp) => (
          <div key={followUp.id} className="entity-card" style={{ borderTop: '1px solid var(--border-color, #ddd)', paddingTop: 10, marginTop: 10 }}>
            <div className="entity-card-header">
              <h3>{followUp.title}</h3>
              <span className={`quality-badge ${followUp.status === 'overdue' ? 'quality-poor' : followUp.status === 'completed' ? 'quality-good' : 'quality-unavailable'}`}>{labelize(followUp.status)}</span>
            </div>
            <p className="entity-card-meta">{labelize(followUp.type)} · Due {formatDate(followUp.dueAt)}</p>
          </div>
        ))}
        {!followUps.length && <p className="entity-card-meta">No follow-ups planned.</p>}
      </Card>

      <Card>
        <div className="entity-card-header">
          <h2 className="card-title">Pipeline Board</h2>
          <div className="tag-list">
            <select value={selectedPipelineId} onChange={(e) => setSelectedPipelineId(e.target.value)}>
              {pipelines.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
            </select>
            <button className="btn btn-secondary" onClick={load}>Refresh</button>
          </div>
        </div>
        {board?.truncated && <p className="entity-card-meta">Board is showing the most recent {board.totalCards} opportunities.</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          {board?.stages.map((stage) => (
            <section key={stage.id} style={{ border: '1px solid var(--border-color, #ddd)', borderRadius: 6, padding: 10 }}>
              <h3>{stage.name}</h3>
              <p className="entity-card-meta">{labelize(stage.category)} · {stage.probability ?? '-'}%</p>
              {stage.opportunities.map((opportunity) => (
                <div key={opportunity.id} className="entity-card" style={{ border: '1px solid var(--border-color, #ddd)', borderRadius: 6, padding: 10, marginTop: 8 }}>
                  <h4>{opportunity.name}</h4>
                  <p className="entity-card-meta">{opportunity.lead?.fullName || opportunity.lead?.email || 'Lead'} · {opportunity.lead?.companyName || '-'}</p>
                  <p className="entity-card-meta">{opportunity.lead?.qualification?.score ?? '-'} / {opportunity.lead?.qualification?.grade ?? '-'} · {money(opportunity)}</p>
                  <p className="entity-card-meta">Close: {opportunity.expectedCloseDate ? new Date(opportunity.expectedCloseDate).toLocaleDateString() : '-'}</p>
                  <div className="tag-list">
                    <button className="btn btn-secondary" onClick={() => openOpportunity(opportunity.id)}>Open</button>
                    <span className="summary-label">Move to Stage</span>
                    <select value={opportunity.stageId} onChange={(e) => moveOpportunity(opportunity, e.target.value)} disabled={busy}>{stages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      </Card>

      {selectedOpportunity && (
        <Card>
          <div className="entity-card-header">
            <h2 className="card-title">{selectedOpportunity.name}</h2>
            <div className="tag-list">
              <button className="btn btn-secondary" onClick={() => mark(selectedOpportunity, 'mark-won')} disabled={busy}>Mark Won</button>
              <button className="btn btn-secondary" onClick={() => mark(selectedOpportunity, 'mark-lost')} disabled={busy}>Mark Lost</button>
            </div>
          </div>
          <div className="summary-grid">
            <div><span className="summary-label">Lead</span><p>{selectedOpportunity.lead?.fullName || selectedOpportunity.lead?.email || '-'}</p></div>
            <div><span className="summary-label">Stage</span><p>{selectedOpportunity.stage?.name || '-'}</p></div>
            <div><span className="summary-label">Status</span><p>{labelize(selectedOpportunity.status)}</p></div>
            <div><span className="summary-label">Amount</span><p>{money(selectedOpportunity)}</p></div>
            <div><span className="summary-label">Probability</span><p>{selectedOpportunity.probability ?? '-'}%</p></div>
            <div><span className="summary-label">Expected Close</span><p>{selectedOpportunity.expectedCloseDate ? new Date(selectedOpportunity.expectedCloseDate).toLocaleDateString() : '-'}</p></div>
          </div>
          {selectedOpportunity.description && <p>{selectedOpportunity.description}</p>}
          <h3 className="section-title">Plan Follow-up</h3>
          <form className="form" onSubmit={addFollowUp}>
            <div className="summary-grid">
              <div className="field">
                <label>Type</label>
                <select value={followUpDraft.type} onChange={(e) => setFollowUpDraft((draft) => ({ ...draft, type: e.target.value as CrmFollowUpType }))}>
                  {['call', 'meeting', 'email', 'demo', 'proposal', 'reminder', 'other'].map((type) => <option key={type} value={type}>{labelize(type)}</option>)}
                </select>
              </div>
              <div className="field"><label>Title</label><input value={followUpDraft.title} onChange={(e) => setFollowUpDraft((draft) => ({ ...draft, title: e.target.value }))} /></div>
              <div className="field"><label>Due At</label><input type="datetime-local" value={followUpDraft.dueAt} onChange={(e) => setFollowUpDraft((draft) => ({ ...draft, dueAt: e.target.value }))} /></div>
              <div className="field"><label>Assigned User</label><input value={followUpDraft.assignedToUserId} onChange={(e) => setFollowUpDraft((draft) => ({ ...draft, assignedToUserId: e.target.value }))} /></div>
            </div>
            <div className="field"><label>Description</label><textarea value={followUpDraft.description} onChange={(e) => setFollowUpDraft((draft) => ({ ...draft, description: e.target.value }))} /></div>
            <button className="btn btn-primary" disabled={busy || !followUpDraft.title.trim() || !followUpDraft.dueAt}>Create Follow-up</button>
          </form>
          <h3 className="section-title">Follow-ups</h3>
          {selectedOpportunity.followUps?.map((followUp) => (
            <div key={followUp.id} className="entity-card" style={{ borderTop: '1px solid var(--border-color, #ddd)', paddingTop: 10, marginTop: 10 }}>
              <div className="entity-card-header">
                <h4>{followUp.title}</h4>
                <span className={`quality-badge ${followUp.status === 'overdue' ? 'quality-poor' : followUp.status === 'completed' ? 'quality-good' : 'quality-unavailable'}`}>{labelize(followUp.status)}</span>
              </div>
              <p className="entity-card-meta">{labelize(followUp.type)} · Due {formatDate(followUp.dueAt)}{followUp.outcome ? ` · ${followUp.outcome}` : ''}</p>
              {(followUp.status === 'pending' || followUp.status === 'overdue') && (
                <div className="tag-list">
                  <button className="btn btn-secondary" onClick={() => completeFollowUp(followUp)} disabled={busy}>Complete</button>
                  <button className="btn btn-secondary" onClick={() => cancelFollowUp(followUp)} disabled={busy}>Cancel</button>
                </div>
              )}
            </div>
          ))}
          {!selectedOpportunity.followUps?.length && <p className="entity-card-meta">No follow-ups for this opportunity.</p>}
          <h3 className="section-title">Log Sales Activity</h3>
          <form className="form" onSubmit={logManualActivity}>
            <div className="summary-grid">
              <div className="field">
                <label>Type</label>
                <select value={activityDraft.type} onChange={(e) => setActivityDraft((draft) => ({ ...draft, type: e.target.value }))}>
                  <option value="call_logged">Call Logged</option>
                  <option value="meeting_logged">Meeting Logged</option>
                  <option value="note_added">Note Added</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="field"><label>Outcome</label><input value={activityDraft.outcome} onChange={(e) => setActivityDraft((draft) => ({ ...draft, outcome: e.target.value }))} /></div>
            </div>
            <div className="field"><label>Note</label><textarea value={activityDraft.note} onChange={(e) => setActivityDraft((draft) => ({ ...draft, note: e.target.value }))} /></div>
            <button className="btn btn-secondary" disabled={busy || (!activityDraft.note.trim() && !activityDraft.outcome.trim())}>Log Activity</button>
          </form>
          <form className="form" onSubmit={addNote}>
            <div className="field"><label>Note</label><textarea value={note} onChange={(e) => setNote(e.target.value)} /></div>
            <button className="btn btn-primary" disabled={busy || !note.trim()}>Add Note</button>
          </form>
          <h3 className="section-title">Activity Timeline</h3>
          {selectedOpportunity.activities?.map((activity) => <p key={activity.id} className="entity-card-meta">{new Date(activity.createdAt).toLocaleString()} · {labelize(activity.type)}{activity.note ? ` · ${activity.note}` : ''}</p>)}
        </Card>
      )}

      <Card>
        <h2 className="card-title">Pipeline Settings</h2>
        <form className="form-inline" onSubmit={renamePipeline}>
          <input placeholder="Pipeline name" value={pipelineName} onChange={(e) => setPipelineName(e.target.value)} />
          <button className="btn btn-secondary" disabled={busy || !pipelineName.trim()}>Rename</button>
        </form>
        {stages.map((stage) => (
          <div key={stage.id} className="entity-card" style={{ borderTop: '1px solid var(--border-color, #ddd)', paddingTop: 10, marginTop: 10 }}>
            <div className="entity-card-header">
              <h3>{stage.name}</h3>
              <span className={`quality-badge ${stage.isActive ? 'quality-good' : 'quality-unavailable'}`}>{stage.isActive ? 'Active' : 'Inactive'}</span>
            </div>
            <div className="tag-list">
              <select value={stage.category} onChange={(e) => updateStage(stage, { category: e.target.value as CrmStage['category'] })}><option value="open">Open</option><option value="won">Won</option><option value="lost">Lost</option></select>
              <input type="number" min="0" max="100" value={stage.probability ?? ''} onChange={(e) => updateStage(stage, { probability: Number(e.target.value) })} />
              <button className="btn btn-secondary" onClick={() => updateStage(stage, { isActive: !stage.isActive })} disabled={busy}>{stage.isActive ? 'Deactivate' : 'Activate'}</button>
            </div>
          </div>
        ))}
      </Card>
    </AppLayout>
  );
}
