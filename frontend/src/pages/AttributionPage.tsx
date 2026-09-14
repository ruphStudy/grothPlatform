import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { Card } from '../components/Card';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import type { AttributionAggregateRow, AttributionDashboard, AttributionModel, AttributionValue } from '../types';

function labelize(value: string): string {
  return value.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function values(items: AttributionValue[]): string {
  return items.length ? items.map((item) => `${item.currency} ${item.amount}`).join(' · ') : '-';
}

function modelCopy(model: AttributionModel): string {
  return model === 'last_touch' ? 'Attribution model: Last Touch. 100% credit is assigned to the latest eligible recorded touchpoint before conversion.' : 'Attribution model: First Touch. 100% credit is assigned to the earliest eligible recorded touchpoint.';
}

function AttributionTable({ title, rows, firstColumn }: { title: string; rows: AttributionAggregateRow[]; firstColumn: string }) {
  return (
    <Card>
      <h2 className="card-title">{title}</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>{firstColumn}</th><th>Attributed Leads</th><th>Attributed Opportunities</th><th>Attributed Wins</th><th>Attributed Won Value</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.key}><td>{row.key}</td><td>{row.attributedLeads}</td><td>{row.attributedOpportunities}</td><td>{row.attributedWins}</td><td>{values(row.attributedValueByCurrency)}</td></tr>)}</tbody>
        </table>
      </div>
      {!rows.length && <p className="entity-card-meta">No attributed records for this model and range.</p>}
    </Card>
  );
}

export default function AttributionPage() {
  const { organizationId, productId } = useParams<{ organizationId: string; productId: string }>();
  const basePath = `/organizations/${organizationId}/products/${productId}`;
  const [dashboard, setDashboard] = useState<AttributionDashboard | null>(null);
  const [utmRows, setUtmRows] = useState<AttributionAggregateRow[]>([]);
  const [contentRows, setContentRows] = useState<AttributionAggregateRow[]>([]);
  const [campaignRows, setCampaignRows] = useState<AttributionAggregateRow[]>([]);
  const [revenueMapCount, setRevenueMapCount] = useState(0);
  const [range, setRange] = useState('30');
  const [model, setModel] = useState<AttributionModel>('first_touch');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const params = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - Number(range) * 86400000);
    const query = new URLSearchParams({ model, from: from.toISOString(), to: to.toISOString() });
    return query.toString();
  }, [range, model]);

  async function load() {
    if (!organizationId || !productId) return;
    setLoading(true);
    setError(null);
    try {
      const [dashboardData, utmData, contentData, campaignData, revenueMapData] = await Promise.all([
        apiRequest<AttributionDashboard>(`${basePath}/attribution/dashboard?${params}`),
        apiRequest<{ rows: AttributionAggregateRow[] }>(`${basePath}/attribution/utm?${params}`),
        apiRequest<{ rows: AttributionAggregateRow[] }>(`${basePath}/attribution/content?${params}`),
        apiRequest<{ rows: AttributionAggregateRow[] }>(`${basePath}/attribution/campaigns?${params}`),
        apiRequest<{ rows: unknown[] }>(`${basePath}/attribution/revenue-map?${params}`),
      ]);
      setDashboard(dashboardData);
      setUtmRows(utmData.rows);
      setContentRows(contentData.rows);
      setCampaignRows(campaignData.rows);
      setRevenueMapCount(revenueMapData.rows.length);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load attribution');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, productId, params]);

  async function backfill() {
    setBusy(true);
    try {
      await apiRequest(`${basePath}/attribution/backfill`, { method: 'POST', body: {} });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Attribution backfill failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppLayout>
      <PageHeader
        title="Attribution"
        backTo={{ to: basePath, label: 'Product' }}
        actions={<button className="btn btn-secondary" onClick={backfill} disabled={busy}>{busy ? 'Backfilling...' : 'Backfill Touchpoints'}</button>}
      />
      <ErrorMessage message={error} />
      {loading && <Loading />}

      <Card>
        <div className="form form-grid-2">
          <div className="field"><label>Date Range</label><select value={range} onChange={(e) => setRange(e.target.value)}><option value="7">Last 7 Days</option><option value="30">Last 30 Days</option><option value="90">Last 90 Days</option></select></div>
          <div className="field"><label>Model</label><select value={model} onChange={(e) => setModel(e.target.value as AttributionModel)}><option value="first_touch">First Touch</option><option value="last_touch">Last Touch</option></select></div>
        </div>
        <p className="entity-card-meta">{modelCopy(model)}</p>
        <p className="entity-card-meta">{dashboard?.disclaimer || 'Attribution assigns credit using recorded touchpoints and the selected model. It does not prove causation.'}</p>
      </Card>

      {dashboard && (
        <>
          <Card>
            <h2 className="card-title">Revenue Dashboard</h2>
            <div className="summary-grid">
              <div><span className="summary-label">Won Opportunities</span><p>{dashboard.summary.wonOpportunities}</p></div>
              <div><span className="summary-label">With Attribution</span><p>{dashboard.summary.wonOpportunitiesWithAttribution}</p></div>
              <div><span className="summary-label">Unattributed Wins</span><p>{dashboard.summary.unattributedWonOpportunities}</p></div>
              <div><span className="summary-label">Attributed Leads</span><p>{dashboard.summary.attributedLeads}</p></div>
              <div><span className="summary-label">Attribution Coverage</span><p>{dashboard.summary.attributionCoverage === null ? '-' : `${Math.round(dashboard.summary.attributionCoverage * 1000) / 10}%`}</p></div>
              <div><span className="summary-label">Total Won Opportunity Value</span><p>{values(dashboard.summary.totalWonValueByCurrency)}</p></div>
              <div><span className="summary-label">Attributed Won Value</span><p>{values(dashboard.summary.attributedWonValueByCurrency)}</p></div>
              <div><span className="summary-label">Lead Revenue Mappings</span><p>{revenueMapCount}</p></div>
            </div>
          </Card>
          <AttributionTable title="Channel Attribution" firstColumn="Channel" rows={dashboard.channels} />
          <AttributionTable title="UTM Attribution" firstColumn="Source / Medium / Campaign" rows={utmRows} />
          <AttributionTable title="Content Attribution" firstColumn="Content" rows={contentRows} />
          <AttributionTable title="Campaign Attribution" firstColumn="Campaign" rows={campaignRows} />
          <Card>
            <h2 className="card-title">Revenue / Journeys</h2>
            {dashboard.opportunities.map((opportunity) => (
              <div key={opportunity.opportunityId} className="entity-card">
                <strong>{opportunity.opportunityId}</strong>
                <p className="entity-card-meta">{opportunity.attributionStatus} · Won {opportunity.wonAt ? new Date(opportunity.wonAt).toLocaleDateString() : '-'} · {opportunity.currency || ''} {opportunity.amount ?? '-'}</p>
                {opportunity.touchpoints.map((touch) => <p key={touch.id} className="entity-card-meta">{touch.credited ? 'Credited · ' : ''}{new Date(touch.occurredAt).toLocaleString()} · {labelize(touch.channel)} · {labelize(touch.touchpointType)} · {touch.utmSource || touch.campaignId || touch.contentArtifactId || '-'}</p>)}
              </div>
            ))}
            {!dashboard.opportunities.length && <p className="entity-card-meta">No won opportunities in this range.</p>}
          </Card>
          <Card>
            <h2 className="card-title">Attribution Data Health</h2>
            <div className="summary-grid">{Object.entries(dashboard.dataHealth).map(([key, value]) => <div key={key}><span className="summary-label">{labelize(key)}</span><p>{value}</p></div>)}</div>
          </Card>
        </>
      )}
    </AppLayout>
  );
}
