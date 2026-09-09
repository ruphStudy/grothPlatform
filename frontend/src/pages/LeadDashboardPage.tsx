import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { Card } from '../components/Card';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import type { LeadDashboardResponse } from '../types';

function labelize(value: string): string {
  return value.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const width = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div className="confidence-row">
      <span className="summary-label" style={{ minWidth: 160, marginBottom: 0 }}>{label}</span>
      <div className="confidence-track"><div className="confidence-fill" style={{ width: `${width}%` }} /></div>
      <span className="confidence-value">{value}</span>
    </div>
  );
}

export default function LeadDashboardPage() {
  const { organizationId, productId } = useParams<{ organizationId: string; productId: string }>();
  const basePath = `/organizations/${organizationId}/products/${productId}`;
  const [range, setRange] = useState('30d');
  const [dashboard, setDashboard] = useState<LeadDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!organizationId || !productId) return;
    setLoading(true);
    setError(null);
    try {
      setDashboard(await apiRequest<LeadDashboardResponse>(`${basePath}/leads/dashboard?range=${range}&timezone=UTC`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load lead dashboard');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, productId, range]);

  const maxSource = Math.max(0, ...(dashboard?.sourceBreakdown.map((item) => item.uniqueLeads) ?? []));
  const maxTrend = Math.max(0, ...(dashboard?.trend.map((item) => item.captureEvents) ?? []));

  return (
    <AppLayout>
      <PageHeader
        title="Lead Dashboard"
        backTo={{ to: `${basePath}/leads`, label: 'Leads' }}
        actions={<><select value={range} onChange={(e) => setRange(e.target.value)}><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option></select><button className="btn btn-secondary" onClick={load}>Refresh</button></>}
      />
      <ErrorMessage message={error} />
      {loading && <Loading />}
      {dashboard && (
        <>
          <Card>
            <div className="summary-grid">
              <div><span className="summary-label">Total Leads</span><p>{dashboard.summary.totalLeads}</p></div>
              <div><span className="summary-label">New</span><p>{dashboard.summary.newLeads}</p></div>
              <div><span className="summary-label">Qualified</span><p>{dashboard.summary.qualifiedLeads}</p></div>
              <div><span className="summary-label">Hot</span><p>{dashboard.summary.hotLeads}</p></div>
              <div><span className="summary-label">Converted</span><p>{dashboard.summary.convertedLeads}</p></div>
              <div><span className="summary-label">Avg Score</span><p>{dashboard.summary.averageLeadScore}</p></div>
            </div>
          </Card>

          <Card>
            <h2 className="card-title">Capture Trend</h2>
            {dashboard.trend.length === 0 && <p className="entity-card-meta">No capture events in this range.</p>}
            {dashboard.trend.map((item) => <Bar key={item.period} label={`${item.period} · ${item.uniqueLeadsCreated} unique`} value={item.captureEvents} max={maxTrend} />)}
          </Card>

          <Card>
            <h2 className="card-title">Lead Sources</h2>
            {dashboard.sourceBreakdown.map((item) => <Bar key={item.sourceType} label={`${labelize(item.sourceType)} · ${item.captureEvents} captures`} value={item.uniqueLeads} max={maxSource} />)}
          </Card>

          <Card>
            <h2 className="card-title">Qualification</h2>
            <div className="summary-grid">
              {dashboard.qualificationBreakdown.grades.map((item) => <div key={item.grade}><span className="summary-label">{labelize(item.grade)}</span><p>{item.count}</p></div>)}
              {dashboard.qualificationBreakdown.statuses.map((item) => <div key={item.qualificationStatus}><span className="summary-label">{labelize(item.qualificationStatus)}</span><p>{item.count}</p></div>)}
            </div>
          </Card>

          <Card>
            <h2 className="card-title">Forms</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th>Form</th><th>Submissions</th><th>Unique Leads</th><th>Qualified</th></tr></thead>
              <tbody>{dashboard.formPerformance.map((item) => <tr key={item.formId}><td>{item.name}</td><td>{item.submissions}</td><td>{item.uniqueLeads}</td><td>{item.qualifiedLeads}</td></tr>)}</tbody>
            </table>
          </Card>

          <Card>
            <h2 className="card-title">Campaigns</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th>Campaign</th><th>Leads</th><th>Capture Events</th><th>Qualified</th></tr></thead>
              <tbody>{dashboard.campaignBreakdown.map((item) => <tr key={item.campaignId}><td><Link to={`${basePath}/campaigns/${item.campaignId}`}>{item.name}</Link></td><td>{item.uniqueLeads}</td><td>{item.captureEvents}</td><td>{item.qualifiedLeads}</td></tr>)}</tbody>
            </table>
          </Card>

          <Card>
            <h2 className="card-title">Needs Attention</h2>
            <div className="tag-list">
              <Link className="btn btn-secondary" to={`${basePath}/leads?grade=hot&status=new`}>Hot New Leads</Link>
              <Link className="btn btn-secondary" to={`${basePath}/leads?qualificationStatus=needs_review`}>Needs Review</Link>
              <Link className="btn btn-secondary" to={`${basePath}/leads?communicationEligibility=unknown`}>Communication Unknown</Link>
            </div>
            <p className="entity-card-meta">Identity conflicts: {dashboard.needsAttention.identityConflictCount} · Communication not ready: {dashboard.needsAttention.communicationNotReady}</p>
          </Card>

          <Card>
            <h2 className="card-title">Recent Leads</h2>
            <div className="grid-cards">
              {dashboard.recentLeads.map((lead) => (
                <Link key={lead.id} className="entity-card" style={{ border: '1px solid var(--border-color, #ddd)', borderRadius: 6, padding: 12 }} to={`${basePath}/leads?search=${encodeURIComponent(lead.email || lead.phone || lead.fullName || '')}`}>
                  <h3>{lead.fullName || lead.email || lead.phone || 'Unnamed lead'}</h3>
                  <p className="entity-card-meta">{labelize(lead.sourceType)} · {lead.qualification?.score ?? '-'} / {lead.qualification?.grade ?? '-'}</p>
                  <p className="entity-card-meta">{labelize(lead.status)} · {new Date(lead.latestCapturedAt).toLocaleString()}</p>
                </Link>
              ))}
            </div>
          </Card>
        </>
      )}
    </AppLayout>
  );
}
