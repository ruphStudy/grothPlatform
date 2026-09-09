import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { Card } from '../components/Card';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import type { CrmBoardResponse, CrmOpportunity, CrmPipeline, CrmStage } from '../types';

function labelize(value: string): string {
  return value.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function money(opportunity: CrmOpportunity): string {
  if (opportunity.amount === undefined || !opportunity.currency) return '-';
  return `${opportunity.currency} ${opportunity.amount}`;
}

export default function CrmPage() {
  const { organizationId, productId } = useParams<{ organizationId: string; productId: string }>();
  const basePath = `/organizations/${organizationId}/products/${productId}`;
  const [pipelines, setPipelines] = useState<CrmPipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState('');
  const [board, setBoard] = useState<CrmBoardResponse | null>(null);
  const [selectedOpportunity, setSelectedOpportunity] = useState<CrmOpportunity | null>(null);
  const [note, setNote] = useState('');
  const [pipelineName, setPipelineName] = useState('');
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
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load CRM');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, productId]);

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
