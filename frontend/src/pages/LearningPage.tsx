import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { Card } from '../components/Card';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import type { LearningDashboard, LearningObservation, LearningRecommendation, LearningWinner, StrategyAdjustmentProposal } from '../types';

type Tab = 'overview' | 'content' | 'channels' | 'cta' | 'topics' | 'prompts' | 'strategy';

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'content', label: 'Winning Content' },
  { id: 'channels', label: 'Winning Channels' },
  { id: 'cta', label: 'CTA Performance' },
  { id: 'topics', label: 'Topic Performance' },
  { id: 'prompts', label: 'Prompt Suggestions' },
  { id: 'strategy', label: 'Strategy Adjustments' },
];

function labelize(value: string): string {
  return value.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function metricValue(value?: number | null, metric?: string, currency?: string): string {
  if (value === null || value === undefined) return 'Unavailable';
  if (currency) return `${currency} ${Math.round(value * 100) / 100}`;
  if (metric?.includes('rate') || metric === 'publication_rate') return `${Math.round(value * 1000) / 10}%`;
  return String(Math.round(value * 100) / 100);
}

function WinnerTable({ rows }: { rows: LearningWinner[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Subject</th><th>Metric</th><th>Value</th><th>Baseline</th><th>Sample</th><th>Confidence</th><th>Evidence</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.domain}-${row.metric}-${row.subjectKey}`}>
              <td>{row.subjectKey}</td>
              <td>{labelize(row.metric)}</td>
              <td>{metricValue(row.value, row.metric, row.currency)}</td>
              <td>{metricValue(row.baselineValue, row.metric)}</td>
              <td>{row.sampleSize}</td>
              <td>{labelize(row.confidence)}</td>
              <td>{row.sourceReferences.map((ref) => ref.sourceType).join(', ') || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="entity-card-meta">No winner met the minimum sample and baseline requirements for this range.</p>}
    </div>
  );
}

function ObservationTable({ rows }: { rows: LearningObservation[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Domain</th><th>Subject</th><th>Metric</th><th>Value</th><th>Numerator</th><th>Denominator</th><th>Sample</th></tr></thead>
        <tbody>
          {rows.slice(0, 80).map((row) => (
            <tr key={`${row.domain}-${row.metric}-${row.subjectKey}`}>
              <td>{labelize(row.domain)}</td>
              <td>{row.subjectKey}</td>
              <td>{labelize(row.metric)}</td>
              <td>{metricValue(row.value, row.metric, row.currency)}</td>
              <td>{row.numerator ?? '-'}</td>
              <td>{row.denominator ?? '-'}</td>
              <td>{row.sampleSize}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LearningPage() {
  const { organizationId, productId } = useParams<{ organizationId: string; productId: string }>();
  const basePath = `/organizations/${organizationId}/products/${productId}`;
  const [dashboard, setDashboard] = useState<LearningDashboard | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [range, setRange] = useState('90');
  const [model, setModel] = useState<'first_touch' | 'last_touch'>('first_touch');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const params = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - Number(range) * 86400000);
    return new URLSearchParams({ model, from: from.toISOString(), to: to.toISOString() }).toString();
  }, [range, model]);

  async function load() {
    if (!organizationId || !productId) return;
    setLoading(true);
    setError(null);
    try {
      setDashboard(await apiRequest<LearningDashboard>(`${basePath}/learning/dashboard?${params}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load learning dashboard');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, productId, params]);

  async function aggregate() {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`${basePath}/learning/aggregate?${params}`, { method: 'POST', body: {} });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Learning aggregation failed');
    } finally {
      setBusy(false);
    }
  }

  async function updatePrompt(item: LearningRecommendation, status: 'accepted' | 'rejected') {
    const id = item._id || item.id;
    if (!id) return;
    await apiRequest(`${basePath}/learning/prompt-suggestions/${id}/status`, { method: 'POST', body: { status } });
    await load();
  }

  async function updateProposal(item: StrategyAdjustmentProposal, status: 'accepted' | 'rejected') {
    const id = item._id || item.id;
    if (!id) return;
    await apiRequest(`${basePath}/learning/strategy-adjustments/${id}/status`, { method: 'POST', body: { status } });
    await load();
  }

  return (
    <AppLayout>
      <PageHeader
        title="Learning & Optimization"
        backTo={{ to: basePath, label: 'Product' }}
        actions={<button className="btn btn-secondary" onClick={aggregate} disabled={busy}>{busy ? 'Aggregating...' : 'Run Learning Aggregation'}</button>}
      />
      <ErrorMessage message={error} />
      {loading && <Loading />}

      <Card>
        <div className="form form-grid-2">
          <div className="field"><label>Date Range</label><select value={range} onChange={(e) => setRange(e.target.value)}><option value="30">Last 30 Days</option><option value="90">Last 90 Days</option><option value="180">Last 180 Days</option></select></div>
          <div className="field"><label>Attribution Model</label><select value={model} onChange={(e) => setModel(e.target.value as 'first_touch' | 'last_touch')}><option value="first_touch">First Touch</option><option value="last_touch">Last Touch</option></select></div>
        </div>
        <p className="entity-card-meta">{dashboard?.disclaimer || 'Learning uses historical observations only.'}</p>
      </Card>

      {dashboard && (
        <>
          <Card>
            <div className="profile-meta">
              {tabs.map((item) => <button key={item.id} className={`btn ${tab === item.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(item.id)}>{item.label}</button>)}
            </div>
          </Card>

          {tab === 'overview' && (
            <>
              <Card>
                <h2 className="card-title">Learning Overview</h2>
                <div className="summary-grid">
                  <div><span className="summary-label">Observations</span><p>{dashboard.overview.observationCount}</p></div>
                  <div><span className="summary-label">Domains</span><p>{dashboard.overview.domains.length}</p></div>
                  <div><span className="summary-label">Algorithm</span><p>{dashboard.modelVersion}</p></div>
                  <div><span className="summary-label">Attribution Health</span><p>{dashboard.overview.confidenceCaps.attributionCoverage}</p></div>
                </div>
              </Card>
              <Card>
                <h2 className="card-title">Performance Observations</h2>
                <ObservationTable rows={dashboard.observations} />
              </Card>
            </>
          )}

          {tab === 'content' && <Card><h2 className="card-title">Winning Content</h2><WinnerTable rows={dashboard.winningContent} /></Card>}
          {tab === 'channels' && <Card><h2 className="card-title">Winning Channels</h2><WinnerTable rows={dashboard.winningChannels} /></Card>}
          {tab === 'cta' && <Card><h2 className="card-title">CTA Performance</h2><WinnerTable rows={dashboard.ctas} /></Card>}
          {tab === 'topics' && <Card><h2 className="card-title">Topic Performance</h2><WinnerTable rows={dashboard.topics} /></Card>}

          {tab === 'prompts' && (
            <Card>
              <h2 className="card-title">Prompt Improvement Suggestions</h2>
              {dashboard.promptSuggestions.map((item) => (
                <div key={`${item.safeDimension}-${item.suggestedValue}-${item.metric}`} className="entity-card">
                  <div className="entity-card-header"><strong>{labelize(item.safeDimension)}: {item.suggestedValue}</strong><span className="tag">{labelize(item.confidence)}</span></div>
                  <p className="entity-card-meta">Metric: {labelize(item.metric)} · Sample: {item.sampleSize} · Status: {labelize(item.status)}</p>
                  <p>Observed stronger associated outcomes for this stored generation dimension. Full provider prompts are not stored or exposed.</p>
                  <div className="profile-meta"><button className="btn btn-secondary" onClick={() => updatePrompt(item, 'accepted')}>Accept</button><button className="btn btn-secondary" onClick={() => updatePrompt(item, 'rejected')}>Reject</button></div>
                </div>
              ))}
              {!dashboard.promptSuggestions.length && <p className="entity-card-meta">No prompt suggestion has enough safe, historical evidence yet.</p>}
            </Card>
          )}

          {tab === 'strategy' && (
            <Card>
              <h2 className="card-title">Strategy Adjustment Proposals</h2>
              {dashboard.strategyAdjustments.map((item) => (
                <div key={`${item.strategyId}-${item.targetSection}-${item.proposedChange}`} className="entity-card">
                  <div className="entity-card-header"><strong>{labelize(item.targetSection)}</strong><span className="tag">{labelize(item.confidence)}</span></div>
                  <p>{item.proposedChange}</p>
                  <p className="entity-card-meta">Strategy: {item.strategyId} · Version: {item.strategyVersion} · Sample: {item.sampleSize} · Status: {labelize(item.status)}</p>
                  <p className="muted">{item.reason}</p>
                  <div className="profile-meta"><button className="btn btn-secondary" onClick={() => updateProposal(item, 'accepted')}>Accept</button><button className="btn btn-secondary" onClick={() => updateProposal(item, 'rejected')}>Reject</button></div>
                </div>
              ))}
              {!dashboard.strategyAdjustments.length && <p className="entity-card-meta">No approved strategy-backed adjustment proposal is active for this range.</p>}
            </Card>
          )}
        </>
      )}
    </AppLayout>
  );
}
