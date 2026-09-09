import { type FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { Card } from '../components/Card';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import type { LeadCaptureEndpointSummary, LeadDetail, LeadListResponse, LeadSourceType, LeadStatus, LeadSummary } from '../types';

const LEAD_STATUSES: LeadStatus[] = ['new', 'contacted', 'qualified', 'unqualified', 'converted', 'archived'];
const CAPTURE_SOURCE_TYPES: Extract<LeadSourceType, 'website_form' | 'landing_page'>[] = ['website_form', 'landing_page'];

function labelize(value: string): string {
  return value.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function leadName(lead: LeadSummary): string {
  return lead.fullName || [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email || lead.phone || 'Unnamed lead';
}

const emptyManual = { fullName: '', firstName: '', lastName: '', email: '', phone: '', companyName: '', jobTitle: '', notes: '' };
const emptyEndpoint = { name: '', sourceType: 'website_form' as Extract<LeadSourceType, 'website_form' | 'landing_page'>, sourceName: '', allowedOrigins: '', requireConsent: false };

export default function LeadsPage() {
  const { organizationId, productId } = useParams<{ organizationId: string; productId: string }>();
  const basePath = `/organizations/${organizationId}/products/${productId}`;
  const publicBase = `${window.location.origin}/api/v1/public/leads`;

  const [leads, setLeads] = useState<LeadListResponse | null>(null);
  const [endpoints, setEndpoints] = useState<LeadCaptureEndpointSummary[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadDetail | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(emptyManual);
  const [endpointDraft, setEndpointDraft] = useState(emptyEndpoint);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!organizationId || !productId) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (statusFilter) qs.set('status', statusFilter);
      if (search.trim()) qs.set('search', search.trim());
      const [leadData, endpointData] = await Promise.all([
        apiRequest<LeadListResponse>(`${basePath}/leads${qs.toString() ? `?${qs}` : ''}`),
        apiRequest<LeadCaptureEndpointSummary[]>(`${basePath}/lead-capture-endpoints`),
      ]);
      setLeads(leadData);
      setEndpoints(endpointData);
      if (selectedLead && !leadData.items.some((lead) => lead.id === selectedLead.id)) setSelectedLead(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load leads');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, productId, statusFilter]);

  async function openLead(leadId: string) {
    try {
      setSelectedLead(await apiRequest<LeadDetail>(`${basePath}/leads/${leadId}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load lead');
    }
  }

  async function createManualLead(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<{ lead: LeadSummary }>(`${basePath}/leads/manual`, {
        method: 'POST',
        body: {
          ...manual,
          consent: { status: 'unknown' },
        },
      });
      setManual(emptyManual);
      await load();
      if (result.lead?.id) await openLead(result.lead.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add lead');
    } finally {
      setBusy(false);
    }
  }

  async function updateLeadStatus(lead: LeadSummary, status: LeadStatus) {
    setBusy(true);
    setError(null);
    try {
      const updated = await apiRequest<LeadSummary>(`${basePath}/leads/${lead.id}`, { method: 'PATCH', body: { status } });
      setLeads((prev) => prev ? { ...prev, items: prev.items.map((item) => (item.id === updated.id ? updated : item)) } : prev);
      if (selectedLead?.id === updated.id) await openLead(updated.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update lead');
    } finally {
      setBusy(false);
    }
  }

  async function createEndpoint(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await apiRequest<LeadCaptureEndpointSummary>(`${basePath}/lead-capture-endpoints`, {
        method: 'POST',
        body: {
          name: endpointDraft.name,
          sourceType: endpointDraft.sourceType,
          sourceName: endpointDraft.sourceName || undefined,
          allowedOrigins: endpointDraft.allowedOrigins.split('\n').map((v) => v.trim()).filter(Boolean),
          requireConsent: endpointDraft.requireConsent,
        },
      });
      setEndpointDraft(emptyEndpoint);
      setEndpoints((prev) => [created, ...prev]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create capture endpoint');
    } finally {
      setBusy(false);
    }
  }

  async function rotateEndpoint(endpoint: LeadCaptureEndpointSummary) {
    if (!window.confirm('Rotate this public key? Existing embedded forms using the old key will stop working.')) return;
    setBusy(true);
    try {
      const updated = await apiRequest<LeadCaptureEndpointSummary>(`${basePath}/lead-capture-endpoints/${endpoint.id}/rotate-key`, { method: 'POST' });
      setEndpoints((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to rotate key');
    } finally {
      setBusy(false);
    }
  }

  async function disableEndpoint(endpoint: LeadCaptureEndpointSummary) {
    if (!window.confirm('Disable this lead capture endpoint?')) return;
    setBusy(true);
    try {
      const updated = await apiRequest<LeadCaptureEndpointSummary>(`${basePath}/lead-capture-endpoints/${endpoint.id}/disable`, { method: 'POST' });
      setEndpoints((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to disable endpoint');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppLayout>
      <PageHeader title="Leads" backTo={{ to: `/organizations/${organizationId}/products/${productId}`, label: 'Product' }} />
      <ErrorMessage message={error} />
      {loading && <Loading />}

      <Card>
        <h2 className="card-title">Add Lead</h2>
        <form className="form form-grid-2" onSubmit={createManualLead}>
          <div className="field"><label>Name</label><input value={manual.fullName} onChange={(e) => setManual({ ...manual, fullName: e.target.value })} /></div>
          <div className="field"><label>Email</label><input value={manual.email} onChange={(e) => setManual({ ...manual, email: e.target.value })} /></div>
          <div className="field"><label>Phone</label><input value={manual.phone} onChange={(e) => setManual({ ...manual, phone: e.target.value })} /></div>
          <div className="field"><label>Company</label><input value={manual.companyName} onChange={(e) => setManual({ ...manual, companyName: e.target.value })} /></div>
          <div className="field"><label>Job Title</label><input value={manual.jobTitle} onChange={(e) => setManual({ ...manual, jobTitle: e.target.value })} /></div>
          <div className="field field-full"><label>Notes</label><textarea value={manual.notes} onChange={(e) => setManual({ ...manual, notes: e.target.value })} /></div>
          <button className="btn btn-primary" disabled={busy || (!manual.email.trim() && !manual.phone.trim())}>Add Lead</button>
        </form>
      </Card>

      <Card>
        <div className="entity-card-header">
          <h2 className="card-title">Lead List</h2>
          <div className="form-inline" style={{ margin: 0 }}>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              {LEAD_STATUSES.map((status) => <option key={status} value={status}>{labelize(status)}</option>)}
            </select>
            <input placeholder="Search leads" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="btn btn-secondary" onClick={load}>Search</button>
          </div>
        </div>
        {!loading && leads?.items.length === 0 && <p className="entity-card-meta">No leads yet.</p>}
        <div className="grid-cards">
          {leads?.items.map((lead) => (
            <div key={lead.id} className="entity-card" style={{ border: '1px solid var(--border-color, #ddd)', borderRadius: 6, padding: 12 }}>
              <div className="entity-card-header">
                <h3>{leadName(lead)}</h3>
                <span className="quality-badge quality-good">{labelize(lead.status)}</span>
              </div>
              <div className="entity-card-meta">{lead.email || '-'} · {lead.phone || '-'}</div>
              <div className="entity-card-meta">{lead.companyName || '-'} · {labelize(lead.sourceType)}</div>
              <div className="entity-card-meta">Latest: {new Date(lead.latestCapturedAt).toLocaleString()}</div>
              <div className="entity-card-meta">Consent: {labelize(lead.consentStatus)}</div>
              <div className="tag-list">
                <button className="btn btn-secondary" onClick={() => openLead(lead.id)}>Open</button>
                <select value={lead.status} onChange={(e) => updateLeadStatus(lead, e.target.value as LeadStatus)} disabled={busy}>
                  {LEAD_STATUSES.map((status) => <option key={status} value={status}>{labelize(status)}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
        {leads && <p className="entity-card-meta">Showing {leads.items.length} of {leads.total}</p>}
      </Card>

      {selectedLead && (
        <Card>
          <h2 className="card-title">{leadName(selectedLead)}</h2>
          <div className="summary-grid">
            <div><span className="summary-label">Contact</span><p>{selectedLead.email || '-'}<br />{selectedLead.phone || '-'}</p></div>
            <div><span className="summary-label">Company</span><p>{selectedLead.companyName || '-'}<br />{selectedLead.jobTitle || '-'}</p></div>
            <div><span className="summary-label">Consent</span><p>{labelize(selectedLead.consentStatus)}</p></div>
            <div><span className="summary-label">First Touch</span><p>{new Date(selectedLead.firstCapturedAt).toLocaleString()}<br />{labelize(selectedLead.sourceType)}</p></div>
            <div><span className="summary-label">Latest Touch</span><p>{new Date(selectedLead.latestCapturedAt).toLocaleString()}</p></div>
          </div>
          {selectedLead.notes && <p className="entity-card-meta">Notes: {selectedLead.notes}</p>}
          {Object.keys(selectedLead.customFields ?? {}).length > 0 && <pre>{JSON.stringify(selectedLead.customFields, null, 2)}</pre>}
          <h3 className="section-title">Source History</h3>
          {selectedLead.sourceEvents.map((event) => (
            <div key={event.id} className="entity-card-meta" style={{ marginTop: 6 }}>
              {new Date(event.occurredAt).toLocaleString()} · {event.sourceName || labelize(event.sourceType)} · {[event.utmSource, event.utmMedium, event.utmCampaign].filter(Boolean).join(' / ') || '-'}
            </div>
          ))}
        </Card>
      )}

      <Card>
        <h2 className="card-title">Lead Capture Forms / Endpoints</h2>
        <form className="form form-grid-2" onSubmit={createEndpoint}>
          <div className="field"><label>Name</label><input required value={endpointDraft.name} onChange={(e) => setEndpointDraft({ ...endpointDraft, name: e.target.value })} /></div>
          <div className="field"><label>Source</label><select value={endpointDraft.sourceType} onChange={(e) => setEndpointDraft({ ...endpointDraft, sourceType: e.target.value as typeof endpointDraft.sourceType })}>{CAPTURE_SOURCE_TYPES.map((type) => <option key={type} value={type}>{labelize(type)}</option>)}</select></div>
          <div className="field"><label>Source Name</label><input value={endpointDraft.sourceName} onChange={(e) => setEndpointDraft({ ...endpointDraft, sourceName: e.target.value })} /></div>
          <div className="field"><label><input type="checkbox" checked={endpointDraft.requireConsent} onChange={(e) => setEndpointDraft({ ...endpointDraft, requireConsent: e.target.checked })} /> Require consent</label></div>
          <div className="field field-full"><label>Allowed Origins</label><textarea placeholder="https://example.com" value={endpointDraft.allowedOrigins} onChange={(e) => setEndpointDraft({ ...endpointDraft, allowedOrigins: e.target.value })} /></div>
          <button className="btn btn-primary" disabled={busy}>Create Endpoint</button>
        </form>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginTop: 12 }}>
          {endpoints.map((endpoint) => (
            <div key={endpoint.id} className="entity-card" style={{ border: '1px solid var(--border-color, #ddd)', borderRadius: 6, padding: 12 }}>
              <div className="entity-card-header">
                <h3>{endpoint.name}</h3>
                <span className={`quality-badge ${endpoint.active ? 'quality-good' : 'quality-unavailable'}`}>{endpoint.active ? 'Active' : 'Disabled'}</span>
              </div>
              <div className="entity-card-meta">{labelize(endpoint.sourceType)} · Consent {endpoint.requireConsent ? 'required' : 'optional'}</div>
              <div className="entity-card-meta">Public key: {endpoint.publicKey}</div>
              <div className="entity-card-meta">POST {publicBase}/{endpoint.publicKey}</div>
              <pre>{JSON.stringify({ email: 'person@example.com', phone: '+15551234567', consent: true, fields: { plan: 'demo' } }, null, 2)}</pre>
              <div className="tag-list">
                <button className="btn btn-secondary" onClick={() => rotateEndpoint(endpoint)} disabled={busy}>Rotate Key</button>
                {endpoint.active && <button className="btn btn-secondary" onClick={() => disableEndpoint(endpoint)} disabled={busy}>Disable</button>}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </AppLayout>
  );
}
