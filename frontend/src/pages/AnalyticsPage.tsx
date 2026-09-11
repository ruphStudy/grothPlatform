import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { Card } from '../components/Card';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import type { AnalyticsDashboard, AnalyticsFunnel, Campaign, CampaignComparisonAnalytics, ContentAnalytics } from '../types';

function labelize(value: string): string {
  return value.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function percent(value: number | null): string {
  return value === null ? '-' : `${Math.round(value * 1000) / 10}%`;
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const width = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div className="bar-row">
      <div className="bar-label">{label}</div>
      <div className="bar-track"><div className="bar-fill" style={{ width: `${width}%` }} /></div>
      <div className="bar-value">{value}</div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { organizationId, productId } = useParams<{ organizationId: string; productId: string }>();
  const basePath = `/organizations/${organizationId}/products/${productId}`;
  const [dashboard, setDashboard] = useState<AnalyticsDashboard | null>(null);
  const [funnel, setFunnel] = useState<AnalyticsFunnel | null>(null);
  const [content, setContent] = useState<ContentAnalytics | null>(null);
  const [campaignComparison, setCampaignComparison] = useState<CampaignComparisonAnalytics | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [range, setRange] = useState('30d');
  const [campaignId, setCampaignId] = useState('');
  const [channel, setChannel] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!organizationId || !productId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ range, timezone: 'UTC' });
      if (campaignId) params.set('campaignId', campaignId);
      if (channel) params.set('channel', channel);
      const [dashboardData, campaignData] = await Promise.all([
        apiRequest<AnalyticsDashboard>(`${basePath}/analytics/dashboard?${params.toString()}`),
        apiRequest<Campaign[]>(`${basePath}/campaigns`),
      ]);
      const [funnelData, contentData, comparisonData] = await Promise.all([
        apiRequest<AnalyticsFunnel>(`${basePath}/analytics/funnel?${params.toString()}`),
        apiRequest<ContentAnalytics>(`${basePath}/analytics/content?${params.toString()}`),
        apiRequest<CampaignComparisonAnalytics>(`${basePath}/analytics/campaign-comparison?${params.toString()}`),
      ]);
      setDashboard(dashboardData);
      setFunnel(funnelData);
      setContent(contentData);
      setCampaignComparison(comparisonData);
      setCampaigns(campaignData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, productId, range, campaignId, channel]);

  async function backfill() {
    setBusy(true);
    try {
      await apiRequest(`${basePath}/analytics/backfill`, { method: 'POST', body: {} });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Analytics backfill failed');
    } finally {
      setBusy(false);
    }
  }

  const trendMax = useMemo(() => Math.max(0, ...(dashboard?.trends.map((item) => Number(item.leadsCreated || 0) + Number(item.qualifiedLeads || 0) + Number(item.opportunitiesWon || 0)) ?? [])), [dashboard]);
  const channelMax = useMemo(() => Math.max(0, ...(dashboard?.channels.map((item) => Number(item.activityCount || 0)) ?? [])), [dashboard]);
  const mixMax = useMemo(() => Math.max(0, ...(content?.channelMix.map((item) => item.activityCount) ?? [])), [content]);

  return (
    <AppLayout>
      <PageHeader
        title="Analytics"
        backTo={{ to: basePath, label: 'Product' }}
        actions={<button className="btn btn-secondary" onClick={backfill} disabled={busy}>{busy ? 'Syncing...' : 'Sync Analytics'}</button>}
      />
      <ErrorMessage message={error} />
      {loading && <Loading />}

      <Card>
        <div className="form form-grid-2">
          <div className="field"><label>Date Range</label><select value={range} onChange={(e) => setRange(e.target.value)}><option value="7d">Last 7 Days</option><option value="30d">Last 30 Days</option><option value="90d">Last 90 Days</option></select></div>
          <div className="field"><label>Campaign</label><select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}><option value="">All Campaigns</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></div>
          <div className="field"><label>Channel</label><select value={channel} onChange={(e) => setChannel(e.target.value)}><option value="">All Channels</option><option value="website">Website</option><option value="email">Email</option><option value="linkedin">LinkedIn</option><option value="x">X</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option><option value="blog">Blog</option><option value="crm">CRM</option><option value="manual">Manual</option><option value="import">Import</option><option value="other">Other</option></select></div>
          <div><span className="summary-label">Coverage</span><p>{dashboard ? labelize(dashboard.analyticsCoverageStatus) : '-'}</p></div>
        </div>
      </Card>

      {dashboard && (
        <>
          <Card>
            <h2 className="card-title">Growth Summary</h2>
            <div className="summary-grid">
              <div><span className="summary-label">Leads</span><p>{dashboard.summary.leadsCreated}</p></div>
              <div><span className="summary-label">Qualified Leads</span><p>{dashboard.summary.qualifiedLeads}</p></div>
              <div><span className="summary-label">Opportunities</span><p>{dashboard.summary.opportunitiesCreated}</p></div>
              <div><span className="summary-label">Won Opportunities</span><p>{dashboard.summary.opportunitiesWon}</p></div>
              <div><span className="summary-label">Email Delivered</span><p>{dashboard.summary.emailsDelivered}</p></div>
              <div><span className="summary-label">Published Content</span><p>{dashboard.summary.socialPostsPublished + dashboard.summary.cmsPostsPublished}</p></div>
            </div>
            <p className="entity-card-meta">Won Opportunity Value: {dashboard.summary.wonOpportunityValueByCurrency.map((item) => `${item.currency} ${item.amount}`).join(' · ') || '-'}</p>
          </Card>

          <Card>
            <h2 className="card-title">Trend</h2>
            {!dashboard.trends.length && <p className="entity-card-meta">No analytics data yet.</p>}
            {dashboard.trends.map((item) => <Bar key={String(item.period)} label={`${item.period} · Leads ${item.leadsCreated || 0} · Qualified ${item.qualifiedLeads || 0} · Won ${item.opportunitiesWon || 0}`} value={Number(item.leadsCreated || 0) + Number(item.qualifiedLeads || 0) + Number(item.opportunitiesWon || 0)} max={trendMax} />)}
          </Card>

          {funnel && (
            <Card>
              <h2 className="card-title">Funnel</h2>
              <p className="entity-card-meta">{funnel.cohort.semantics} · {new Date(funnel.cohort.from).toLocaleDateString()} to {new Date(funnel.cohort.to).toLocaleDateString()} · Cohort {funnel.cohort.cohortSize}{funnel.cohort.channelRule ? ` · ${funnel.cohort.channelRule}` : ''}</p>
              <div className="summary-grid">
                {funnel.stages.filter((stage) => stage.key !== 'opportunity_lost').map((stage) => (
                  <div key={stage.key}><span className="summary-label">{stage.label}</span><p>{stage.count}</p><small>{percent(stage.conversionFromPrevious)} from previous · Drop-off {stage.dropOffFromPrevious ?? '-'}</small></div>
                ))}
              </div>
              <div className="summary-grid" style={{ marginTop: 12 }}>
                {Object.entries(funnel.durations).map(([key, value]) => <div key={key}><span className="summary-label">{labelize(key)}</span><p>{value.medianHours === null ? '-' : `${Math.round(value.medianHours)}h`}</p><small>Average {value.averageHours === null ? '-' : `${Math.round(value.averageHours)}h`} · n={value.sampleSize}</small></div>)}
              </div>
              <h3 className="section-title">Funnel by Channel</h3>
              {funnel.breakdowns.byChannel.map((item) => <Bar key={item.key} label={`${labelize(item.label)} · Qualified ${item.qualified} · Opp ${item.opportunities} · Won ${item.won}`} value={item.leads} max={funnel.cohort.cohortSize} />)}
            </Card>
          )}

          <Card>
            <h2 className="card-title">Channel Performance</h2>
            {!dashboard.channels.length && <p className="entity-card-meta">No analytics data yet.</p>}
            {dashboard.channels.map((item) => <Bar key={String(item.channel)} label={`${labelize(String(item.channel))} · Leads ${item.leadsCreated || 0} · Qualified ${item.qualifiedLeads || 0} · Opportunities ${item.opportunitiesCreated || 0} · Won ${item.opportunitiesWon || 0}`} value={Number(item.activityCount || 0)} max={channelMax} />)}
          </Card>

          {content && (
            <Card>
              <h2 className="card-title">Content Analytics</h2>
              <div className="summary-grid">
                <div><span className="summary-label">Content Generated</span><p>{content.summary.versionsGenerated}</p></div>
                <div><span className="summary-label">Creative Generated</span><p>{content.summary.creativeAssetsGenerated}</p></div>
                <div><span className="summary-label">Social Published</span><p>{content.summary.socialPublications}</p></div>
                <div><span className="summary-label">Blog Published</span><p>{content.summary.cmsPublications}</p></div>
                <div><span className="summary-label">Email Accepted</span><p>{content.summary.emailAccepted}</p></div>
                <div><span className="summary-label">Publication Rate</span><p>{percent(content.summary.publicationRate)}</p></div>
              </div>
              <p className="entity-card-meta">Publication rate denominator: {content.summary.publicationRateDenominator}</p>
              <h3 className="section-title">Content Kinds</h3>
              {content.contentKindBreakdown.map((item) => <Bar key={item.key} label={labelize(item.key)} value={item.count} max={content.summary.versionsGenerated} />)}
              <h3 className="section-title">Quality and Review</h3>
              <p className="entity-card-meta">Average Quality Score {content.quality.averageQualityScore === null ? '-' : Math.round(content.quality.averageQualityScore)} · Sample {content.quality.sampleSize}</p>
              <div className="tag-list">{content.humanReviewDecisionBreakdown.map((item) => <span key={item.key} className="quality-badge quality-unavailable">{item.key}: {item.count}</span>)}</div>
              <h3 className="section-title">Creative Selection Status</h3>
              <div className="tag-list">{content.creative.reviewStatus.map((item) => <span key={item.key} className="quality-badge quality-unavailable">{labelize(item.key)}: {item.count}</span>)}</div>
            </Card>
          )}

          {content && (
            <Card>
              <h2 className="card-title">Channel Mix</h2>
              {content.channelMix.map((item) => <Bar key={item.channel} label={`${labelize(item.channel)} · ${percent(item.activityShare)} of activity events`} value={item.activityCount} max={mixMax} />)}
              {!content.channelMix.length && <p className="entity-card-meta">No channel activity yet.</p>}
            </Card>
          )}

          <Card>
            <h2 className="card-title">Operational Channels</h2>
            <div className="summary-grid">
              <div><span className="summary-label">Email Accepted</span><p>{dashboard.summary.emailsAccepted}</p></div>
              <div><span className="summary-label">Email Delivery Rate</span><p>{percent(dashboard.summary.emailDeliveryRate)}</p></div>
              <div><span className="summary-label">Recorded Opens</span><p>{dashboard.summary.recordedEmailOpens}</p></div>
              <div><span className="summary-label">Recorded Clicks</span><p>{dashboard.summary.recordedEmailClicks}</p></div>
              <div><span className="summary-label">Social Published</span><p>{dashboard.summary.socialPostsPublished}</p></div>
              <div><span className="summary-label">Blog Published</span><p>{dashboard.summary.cmsPostsPublished}</p></div>
              <div><span className="summary-label">Blog Drafts</span><p>{dashboard.summary.cmsDraftsCreated}</p></div>
              <div><span className="summary-label">Win Rate</span><p>{percent(dashboard.summary.closedOpportunityWinRate)}</p></div>
            </div>
          </Card>

          <Card>
            <h2 className="card-title">Campaign Performance</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Campaign</th><th>Activity</th><th>Content</th><th>Social</th><th>Blog</th><th>Email Sent</th><th>Leads</th><th>Qualified</th><th>Opportunities</th><th>Won</th></tr></thead>
                <tbody>{(campaignComparison?.campaigns.length ? campaignComparison.campaigns : dashboard.campaigns).map((item) => <tr key={String(item.campaignId)}><td><Link to={`${basePath}/campaigns/${item.campaignId}`}>{String(item.campaignName)}</Link></td><td>{item.activityCount ?? '-'}</td><td>{item.contentPieces ?? item.contentGenerated}</td><td>{item.publishedSocial ?? item.socialPublished}</td><td>{item.publishedBlog ?? item.blogPublished}</td><td>{item.emailsAccepted ?? item.emailSent}</td><td>{item.leads}</td><td>{item.qualified ?? item.qualifiedLeads}</td><td>{item.opportunities}</td><td>{item.won ?? item.wonOpportunities}</td></tr>)}</tbody>
              </table>
            </div>
            {!dashboard.campaigns.length && <p className="entity-card-meta">No campaign-linked analytics yet.</p>}
          </Card>

          <Card>
            <h2 className="card-title">Recent Analytics Activity</h2>
            {dashboard.recentActivity.map((item) => <p key={item.id} className="entity-card-meta">{new Date(item.occurredAt).toLocaleString()} · {labelize(item.eventType)} · {labelize(item.channel)} · {item.platform || '-'}</p>)}
            {!dashboard.recentActivity.length && <p className="entity-card-meta">No analytics data yet.</p>}
            <p className="entity-card-meta">Last updated at {dashboard.lastUpdatedAt ? new Date(dashboard.lastUpdatedAt).toLocaleString() : '-'}</p>
          </Card>
        </>
      )}
    </AppLayout>
  );
}
