import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { Card } from '../components/Card';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import type { ApprovalDecision, ApprovalQueueResponse, ApprovalRequest } from '../types';

type Tab = 'pending' | 'changes_requested' | 'resolved' | 'history';

function labelize(value: string): string {
  return value.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export default function ApprovalsPage() {
  const { organizationId, productId } = useParams<{ organizationId: string; productId: string }>();
  const [search] = useSearchParams();
  const basePath = `/organizations/${organizationId}/products/${productId}`;
  const [tab, setTab] = useState<Tab>('pending');
  const [queue, setQueue] = useState<ApprovalQueueResponse | null>(null);
  const [selected, setSelected] = useState<ApprovalRequest | null>(null);
  const [history, setHistory] = useState<ApprovalDecision[]>([]);
  const [comment, setComment] = useState('');
  const [targetType, setTargetType] = useState('');
  const [targetId, setTargetId] = useState('');
  const [targetVersionId, setTargetVersionId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queueQuery = useMemo(() => {
    const params = new URLSearchParams({ limit: '25' });
    if (tab === 'pending') params.set('status', 'pending');
    if (tab === 'changes_requested') params.set('status', 'changes_requested');
    if (tab === 'resolved') params.set('status', 'approved');
    if (targetType) params.set('targetType', targetType);
    return params.toString();
  }, [tab, targetType]);

  async function load() {
    if (!organizationId || !productId) return;
    setLoading(true);
    setError(null);
    try {
      const [queueData, historyData] = await Promise.all([
        apiRequest<ApprovalQueueResponse>(`${basePath}/approvals/queue?${queueQuery}`),
        apiRequest<ApprovalDecision[]>(`${basePath}/approval-history?limit=100`),
      ]);
      setQueue(queueData);
      setHistory(historyData);
      const approvalId = search.get('approvalId');
      if (approvalId) setSelected(await apiRequest<ApprovalRequest>(`${basePath}/approvals/${approvalId}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load approvals');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, productId, queueQuery]);

  async function requestApproval() {
    if (!targetType || !targetId) return;
    setBusy(true);
    setError(null);
    try {
      const request = await apiRequest<ApprovalRequest>(`${basePath}/approvals`, { method: 'POST', body: { targetType, targetId, targetVersionId: targetVersionId || undefined, reasonText: comment || undefined } });
      setSelected(request);
      setComment('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Request approval failed');
    } finally {
      setBusy(false);
    }
  }

  async function decide(action: 'approve' | 'reject' | 'request-changes') {
    if (!selected) return;
    const label = action === 'request-changes' ? 'request changes for' : action;
    if (!window.confirm(`Confirm ${label} ${selected.targetSnapshot.title}?`)) return;
    setBusy(true);
    setError(null);
    try {
      setSelected(await apiRequest<ApprovalRequest>(`${basePath}/approvals/${selected._id}/${action}`, { method: 'POST', body: { comment } }));
      setComment('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Approval action failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppLayout>
      <PageHeader title="Approvals / Review Queue" backTo={{ to: basePath, label: 'Product' }} />
      <ErrorMessage message={error} />
      {loading && <Loading />}

      <Card>
        <div className="profile-meta">
          {(['pending', 'changes_requested', 'resolved', 'history'] as Tab[]).map((item) => <button key={item} className={`btn ${tab === item ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(item)}>{labelize(item)}</button>)}
        </div>
        {queue && (
          <div className="summary-grid" style={{ marginTop: 12 }}>
            <div><span className="summary-label">Pending</span><p>{queue.counts.pending}</p></div>
            <div><span className="summary-label">High Priority</span><p>{queue.counts.highPriority}</p></div>
            <div><span className="summary-label">Overdue</span><p>{queue.counts.overdue}</p></div>
            <div><span className="summary-label">Changes Requested</span><p>{queue.counts.changesRequested}</p></div>
          </div>
        )}
      </Card>

      {tab !== 'history' && (
        <Card>
          <h2 className="card-title">Request Approval</h2>
          <div className="form form-grid-2">
            <div className="field"><label>Target Type</label><select value={targetType} onChange={(e) => setTargetType(e.target.value)}><option value="">Select</option><option value="content_version">Content Version</option><option value="social_publication">Social Publication</option><option value="cms_publication">CMS Publication</option><option value="email_campaign">Email Campaign</option><option value="email_schedule">Email Schedule</option><option value="weekly_growth_plan">Weekly Growth Plan</option></select></div>
            <div className="field"><label>Target ID</label><input value={targetId} onChange={(e) => setTargetId(e.target.value)} /></div>
            <div className="field"><label>Target Version</label><input value={targetVersionId} onChange={(e) => setTargetVersionId(e.target.value)} /></div>
            <div className="field"><label>Reason</label><input value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} /></div>
          </div>
          <button className="btn btn-secondary" onClick={requestApproval} disabled={busy || !targetType || !targetId}>Request Approval</button>
        </Card>
      )}

      {tab !== 'history' && (
        <Card>
          <h2 className="card-title">{labelize(tab)} Items</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Priority</th><th>Item</th><th>Type</th><th>Policy</th><th>Requested</th><th>Due</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>{queue?.items.map((item) => <tr key={item._id}><td>{labelize(item.priority)}</td><td>{item.targetSnapshot.title}</td><td>{labelize(item.targetType)}</td><td>{labelize(item.approvalPolicy)}</td><td>{new Date(item.requestedAt).toLocaleString()}</td><td>{item.dueAt ? `${new Date(item.dueAt).toLocaleDateString()}${item.overdue ? ' Overdue' : ''}` : '-'}</td><td>{labelize(item.status)}</td><td><button className="btn btn-secondary" onClick={() => setSelected(item)}>Open</button></td></tr>)}</tbody>
            </table>
          </div>
          {!queue?.items.length && <p className="entity-card-meta">No items are waiting for review.</p>}
        </Card>
      )}

      {selected && (
        <Card>
          <h2 className="card-title">Review Detail</h2>
          <div className="entity-card">
            <div className="entity-card-header"><strong>{selected.targetSnapshot.title}</strong><span className="tag">{labelize(selected.status)}</span></div>
            <p>{selected.targetSnapshot.summary}</p>
            <p className="entity-card-meta">Type: {labelize(selected.targetType)} · Policy: {labelize(selected.approvalPolicy)} · Version: {selected.targetVersionId || '-'}</p>
            {selected.reasonText && <p className="muted">{selected.reasonText}</p>}
            <div className="field"><label>Decision Comment</label><textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} /></div>
            <div className="profile-meta"><button className="btn btn-secondary" onClick={() => decide('approve')} disabled={busy}>Approve</button><button className="btn btn-secondary" onClick={() => decide('reject')} disabled={busy}>Reject</button><button className="btn btn-secondary" onClick={() => decide('request-changes')} disabled={busy}>Request Changes</button></div>
          </div>
          <h3 className="section-title">Approval History</h3>
          {(selected.history || []).map((item) => <p key={item._id} className="entity-card-meta">{new Date(item.decidedAt).toLocaleString()} · {labelize(item.decision)} · {labelize(item.previousStatus)} to {labelize(item.resultingStatus)} · {item.comment || '-'}</p>)}
        </Card>
      )}

      {tab === 'history' && (
        <Card>
          <h2 className="card-title">Approval History</h2>
          <div className="table-wrap"><table><thead><tr><th>Date</th><th>Action</th><th>Actor</th><th>Comment</th><th>Previous</th><th>New</th></tr></thead><tbody>{history.map((item) => <tr key={item._id}><td>{new Date(item.decidedAt).toLocaleString()}</td><td>{labelize(item.decision)}</td><td>{item.decidedByUserId}</td><td>{item.comment || '-'}</td><td>{labelize(item.previousStatus)}</td><td>{labelize(item.resultingStatus)}</td></tr>)}</tbody></table></div>
        </Card>
      )}
    </AppLayout>
  );
}
