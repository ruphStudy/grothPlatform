import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { Card } from '../components/Card';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import type {
  LeadCaptureEndpointSummary,
  LeadCommunicationEligibility,
  LeadConsentStatus,
  LeadDetail,
  LeadExportResponse,
  LeadIdentityConflictSummary,
  LeadImportSummary,
  LeadListResponse,
  LeadQualificationGrade,
  LeadQualificationStatus,
  LeadSourceType,
  LeadStatus,
  LeadSummary,
} from '../types';

const LEAD_STATUSES: LeadStatus[] = ['new', 'contacted', 'qualified', 'unqualified', 'converted', 'archived'];
const SOURCE_TYPES: LeadSourceType[] = ['website_form', 'landing_page', 'manual', 'social', 'cms', 'campaign', 'api', 'import', 'other'];
const GRADES: LeadQualificationGrade[] = ['hot', 'warm', 'cool', 'low'];
const QUALIFICATION_STATUSES: LeadQualificationStatus[] = ['qualified', 'needs_review', 'unqualified', 'insufficient_data'];
const ELIGIBILITIES: LeadCommunicationEligibility[] = ['allowed', 'restricted', 'unknown'];
const CONSENT_STATUSES: LeadConsentStatus[] = ['unknown', 'granted', 'denied'];
const CAPTURE_SOURCE_TYPES: Extract<LeadSourceType, 'website_form' | 'landing_page'>[] = ['website_form', 'landing_page'];

function labelize(value: string): string {
  return value.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function leadName(lead: LeadSummary): string {
  return lead.fullName || [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email || lead.phone || 'Unnamed lead';
}

const emptyManual = { fullName: '', firstName: '', lastName: '', email: '', phone: '', companyName: '', jobTitle: '', notes: '' };
const emptyEndpoint = { name: '', sourceType: 'website_form' as Extract<LeadSourceType, 'website_form' | 'landing_page'>, sourceName: '', allowedOrigins: '', requireConsent: false };
const emptyFilters = {
  search: '',
  status: '',
  qualificationStatus: '',
  grade: '',
  communicationEligibility: '',
  sourceType: '',
  campaignId: '',
  consentStatus: '',
  createdFrom: '',
  createdTo: '',
  latestCapturedFrom: '',
  latestCapturedTo: '',
  hasEmail: '',
  hasPhone: '',
  sort: 'latestCapturedAt',
  order: 'desc',
  page: 1,
  limit: 25,
};

export default function LeadsPage() {
  const { organizationId, productId } = useParams<{ organizationId: string; productId: string }>();
  const basePath = `/organizations/${organizationId}/products/${productId}`;
  const publicBase = `${window.location.origin}/api/v1/public/leads`;

  const [leads, setLeads] = useState<LeadListResponse | null>(null);
  const [endpoints, setEndpoints] = useState<LeadCaptureEndpointSummary[]>([]);
  const [conflicts, setConflicts] = useState<LeadIdentityConflictSummary[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadDetail | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filters, setFilters] = useState(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [manual, setManual] = useState(emptyManual);
  const [endpointDraft, setEndpointDraft] = useState(emptyEndpoint);
  const [importDraft, setImportDraft] = useState({ sourceName: '', csv: '' });
  const [importSummary, setImportSummary] = useState<LeadImportSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const currentFilterBody = useMemo(() => {
    const { page, limit, ...rest } = filters;
    return Object.fromEntries(Object.entries(rest).filter(([, value]) => String(value).trim())) as Record<string, string>;
  }, [filters]);

  async function load() {
    if (!organizationId || !productId) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (String(value).trim()) qs.set(key, String(value));
      });
      const [leadData, endpointData, conflictData] = await Promise.all([
        apiRequest<LeadListResponse>(`${basePath}/leads${qs.toString() ? `?${qs}` : ''}`),
        apiRequest<LeadCaptureEndpointSummary[]>(`${basePath}/lead-capture-endpoints`),
        apiRequest<LeadIdentityConflictSummary[]>(`${basePath}/leads/identity-conflicts`),
      ]);
      setLeads(leadData);
      setEndpoints(endpointData);
      setConflicts(conflictData);
      setSelectedIds((prev) => prev.filter((id) => leadData.items.some((lead) => lead.id === id)));
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
  }, [organizationId, productId, filters.status, filters.qualificationStatus, filters.grade, filters.communicationEligibility, filters.sourceType, filters.consentStatus, filters.hasEmail, filters.hasPhone, filters.sort, filters.order, filters.page, filters.limit]);

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
        body: { ...manual, consent: { status: 'unknown' } },
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

  async function bulkStatus(status: LeadStatus) {
    if (!selectedIds.length) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`${basePath}/leads/bulk-status`, { method: 'PATCH', body: { leadIds: selectedIds, status } });
      setNotice(`${selectedIds.length} leads updated to ${labelize(status)}.`);
      setSelectedIds([]);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update selected leads');
    } finally {
      setBusy(false);
    }
  }

  async function recalculateSelectedLead() {
    if (!selectedLead) return;
    setBusy(true);
    try {
      await apiRequest(`${basePath}/leads/${selectedLead.id}/recalculate-qualification`, { method: 'POST' });
      await openLead(selectedLead.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to recalculate qualification');
    } finally {
      setBusy(false);
    }
  }

  async function importCsv(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const summary = await apiRequest<LeadImportSummary>(`${basePath}/leads/import-csv`, { method: 'POST', body: importDraft });
      setImportSummary(summary);
      setNotice(`Imported ${summary.created} created, ${summary.matched} matched, ${summary.conflicts} conflicts, ${summary.invalid} invalid.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to import leads');
    } finally {
      setBusy(false);
    }
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportDraft((prev) => ({ ...prev, sourceName: prev.sourceName || file.name, csv: '' }));
    setImportDraft((prev) => ({ ...prev, csv: '' }));
    const text = await file.text();
    setImportDraft((prev) => ({ ...prev, sourceName: prev.sourceName || file.name, csv: text }));
  }

  async function exportCsv(selectedOnly = false) {
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<LeadExportResponse>(`${basePath}/leads/export-csv`, {
        method: 'POST',
        body: { leadIds: selectedOnly ? selectedIds : undefined, filters: selectedOnly ? undefined : currentFilterBody, includeCustomFields: true },
      });
      const blob = new Blob([result.csv], { type: result.contentType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.fileName;
      a.click();
      URL.revokeObjectURL(url);
      setNotice(`Exported ${result.rowCount} leads.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to export leads');
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

  async function reviewConflict(conflictId: string) {
    setBusy(true);
    try {
      await apiRequest(`${basePath}/leads/identity-conflicts/${conflictId}/reviewed`, { method: 'PATCH' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to review conflict');
    } finally {
      setBusy(false);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  }

  return (
    <AppLayout>
      <PageHeader title="Leads" backTo={{ to: `/organizations/${organizationId}/products/${productId}`, label: 'Product' }} />
      <ErrorMessage message={error} />
      {notice && <p className="entity-card-meta">{notice}</p>}
      {loading && <Loading />}

      <Card>
        <h2 className="card-title">Lead Management</h2>
        <div className="form form-grid-2">
          <div className="field"><label>Search</label><input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })} /></div>
          <div className="field"><label>Status</label><select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}><option value="">All statuses</option>{LEAD_STATUSES.map((status) => <option key={status} value={status}>{labelize(status)}</option>)}</select></div>
          <div className="field"><label>Qualification</label><select value={filters.qualificationStatus} onChange={(e) => setFilters({ ...filters, qualificationStatus: e.target.value, page: 1 })}><option value="">All qualification states</option>{QUALIFICATION_STATUSES.map((status) => <option key={status} value={status}>{labelize(status)}</option>)}</select></div>
          <div className="field"><label>Grade</label><select value={filters.grade} onChange={(e) => setFilters({ ...filters, grade: e.target.value, page: 1 })}><option value="">All grades</option>{GRADES.map((grade) => <option key={grade} value={grade}>{labelize(grade)}</option>)}</select></div>
          <div className="field"><label>Eligibility</label><select value={filters.communicationEligibility} onChange={(e) => setFilters({ ...filters, communicationEligibility: e.target.value, page: 1 })}><option value="">All eligibility</option>{ELIGIBILITIES.map((item) => <option key={item} value={item}>{labelize(item)}</option>)}</select></div>
          <div className="field"><label>Source</label><select value={filters.sourceType} onChange={(e) => setFilters({ ...filters, sourceType: e.target.value, page: 1 })}><option value="">All sources</option>{SOURCE_TYPES.map((source) => <option key={source} value={source}>{labelize(source)}</option>)}</select></div>
          <div className="field"><label>Consent</label><select value={filters.consentStatus} onChange={(e) => setFilters({ ...filters, consentStatus: e.target.value, page: 1 })}><option value="">All consent</option>{CONSENT_STATUSES.map((status) => <option key={status} value={status}>{labelize(status)}</option>)}</select></div>
          <div className="field"><label>Campaign ID</label><input value={filters.campaignId} onChange={(e) => setFilters({ ...filters, campaignId: e.target.value, page: 1 })} /></div>
          <div className="field"><label>Email</label><select value={filters.hasEmail} onChange={(e) => setFilters({ ...filters, hasEmail: e.target.value, page: 1 })}><option value="">Any email</option><option value="true">Has email</option><option value="false">No email</option></select></div>
          <div className="field"><label>Phone</label><select value={filters.hasPhone} onChange={(e) => setFilters({ ...filters, hasPhone: e.target.value, page: 1 })}><option value="">Any phone</option><option value="true">Has phone</option><option value="false">No phone</option></select></div>
          <div className="field"><label>Sort</label><select value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })}><option value="latestCapturedAt">Latest captured</option><option value="createdAt">Created</option><option value="score">Score</option><option value="name">Name</option><option value="company">Company</option></select></div>
          <div className="field"><label>Order</label><select value={filters.order} onChange={(e) => setFilters({ ...filters, order: e.target.value })}><option value="desc">Descending</option><option value="asc">Ascending</option></select></div>
          <div className="field"><label>Created From</label><input type="date" value={filters.createdFrom} onChange={(e) => setFilters({ ...filters, createdFrom: e.target.value, page: 1 })} /></div>
          <div className="field"><label>Created To</label><input type="date" value={filters.createdTo} onChange={(e) => setFilters({ ...filters, createdTo: e.target.value, page: 1 })} /></div>
          <div className="field"><label>Latest From</label><input type="date" value={filters.latestCapturedFrom} onChange={(e) => setFilters({ ...filters, latestCapturedFrom: e.target.value, page: 1 })} /></div>
          <div className="field"><label>Latest To</label><input type="date" value={filters.latestCapturedTo} onChange={(e) => setFilters({ ...filters, latestCapturedTo: e.target.value, page: 1 })} /></div>
        </div>
        <div className="tag-list" style={{ marginTop: 12 }}>
          <button className="btn btn-secondary" onClick={load}>Search</button>
          <button className="btn btn-secondary" onClick={() => setFilters(emptyFilters)}>Reset</button>
          <button className="btn btn-secondary" onClick={() => exportCsv(false)} disabled={busy}>Export filtered</button>
          <button className="btn btn-secondary" onClick={() => exportCsv(true)} disabled={busy || selectedIds.length === 0}>Export selected</button>
          <button className="btn btn-secondary" onClick={() => bulkStatus('archived')} disabled={busy || selectedIds.length === 0}>Archive selected</button>
          <select value="" onChange={(e) => e.target.value && bulkStatus(e.target.value as LeadStatus)} disabled={busy || selectedIds.length === 0}>
            <option value="">Bulk status</option>
            {LEAD_STATUSES.map((status) => <option key={status} value={status}>{labelize(status)}</option>)}
          </select>
        </div>
      </Card>

      <Card>
        <div className="entity-card-header">
          <h2 className="card-title">Lead List</h2>
          {leads && <span className="entity-card-meta">Showing {leads.items.length} of {leads.total}</span>}
        </div>
        {!loading && leads?.items.length === 0 && <p className="entity-card-meta">No leads match the current view.</p>}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 920 }}>
            <thead>
              <tr>
                <th></th>
                <th>Name</th>
                <th>Score</th>
                <th>Grade</th>
                <th>Qualification</th>
                <th>Status</th>
                <th>Source</th>
                <th>Contact</th>
                <th>Company</th>
                <th>Latest</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {leads?.items.map((lead) => (
                <tr key={lead.id} style={{ borderTop: '1px solid var(--border-color, #ddd)' }}>
                  <td><input type="checkbox" checked={selectedIds.includes(lead.id)} onChange={() => toggleSelected(lead.id)} /></td>
                  <td>{leadName(lead)}</td>
                  <td>{lead.qualification?.score ?? '-'}</td>
                  <td>{lead.qualification ? labelize(lead.qualification.grade) : '-'}</td>
                  <td>{lead.qualification ? labelize(lead.qualification.qualificationStatus) : '-'}</td>
                  <td><select value={lead.status} onChange={(e) => updateLeadStatus(lead, e.target.value as LeadStatus)} disabled={busy}>{LEAD_STATUSES.map((status) => <option key={status} value={status}>{labelize(status)}</option>)}</select></td>
                  <td>{labelize(lead.sourceType)}</td>
                  <td>{lead.email || lead.phone || '-'}</td>
                  <td>{lead.companyName || '-'}</td>
                  <td>{new Date(lead.latestCapturedAt).toLocaleDateString()}</td>
                  <td><button className="btn btn-secondary" onClick={() => openLead(lead.id)}>Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {leads && (
          <div className="tag-list" style={{ marginTop: 12 }}>
            <button className="btn btn-secondary" onClick={() => setFilters({ ...filters, page: Math.max(1, filters.page - 1) })} disabled={filters.page <= 1}>Previous</button>
            <span className="entity-card-meta">Page {leads.page}</span>
            <button className="btn btn-secondary" onClick={() => setFilters({ ...filters, page: filters.page + 1 })} disabled={leads.page * leads.limit >= leads.total}>Next</button>
          </div>
        )}
      </Card>

      {selectedLead && (
        <Card>
          <div className="entity-card-header">
            <h2 className="card-title">{leadName(selectedLead)}</h2>
            <button className="btn btn-secondary" onClick={recalculateSelectedLead} disabled={busy}>Recalculate</button>
          </div>
          <div className="summary-grid">
            <div><span className="summary-label">Contact</span><p>{selectedLead.email || '-'}<br />{selectedLead.phone || '-'}</p></div>
            <div><span className="summary-label">Company</span><p>{selectedLead.companyName || '-'}<br />{selectedLead.jobTitle || '-'}</p></div>
            <div><span className="summary-label">Consent</span><p>{labelize(selectedLead.consentStatus)}</p></div>
            <div><span className="summary-label">Qualification</span><p>{selectedLead.qualification ? `${selectedLead.qualification.score} / ${labelize(selectedLead.qualification.grade)}` : '-'}</p></div>
            <div><span className="summary-label">Eligibility</span><p>{selectedLead.qualification ? labelize(selectedLead.qualification.communicationEligibility) : '-'}</p></div>
            <div><span className="summary-label">Version</span><p>{selectedLead.qualification?.scoringVersion || '-'}</p></div>
          </div>
          {selectedLead.qualification && (
            <>
              <h3 className="section-title">Qualification Reasons</h3>
              {selectedLead.qualification.reasons.slice(0, 8).map((reason) => (
                <div key={reason.ruleId} className="entity-card-meta">{reason.points > 0 ? '+' : ''}{reason.points} · {reason.label}</div>
              ))}
            </>
          )}
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
        <h2 className="card-title">Import Leads</h2>
        <form className="form" onSubmit={importCsv}>
          <div className="field"><label>Source Name</label><input value={importDraft.sourceName} onChange={(e) => setImportDraft({ ...importDraft, sourceName: e.target.value })} /></div>
          <div className="field"><label>CSV File</label><input type="file" accept=".csv,text/csv" onChange={importFile} /></div>
          <div className="field"><label>CSV Data</label><textarea rows={8} value={importDraft.csv} onChange={(e) => setImportDraft({ ...importDraft, csv: e.target.value })} placeholder="fullName,email,companyName,consentStatus" /></div>
          <button className="btn btn-primary" disabled={busy || !importDraft.csv.trim()}>Import CSV</button>
        </form>
        {importSummary && <p className="entity-card-meta">Rows {importSummary.totalRows}: {importSummary.created} created, {importSummary.matched} matched, {importSummary.conflicts} conflicts, {importSummary.invalid} invalid.</p>}
      </Card>

      <Card>
        <h2 className="card-title">Identity Conflicts</h2>
        {conflicts.length === 0 && <p className="entity-card-meta">No identity conflicts found.</p>}
        {conflicts.map((conflict) => (
          <div key={conflict.id} className="entity-card" style={{ border: '1px solid var(--border-color, #ddd)', borderRadius: 6, padding: 12, marginTop: 8 }}>
            <div className="entity-card-header">
              <h3>{conflict.maskedEmail} / {conflict.maskedPhone}</h3>
              <span className={`quality-badge ${conflict.status === 'unresolved' ? 'quality-warning' : 'quality-good'}`}>{labelize(conflict.status)}</span>
            </div>
            <div className="entity-card-meta">Lead A {conflict.emailLeadId} · Lead B {conflict.phoneLeadId} · {new Date(conflict.createdAt).toLocaleString()}</div>
            {conflict.status === 'unresolved' && <button className="btn btn-secondary" onClick={() => reviewConflict(conflict.id)} disabled={busy}>Keep separate</button>}
          </div>
        ))}
      </Card>

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
