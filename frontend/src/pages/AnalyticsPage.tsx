import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { Card } from '../components/Card';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import type { AnalyticsCsvExport, AnalyticsDashboard, AnalyticsDataHealth, AnalyticsFunnel, AnalyticsReport, AnalyticsReportType, Campaign, CampaignComparisonAnalytics, ContentAnalytics, SocialAnalyticsDashboard, SocialMetrics, WebAnalyticsDashboard, WebAnalyticsSite } from '../types';

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

function docId(item: { _id?: string; id?: string }): string {
  return item.id || item._id || '';
}

function metricValue(metrics: SocialMetrics, key: keyof SocialMetrics): string {
  const value = metrics[key];
  return typeof value === 'number' ? String(value) : 'Not available';
}

export default function AnalyticsPage() {
  const { organizationId, productId } = useParams<{ organizationId: string; productId: string }>();
  const basePath = `/organizations/${organizationId}/products/${productId}`;
  const [dashboard, setDashboard] = useState<AnalyticsDashboard | null>(null);
  const [funnel, setFunnel] = useState<AnalyticsFunnel | null>(null);
  const [content, setContent] = useState<ContentAnalytics | null>(null);
  const [campaignComparison, setCampaignComparison] = useState<CampaignComparisonAnalytics | null>(null);
  const [sites, setSites] = useState<WebAnalyticsSite[]>([]);
  const [website, setWebsite] = useState<WebAnalyticsDashboard | null>(null);
  const [social, setSocial] = useState<SocialAnalyticsDashboard | null>(null);
  const [reports, setReports] = useState<AnalyticsReport[]>([]);
  const [health, setHealth] = useState<AnalyticsDataHealth | null>(null);
  const [siteDraft, setSiteDraft] = useState({ name: '', websiteUrl: '', allowedOrigins: '' });
  const [reportDraft, setReportDraft] = useState<{ name: string; reportType: AnalyticsReportType }>({ name: '', reportType: 'dashboard' });
  const [snippet, setSnippet] = useState('');
  const [exportResult, setExportResult] = useState<AnalyticsCsvExport | null>(null);
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
      const [dashboardData, campaignData, sitesData, websiteData, socialData, reportsData, healthData] = await Promise.all([
        apiRequest<AnalyticsDashboard>(`${basePath}/analytics/dashboard?${params.toString()}`),
        apiRequest<Campaign[]>(`${basePath}/campaigns`),
        apiRequest<WebAnalyticsSite[]>(`${basePath}/analytics/sites`),
        apiRequest<WebAnalyticsDashboard>(`${basePath}/analytics/website?${params.toString()}`),
        apiRequest<SocialAnalyticsDashboard>(`${basePath}/analytics/social?${params.toString()}`),
        apiRequest<AnalyticsReport[]>(`${basePath}/analytics/reports`),
        apiRequest<AnalyticsDataHealth>(`${basePath}/analytics/data-health`),
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
      setSites(sitesData);
      setWebsite(websiteData);
      setSocial(socialData);
      setReports(reportsData);
      setHealth(healthData);
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

  async function createSite() {
    if (!siteDraft.name.trim() || !siteDraft.websiteUrl.trim()) return;
    setBusy(true);
    try {
      const allowedOrigins = siteDraft.allowedOrigins.split('\n').map((item) => item.trim()).filter(Boolean);
      const site = await apiRequest<WebAnalyticsSite>(`${basePath}/analytics/sites`, { method: 'POST', body: { name: siteDraft.name, websiteUrl: siteDraft.websiteUrl, allowedOrigins } });
      const snippetData = await apiRequest<{ snippet: string }>(`${basePath}/analytics/sites/${docId(site)}/snippet`);
      setSnippet(snippetData.snippet);
      setSiteDraft({ name: '', websiteUrl: '', allowedOrigins: '' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Website analytics site creation failed');
    } finally {
      setBusy(false);
    }
  }

  async function showSnippet(siteId: string) {
    setBusy(true);
    try {
      const data = await apiRequest<{ snippet: string }>(`${basePath}/analytics/sites/${siteId}/snippet`);
      setSnippet(data.snippet);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Snippet load failed');
    } finally {
      setBusy(false);
    }
  }

  async function disableSite(siteId: string) {
    setBusy(true);
    try {
      await apiRequest(`${basePath}/analytics/sites/${siteId}/disable`, { method: 'POST', body: {} });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Website analytics site disable failed');
    } finally {
      setBusy(false);
    }
  }

  async function createReport() {
    if (!reportDraft.name.trim()) return;
    setBusy(true);
    try {
      await apiRequest(`${basePath}/analytics/reports`, { method: 'POST', body: { ...reportDraft, filters: { range, timezone: 'UTC', ...(campaignId ? { campaignId } : {}), ...(channel ? { channel } : {}) } } });
      setReportDraft({ name: '', reportType: 'dashboard' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Report creation failed');
    } finally {
      setBusy(false);
    }
  }

  async function runReport(reportId: string) {
    setBusy(true);
    try {
      await apiRequest(`${basePath}/analytics/reports/${reportId}/run`, { method: 'POST', body: {} });
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Report run failed');
    } finally {
      setBusy(false);
    }
  }

  async function archiveReport(reportId: string) {
    setBusy(true);
    try {
      await apiRequest(`${basePath}/analytics/reports/${reportId}/archive`, { method: 'POST', body: {} });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Report archive failed');
    } finally {
      setBusy(false);
    }
  }

  async function exportAnalytics(reportType: AnalyticsReportType) {
    setBusy(true);
    try {
      const data = await apiRequest<AnalyticsCsvExport>(`${basePath}/analytics/export`, { method: 'POST', body: { reportType, format: 'csv', includeHeaders: true, filters: { range, timezone: 'UTC', ...(campaignId ? { campaignId } : {}), ...(channel ? { channel } : {}) } } });
      setExportResult(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Analytics export failed');
    } finally {
      setBusy(false);
    }
  }

  async function syncSocialMetrics(publicationId: string) {
    setBusy(true);
    try {
      await apiRequest(`${basePath}/analytics/social/posts/${publicationId}/sync`, { method: 'POST', body: {} });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Social metrics sync failed');
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
              <div><span className="summary-label">Website Page Views</span><p>{dashboard.summary.webPageViews || 0}</p></div>
              <div><span className="summary-label">Website Conversions</span><p>{(dashboard.summary.webFormSubmits || 0) + (dashboard.summary.webCustomConversions || 0)}</p></div>
            </div>
            <p className="entity-card-meta">Won Opportunity Value: {dashboard.summary.wonOpportunityValueByCurrency.map((item) => `${item.currency} ${item.amount}`).join(' · ') || '-'}</p>
          </Card>

          <Card>
            <h2 className="card-title">Website Tracking</h2>
            <div className="form form-grid-2">
              <div className="field"><label>Site Name</label><input value={siteDraft.name} onChange={(e) => setSiteDraft((draft) => ({ ...draft, name: e.target.value }))} placeholder="Marketing website" /></div>
              <div className="field"><label>Website URL</label><input value={siteDraft.websiteUrl} onChange={(e) => setSiteDraft((draft) => ({ ...draft, websiteUrl: e.target.value }))} placeholder="https://example.com" /></div>
              <div className="field"><label>Allowed Origins</label><textarea value={siteDraft.allowedOrigins} onChange={(e) => setSiteDraft((draft) => ({ ...draft, allowedOrigins: e.target.value }))} placeholder="https://example.com" /></div>
              <div className="field"><label>&nbsp;</label><button className="btn btn-primary" onClick={createSite} disabled={busy || !siteDraft.name || !siteDraft.websiteUrl}>Create Site</button></div>
            </div>
            {!!snippet && <pre className="code-block">{snippet}</pre>}
            <div className="table-wrap">
              <table>
                <thead><tr><th>Site</th><th>Origin</th><th>Status</th><th>Tracking Key</th><th>Actions</th></tr></thead>
                <tbody>{sites.map((site) => {
                  const id = docId(site);
                  return <tr key={id}><td>{site.name}</td><td>{site.normalizedOrigin}</td><td>{site.status}</td><td>{site.trackingKey}</td><td><button className="btn btn-secondary" onClick={() => showSnippet(id)} disabled={busy}>Snippet</button> {site.status === 'active' && <button className="btn btn-secondary" onClick={() => disableSite(id)} disabled={busy}>Disable</button>}</td></tr>;
                })}</tbody>
              </table>
            </div>
            {!sites.length && <p className="entity-card-meta">No tracked sites yet.</p>}
          </Card>

          {website && (
            <Card>
              <h2 className="card-title">Website Analytics</h2>
              <div className="summary-grid">
                <div><span className="summary-label">Active Sites</span><p>{website.summary.activeSites}</p></div>
                <div><span className="summary-label">Page Views</span><p>{website.summary.pageViews}</p></div>
                <div><span className="summary-label">CTA Clicks</span><p>{website.summary.ctaClicks}</p></div>
                <div><span className="summary-label">Form Views</span><p>{website.summary.formViews}</p></div>
                <div><span className="summary-label">Form Submits</span><p>{website.summary.formSubmits}</p></div>
                <div><span className="summary-label">Custom Conversions</span><p>{website.summary.customConversions}</p></div>
                <div><span className="summary-label">Visitors</span><p>{website.summary.uniqueVisitors}</p></div>
                <div><span className="summary-label">Sessions</span><p>{website.summary.uniqueSessions}</p></div>
              </div>
              <h3 className="section-title">Top Pages</h3>
              {website.topPages.map((item) => <Bar key={item.key} label={item.key} value={item.count} max={Math.max(1, website.topPages[0]?.count || 0)} />)}
              <h3 className="section-title">Sources and Campaigns</h3>
              <div className="tag-list">{[...website.topSources, ...website.topCampaigns].map((item) => <span key={`${item.key}-${item.count}`} className="quality-badge quality-unavailable">{item.key}: {item.count}</span>)}</div>
              <h3 className="section-title">Referrers</h3>
              {website.topReferrers.map((item) => <p key={item.key} className="entity-card-meta">{item.key} · {item.count}</p>)}
            </Card>
          )}

          {social && (
            <Card>
              <h2 className="card-title">Social Analytics</h2>
              <div className="summary-grid">
                <div><span className="summary-label">Published Posts</span><p>{social.summary.postsPublished}</p></div>
                <div><span className="summary-label">Posts With Metrics</span><p>{social.summary.postsWithMetrics}</p></div>
                <div><span className="summary-label">Impressions</span><p>{metricValue(social.summary.metrics, 'impressions')}</p></div>
                <div><span className="summary-label">Reach</span><p>{metricValue(social.summary.metrics, 'reach')}</p></div>
                <div><span className="summary-label">Reactions</span><p>{metricValue(social.summary.metrics, 'reactions')}</p></div>
                <div><span className="summary-label">Comments</span><p>{metricValue(social.summary.metrics, 'comments')}</p></div>
                <div><span className="summary-label">Shares/Reposts</span><p>{metricValue(social.summary.metrics, 'shares') !== 'Not available' ? metricValue(social.summary.metrics, 'shares') : metricValue(social.summary.metrics, 'reposts')}</p></div>
                <div><span className="summary-label">Clicks</span><p>{metricValue(social.summary.metrics, 'clicks')}</p></div>
              </div>
              <h3 className="section-title">Platform Metrics</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Platform</th><th>Posts</th><th>With Metrics</th><th>Impressions</th><th>Reach</th><th>Reactions</th><th>Comments</th><th>Shares/Reposts</th></tr></thead>
                  <tbody>{social.platforms.map((item) => <tr key={item.platform}><td>{labelize(item.platform)}</td><td>{item.postsPublished}</td><td>{item.postsWithMetrics}</td><td>{metricValue(item.metrics, 'impressions')}</td><td>{metricValue(item.metrics, 'reach')}</td><td>{metricValue(item.metrics, 'reactions') !== 'Not available' ? metricValue(item.metrics, 'reactions') : metricValue(item.metrics, 'likes')}</td><td>{metricValue(item.metrics, 'comments')}</td><td>{metricValue(item.metrics, 'shares') !== 'Not available' ? metricValue(item.metrics, 'shares') : metricValue(item.metrics, 'reposts')}</td></tr>)}</tbody>
                </table>
              </div>
              <h3 className="section-title">Post Metrics</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Platform</th><th>Post</th><th>Impressions</th><th>Reach</th><th>Comments</th><th>Last Synced</th><th>Actions</th></tr></thead>
                  <tbody>{social.posts.map((post) => <tr key={post.publicationId}><td>{labelize(post.platform)}</td><td>{post.externalPostId || '-'}</td><td>{metricValue(post.metrics, 'impressions')}</td><td>{metricValue(post.metrics, 'reach')}</td><td>{metricValue(post.metrics, 'comments')}</td><td>{post.lastSyncedAt ? new Date(post.lastSyncedAt).toLocaleString() : 'Not available'}</td><td><button className="btn btn-secondary" onClick={() => syncSocialMetrics(post.publicationId)} disabled={busy}>Sync Metrics</button></td></tr>)}</tbody>
                </table>
              </div>
              {!social.posts.length && <p className="entity-card-meta">No published social posts in this range.</p>}
            </Card>
          )}

          <Card>
            <h2 className="card-title">Reports and Export</h2>
            <div className="form form-grid-2">
              <div className="field"><label>Report Name</label><input value={reportDraft.name} onChange={(e) => setReportDraft((draft) => ({ ...draft, name: e.target.value }))} placeholder="Monthly website summary" /></div>
              <div className="field"><label>Report Type</label><select value={reportDraft.reportType} onChange={(e) => setReportDraft((draft) => ({ ...draft, reportType: e.target.value as AnalyticsReportType }))}><option value="dashboard">Dashboard</option><option value="funnel">Funnel</option><option value="content">Content</option><option value="campaign_comparison">Campaign Comparison</option><option value="website">Website</option></select></div>
              <div><button className="btn btn-primary" onClick={createReport} disabled={busy || !reportDraft.name}>Save Report</button></div>
              <div><button className="btn btn-secondary" onClick={() => exportAnalytics(reportDraft.reportType)} disabled={busy}>Export CSV</button></div>
            </div>
            {exportResult && <p className="entity-card-meta">Export ready: {exportResult.filename} · {exportResult.rowCount} rows</p>}
            <div className="table-wrap">
              <table>
                <thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead>
                <tbody>{reports.map((report) => {
                  const id = docId(report);
                  return <tr key={id}><td>{report.name}</td><td>{labelize(report.reportType)}</td><td>{report.status}</td><td>{new Date(report.updatedAt).toLocaleDateString()}</td><td><button className="btn btn-secondary" onClick={() => runReport(id)} disabled={busy}>Run</button> <button className="btn btn-secondary" onClick={() => archiveReport(id)} disabled={busy}>Archive</button></td></tr>;
                })}</tbody>
              </table>
            </div>
            {!reports.length && <p className="entity-card-meta">No saved reports yet.</p>}
          </Card>

          {health && (
            <Card>
              <h2 className="card-title">Data Health</h2>
              <div className="summary-grid">
                <div><span className="summary-label">Status</span><p>{labelize(health.status)}</p></div>
                <div><span className="summary-label">Generated</span><p>{new Date(health.generatedAt).toLocaleString()}</p></div>
              </div>
              {health.checks.map((check) => <p key={check.code} className="entity-card-meta">{labelize(check.code)} · {labelize(check.status)} · {check.message}{check.action ? ` · ${check.action}` : ''}</p>)}
              <button className="btn btn-secondary" onClick={backfill} disabled={busy}>Run Backfill</button>
            </Card>
          )}

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
