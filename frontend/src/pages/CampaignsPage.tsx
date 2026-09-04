import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { Card } from '../components/Card';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import type { Campaign, CampaignStatus, CampaignType } from '../types';

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

export default function CampaignsPage() {
  const { organizationId, productId } = useParams<{ organizationId: string; productId: string }>();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const [form, setForm] = useState({ name: '', description: '', type: '', startDate: '', endDate: '' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function loadData() {
    if (!organizationId || !productId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const query = new URLSearchParams();
      if (statusFilter) query.set('status', statusFilter);
      if (typeFilter) query.set('type', typeFilter);
      const qs = query.toString();
      const data = await apiRequest<Campaign[]>(`/organizations/${organizationId}/products/${productId}/campaigns${qs ? `?${qs}` : ''}`);
      setCampaigns(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, productId, statusFilter, typeFilter]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!organizationId || !productId) return;
    setCreating(true);
    setCreateError(null);
    try {
      const body: Record<string, unknown> = { name: form.name };
      if (form.description.trim()) body.description = form.description.trim();
      if (form.type) body.type = form.type;
      if (form.startDate) body.startDate = new Date(form.startDate).toISOString();
      if (form.endDate) body.endDate = new Date(form.endDate).toISOString();

      const campaign = await apiRequest<Campaign>(`/organizations/${organizationId}/products/${productId}/campaigns`, {
        method: 'POST',
        body,
      });
      navigate(`/organizations/${organizationId}/products/${productId}/campaigns/${campaign.id}`);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Failed to create campaign');
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <Loading />
      </AppLayout>
    );
  }

  if (loadError) {
    return (
      <AppLayout>
        <ErrorMessage message={loadError} />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader backTo={{ to: `/organizations/${organizationId}/products/${productId}`, label: 'Product' }} title="Campaigns" />

      <Card>
        <h2 className="card-title">Create Campaign</h2>
        <form onSubmit={handleCreate} className="form form-grid-2">
          <div className="field">
            <label htmlFor="campaign-name">Name</label>
            <input id="campaign-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="campaign-type">Type</label>
            <select id="campaign-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="">-</option>
              {CAMPAIGN_TYPES.map((t) => (
                <option key={t} value={t}>
                  {labelize(t)}
                </option>
              ))}
            </select>
          </div>
          <div className="field field-full">
            <label htmlFor="campaign-description">Description</label>
            <textarea id="campaign-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="campaign-start">Start Date</label>
            <input id="campaign-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="campaign-end">End Date</label>
            <input id="campaign-end" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>
          <ErrorMessage message={createError} />
          <button type="submit" className="btn btn-primary" disabled={creating}>
            {creating ? 'Creating...' : 'Create Campaign'}
          </button>
        </form>
      </Card>

      <div className="section">
        <div className="entity-card-header" style={{ marginBottom: 12 }}>
          <h2 className="section-title" style={{ margin: 0 }}>
            All Campaigns
          </h2>
          <div className="form-inline" style={{ margin: 0 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All statuses</option>
                {CAMPAIGN_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {labelize(s)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="">All types</option>
                {CAMPAIGN_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {labelize(t)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {campaigns.length === 0 ? (
          <Card className="empty-state">No campaigns yet.</Card>
        ) : (
          <div className="grid-cards">
            {campaigns.map((campaign) => {
              const primaryAudience = campaign.audienceChannelMapping?.audiences.find(
                (a) => a.audienceSegmentId === campaign.audienceChannelMapping?.primaryAudienceSegmentId,
              );
              return (
                <Card key={campaign.id} className="entity-card">
                  <div className="entity-card-header">
                    <h3>{campaign.name}</h3>
                    <span className={`quality-badge ${statusQualityClass(campaign.status)}`}>{labelize(campaign.status)}</span>
                  </div>
                  <div className="tag-list">
                    {campaign.type && <span className="tag">{labelize(campaign.type)}</span>}
                    <span className="tag">v{campaign.planningMetadata.version}</span>
                  </div>
                  <div className="entity-card-meta">
                    Goal: {campaign.goal ? campaign.goal.title : 'Not defined yet'}
                  </div>
                  <div className="entity-card-meta">
                    Primary audience: {primaryAudience?.label ?? campaign.audienceChannelMapping?.primaryAudienceSegmentId ?? 'Not defined yet'}
                  </div>
                  <div className="entity-card-meta">
                    Primary channel: {campaign.audienceChannelMapping?.primaryChannel ? labelize(campaign.audienceChannelMapping.primaryChannel) : 'Not defined yet'}
                  </div>
                  <div className="entity-card-meta">Plan activities: {campaign.plan?.activities.length ?? 0}</div>
                  <div className="entity-card-meta">
                    {campaign.startDate ? new Date(campaign.startDate).toLocaleDateString() : '-'} &rarr;{' '}
                    {campaign.endDate ? new Date(campaign.endDate).toLocaleDateString() : '-'}
                  </div>
                  <div className="entity-card-meta">Updated: {campaign.updatedAt ? new Date(campaign.updatedAt).toLocaleString() : '-'}</div>
                  <Link to={`/organizations/${organizationId}/products/${productId}/campaigns/${campaign.id}`} className="btn btn-secondary btn-block">
                    Open Campaign
                  </Link>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
