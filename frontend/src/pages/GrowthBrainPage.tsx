import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { Card } from '../components/Card';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import type { ChannelPriority, ContentPriority, GrowthBrainDashboard, GrowthDecisionExplanation, GrowthOpportunity, WeeklyGrowthPlan } from '../types';

type Tab = 'overview' | 'opportunities' | 'channels' | 'content' | 'weekly' | 'decisions';

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'channels', label: 'Channels' },
  { id: 'content', label: 'Content' },
  { id: 'weekly', label: 'Weekly Plan' },
  { id: 'decisions', label: 'Decisions' },
];

function labelize(value: string): string {
  return value.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function pct(value?: number) {
  return value === undefined ? '-' : `${Math.round(value * 100)}%`;
}

function WhyPanel({ explanation }: { explanation: GrowthDecisionExplanation | null }) {
  if (!explanation) return null;
  return (
    <Card>
      <h2 className="card-title">Why?</h2>
      <p>{explanation.summary}</p>
      <h3 className="section-title">Evidence</h3>
      <ul className="bullet-list">{explanation.reasons.map((reason, index) => <li key={index}>{Object.entries(reason).map(([key, value]) => `${labelize(key)}: ${String(value)}`).join(' · ')}</li>)}</ul>
      <h3 className="section-title">Assumptions</h3>
      <ul className="bullet-list">{explanation.assumptions.map((item, index) => <li key={index}>{item}</li>)}</ul>
      <h3 className="section-title">Limitations</h3>
      <ul className="bullet-list">{explanation.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul>
    </Card>
  );
}

export default function GrowthBrainPage() {
  const { organizationId, productId } = useParams<{ organizationId: string; productId: string }>();
  const basePath = `/organizations/${organizationId}/products/${productId}`;
  const [dashboard, setDashboard] = useState<GrowthBrainDashboard | null>(null);
  const [opportunities, setOpportunities] = useState<GrowthOpportunity[]>([]);
  const [channels, setChannels] = useState<ChannelPriority[]>([]);
  const [content, setContent] = useState<ContentPriority[]>([]);
  const [weeklyPlans, setWeeklyPlans] = useState<WeeklyGrowthPlan[]>([]);
  const [explanations, setExplanations] = useState<GrowthDecisionExplanation[]>([]);
  const [selectedExplanation, setSelectedExplanation] = useState<GrowthDecisionExplanation | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [range, setRange] = useState('90');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runBody = useMemo(() => {
    const periodTo = new Date();
    const periodFrom = new Date(periodTo.getTime() - Number(range) * 86400000);
    return { periodFrom: periodFrom.toISOString(), periodTo: periodTo.toISOString() };
  }, [range]);

  async function load() {
    if (!organizationId || !productId) return;
    setLoading(true);
    setError(null);
    try {
      const dash = await apiRequest<GrowthBrainDashboard>(`${basePath}/growth-brain/dashboard`);
      const [ops, channelRows, contentRows, plans] = await Promise.all([
        apiRequest<GrowthOpportunity[]>(`${basePath}/growth-brain/opportunities`),
        apiRequest<ChannelPriority[]>(`${basePath}/growth-brain/channels`),
        apiRequest<ContentPriority[]>(`${basePath}/growth-brain/content-priorities`),
        apiRequest<WeeklyGrowthPlan[]>(`${basePath}/growth-brain/weekly-plans`),
      ]);
      setDashboard(dash);
      setOpportunities(ops);
      setChannels(channelRows);
      setContent(contentRows);
      setWeeklyPlans(plans);
      if (dash.latestRun?._id) {
        setExplanations(await apiRequest<GrowthDecisionExplanation[]>(`${basePath}/growth-brain/decisions/${dash.latestRun._id}/explanations`));
      } else {
        setExplanations([]);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load Growth Brain');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, productId]);

  async function runGrowthBrain() {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`${basePath}/growth-brain/run`, { method: 'POST', body: runBody });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Growth Brain run failed');
    } finally {
      setBusy(false);
    }
  }

  async function generateWeeklyPlan() {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`${basePath}/growth-brain/weekly-plan/generate`, { method: 'POST', body: {} });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Weekly plan generation failed');
    } finally {
      setBusy(false);
    }
  }

  function explain(entityId: string) {
    setSelectedExplanation(explanations.find((item) => item.decisionEntityId === entityId) || null);
    setTab('decisions');
  }

  return (
    <AppLayout>
      <PageHeader
        title="Growth Brain"
        backTo={{ to: basePath, label: 'Product' }}
        actions={
          <>
            <select value={range} onChange={(e) => setRange(e.target.value)} className="btn btn-secondary"><option value="30">30 Days</option><option value="90">90 Days</option><option value="180">180 Days</option></select>
            <button className="btn btn-primary" onClick={runGrowthBrain} disabled={busy}>{busy ? 'Running...' : 'Run Growth Brain'}</button>
          </>
        }
      />
      <ErrorMessage message={error} />
      {loading && <Loading />}

      <Card>
        <p className="entity-card-meta">This analyzes current Strategy, performance, attribution, and Learning data to propose next actions. It does not publish, send email, spend budget, launch campaigns, change CRM, or modify Strategy.</p>
        <div className="profile-meta">{tabs.map((item) => <button key={item.id} className={`btn ${tab === item.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>
      </Card>

      {dashboard && tab === 'overview' && (
        <>
          <Card>
            <h2 className="card-title">Overview</h2>
            <div className="summary-grid">
              <div><span className="summary-label">Latest Decision Run</span><p>{dashboard.latestRun?.status ? labelize(dashboard.latestRun.status) : 'None'}</p></div>
              <div><span className="summary-label">Top Opportunities</span><p>{dashboard.topOpportunities.length}</p></div>
              <div><span className="summary-label">High-Priority Channels</span><p>{dashboard.highPriorityChannels.filter((item) => item.priority === 'high').length}</p></div>
              <div><span className="summary-label">Unallocated Effort</span><p>{dashboard.weeklyAllocation?.unallocatedAmount ?? '-'}</p></div>
              <div><span className="summary-label">Current Weekly Plan</span><p>{dashboard.currentWeeklyPlan?.status ? labelize(dashboard.currentWeeklyPlan.status) : 'None'}</p></div>
              <div><span className="summary-label">External Execution</span><p>{dashboard.externalExecutionAllowed ? 'Allowed' : 'Blocked'}</p></div>
            </div>
          </Card>
          <Card><h2 className="card-title">Top Opportunities</h2><OpportunityTable rows={dashboard.topOpportunities} onWhy={explain} /></Card>
        </>
      )}

      {tab === 'opportunities' && <Card><h2 className="card-title">Opportunities</h2><OpportunityTable rows={opportunities} onWhy={explain} /></Card>}

      {tab === 'channels' && (
        <Card>
          <h2 className="card-title">Channel Priorities</h2>
          <div className="table-wrap"><table><thead><tr><th>Rank</th><th>Channel</th><th>Priority</th><th>Score</th><th>Confidence</th><th>Effort</th><th>Evidence</th><th></th></tr></thead><tbody>{channels.map((item) => <tr key={item._id}><td>{item.rank}</td><td>{labelize(item.channel)}</td><td>{labelize(item.priority)}</td><td>{item.score}</td><td>{labelize(item.confidence)}</td><td>{item.recommendedEffortPercentage ?? '-'}%</td><td>{item.evidenceIds.length}</td><td><button className="btn btn-secondary" onClick={() => explain(item._id)}>Why?</button></td></tr>)}</tbody></table></div>
        </Card>
      )}

      {tab === 'content' && (
        <Card>
          <h2 className="card-title">Content Priorities</h2>
          <div className="table-wrap"><table><thead><tr><th>Rank</th><th>Channel</th><th>Content Type</th><th>Topic</th><th>Quantity</th><th>CTA</th><th>Confidence</th><th></th></tr></thead><tbody>{content.map((item) => <tr key={item._id}><td>{item.rank}</td><td>{labelize(item.channel)}</td><td>{labelize(item.contentKind)}</td><td>{item.topicKey || '-'}</td><td>{item.recommendedQuantity ?? '-'}</td><td>{item.ctaRecommendation || '-'}</td><td>{labelize(item.confidence)}</td><td><button className="btn btn-secondary" onClick={() => explain(item._id)}>Why?</button></td></tr>)}</tbody></table></div>
        </Card>
      )}

      {dashboard && tab === 'weekly' && (
        <>
          <Card>
            <div className="entity-card-header"><h2 className="card-title">Weekly Plan</h2><button className="btn btn-secondary" onClick={generateWeeklyPlan} disabled={busy}>Regenerate From Latest Run</button></div>
            {dashboard.currentWeeklyPlan ? <WeeklyPlanView plan={dashboard.currentWeeklyPlan} onWhy={explain} /> : <p className="entity-card-meta">No current proposed weekly plan yet.</p>}
          </Card>
          <Card><h2 className="card-title">Plan History</h2>{weeklyPlans.map((plan) => <p key={plan._id} className="entity-card-meta">{new Date(plan.weekStart).toLocaleDateString()} - {new Date(plan.weekEnd).toLocaleDateString()} · {labelize(plan.status)} · {plan.objective}</p>)}</Card>
        </>
      )}

      {tab === 'decisions' && (
        <>
          <WhyPanel explanation={selectedExplanation} />
          <Card>
            <h2 className="card-title">Decision Explanations</h2>
            {explanations.map((item) => <div key={item._id} className="entity-card"><div className="entity-card-header"><strong>{labelize(item.decisionType)}</strong><button className="btn btn-secondary" onClick={() => setSelectedExplanation(item)}>Why?</button></div><p>{item.summary}</p><p className="entity-card-meta">{item.reasons.length} structured reason(s) · {item.limitations.length} limitation(s)</p></div>)}
            {!explanations.length && <p className="entity-card-meta">No decision explanations have been generated yet.</p>}
          </Card>
        </>
      )}
    </AppLayout>
  );
}

function OpportunityTable({ rows, onWhy }: { rows: GrowthOpportunity[]; onWhy: (id: string) => void }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Rank</th><th>Opportunity</th><th>Type</th><th>Score</th><th>Impact</th><th>Effort</th><th>Confidence</th><th>Evidence</th><th></th></tr></thead>
        <tbody>
          {rows.map((item) => <tr key={item._id}><td>{item.rank}</td><td>{item.title}</td><td>{labelize(item.type)}</td><td>{item.score}</td><td>{pct(item.scoreComponents?.impact)}</td><td>{labelize(item.effort)}</td><td>{labelize(item.confidence)}</td><td>{item.evidenceIds.length}</td><td><button className="btn btn-secondary" onClick={() => onWhy(item._id)}>Why?</button></td></tr>)}
        </tbody>
      </table>
      {!rows.length && <p className="entity-card-meta">No Growth Brain opportunities have been generated yet.</p>}
    </div>
  );
}

function WeeklyPlanView({ plan, onWhy }: { plan: WeeklyGrowthPlan; onWhy: (id: string) => void }) {
  return (
    <div>
      <p className="entity-card-meta">{new Date(plan.weekStart).toLocaleDateString()} - {new Date(plan.weekEnd).toLocaleDateString()} · {labelize(plan.status)}</p>
      <p>{plan.objective}</p>
      <button className="btn btn-secondary" onClick={() => onWhy(plan._id)}>Why?</button>
      <div className="summary-grid">
        <div><span className="summary-label">Channels</span><p>{plan.channelPriorities.length}</p></div>
        <div><span className="summary-label">Content Items</span><p>{plan.contentPlan.length}</p></div>
        <div><span className="summary-label">Experiments</span><p>{plan.experiments.length}</p></div>
        <div><span className="summary-label">CRM Actions</span><p>{plan.crmActions.length}</p></div>
      </div>
      <h3 className="section-title">Risks</h3>
      <ul className="bullet-list">{plan.risks.map((item, index) => <li key={index}>{item}</li>)}</ul>
      <h3 className="section-title">Assumptions</h3>
      <ul className="bullet-list">{plan.assumptions.map((item, index) => <li key={index}>{item}</li>)}</ul>
    </div>
  );
}
