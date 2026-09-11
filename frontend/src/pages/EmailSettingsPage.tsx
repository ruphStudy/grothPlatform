import { type FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { Card } from '../components/Card';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import type { EmailAudiencePreview, EmailCampaign, EmailConnection, EmailDashboard, EmailMessage, EmailSchedule, EmailSender, EmailSequence, EmailSequenceStep, EmailSuppression, EmailTemplate } from '../types';

function labelize(value: string): string {
  return value.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export default function EmailSettingsPage() {
  const { organizationId, productId } = useParams<{ organizationId: string; productId: string }>();
  const basePath = `/organizations/${organizationId}/products/${productId}`;
  const [connections, setConnections] = useState<EmailConnection[]>([]);
  const [senders, setSenders] = useState<EmailSender[]>([]);
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [dashboard, setDashboard] = useState<EmailDashboard | null>(null);
  const [sequences, setSequences] = useState<EmailSequence[]>([]);
  const [schedules, setSchedules] = useState<EmailSchedule[]>([]);
  const [suppressions, setSuppressions] = useState<EmailSuppression[]>([]);
  const [audiencePreview, setAudiencePreview] = useState<EmailAudiencePreview | null>(null);
  const [templatePreview, setTemplatePreview] = useState<{ subject: string; html?: string; text?: string; missingVariables: string[] } | null>(null);
  const [connectionDraft, setConnectionDraft] = useState({ platform: 'resend', name: '', apiKey: '' });
  const [senderDraft, setSenderDraft] = useState({ connectionId: '', email: '', name: '' });
  const [testDraft, setTestDraft] = useState({ connectionId: '', senderId: '', recipientEmail: '', subject: '', text: '', idempotencyKey: '' });
  const [templateDraft, setTemplateDraft] = useState({ id: '', name: '', type: 'marketing', status: 'draft', subjectTemplate: '', previewText: '', htmlTemplate: '', textTemplate: '' });
  const [campaignDraft, setCampaignDraft] = useState({ name: '', templateId: '', senderId: '', statuses: 'new,qualified', communicationEligibility: 'allowed' });
  const [sequenceDraft, setSequenceDraft] = useState<{ id: string; name: string; senderId: string; stopOnOpportunityWon: boolean; steps: EmailSequenceStep[] }>({ id: '', name: '', senderId: '', stopOnOpportunityWon: true, steps: [{ order: 1, delayValue: 0, delayUnit: 'hours', templateId: '', templateVersion: 1 }] });
  const [enrollmentDraft, setEnrollmentDraft] = useState({ sequenceId: '', leadId: '', opportunityId: '' });
  const [scheduleDraft, setScheduleDraft] = useState({ leadId: '', opportunityId: '', senderId: '', templateId: '', templateVersion: '', scheduledAt: '', idempotencyKey: '' });
  const [suppressionDraft, setSuppressionDraft] = useState({ email: '', reason: 'manual', source: 'manual' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!organizationId || !productId) return;
    setLoading(true);
    setError(null);
    try {
      const [connectionData, senderData, messageData, templateData, campaignData, dashboardData, sequenceData, scheduleData, suppressionData] = await Promise.all([
        apiRequest<EmailConnection[]>(`${basePath}/email/connections`),
        apiRequest<EmailSender[]>(`${basePath}/email/senders`),
        apiRequest<EmailMessage[]>(`${basePath}/email/messages`),
        apiRequest<EmailTemplate[]>(`${basePath}/email/templates`),
        apiRequest<EmailCampaign[]>(`${basePath}/email/campaigns`),
        apiRequest<EmailDashboard>(`${basePath}/email/dashboard`),
        apiRequest<EmailSequence[]>(`${basePath}/email/sequences`),
        apiRequest<EmailSchedule[]>(`${basePath}/email/schedules`),
        apiRequest<EmailSuppression[]>(`${basePath}/email/suppressions`),
      ]);
      setConnections(connectionData);
      setSenders(senderData);
      setMessages(messageData);
      setTemplates(templateData);
      setCampaigns(campaignData);
      setDashboard(dashboardData);
      setSequences(sequenceData);
      setSchedules(scheduleData);
      setSuppressions(suppressionData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load email settings');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, productId]);

  async function createConnection(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await apiRequest(`${basePath}/email/connections`, { method: 'POST', body: { platform: connectionDraft.platform, name: connectionDraft.name, credential: { apiKey: connectionDraft.apiKey } } });
      setConnectionDraft({ platform: 'resend', name: '', apiKey: '' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to connect provider');
    } finally {
      setBusy(false);
    }
  }

  async function createSender(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await apiRequest(`${basePath}/email/senders`, { method: 'POST', body: senderDraft });
      setSenderDraft({ connectionId: '', email: '', name: '' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create sender');
    } finally {
      setBusy(false);
    }
  }

  async function action(path: string) {
    setBusy(true);
    try {
      await apiRequest(`${basePath}${path}`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Email action failed');
    } finally {
      setBusy(false);
    }
  }

  async function sendTest(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await apiRequest(`${basePath}/email/test-send`, { method: 'POST', body: { ...testDraft, idempotencyKey: testDraft.idempotencyKey || `test-${Date.now()}` } });
      setTestDraft({ connectionId: '', senderId: '', recipientEmail: '', subject: '', text: '', idempotencyKey: '' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to send test email');
    } finally {
      setBusy(false);
    }
  }

  async function saveTemplate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const body = { name: templateDraft.name, type: templateDraft.type, status: templateDraft.status, subjectTemplate: templateDraft.subjectTemplate, previewText: templateDraft.previewText || undefined, htmlTemplate: templateDraft.htmlTemplate || undefined, textTemplate: templateDraft.textTemplate || undefined };
      await apiRequest(`${basePath}/email/templates${templateDraft.id ? `/${templateDraft.id}` : ''}`, { method: templateDraft.id ? 'PATCH' : 'POST', body });
      setTemplateDraft({ id: '', name: '', type: 'marketing', status: 'draft', subjectTemplate: '', previewText: '', htmlTemplate: '', textTemplate: '' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save template');
    } finally {
      setBusy(false);
    }
  }

  async function previewTemplate(template: EmailTemplate) {
    try {
      const result = await apiRequest<{ subject: string; html?: string; text?: string; missingVariables: string[] }>(`${basePath}/email/templates/${template.id}/versions/${template.latestVersion}/preview`, { method: 'POST', body: {} });
      setTemplatePreview(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to preview template');
    }
  }

  function audienceDefinition() {
    return {
      statuses: campaignDraft.statuses.split(',').map((item) => item.trim()).filter(Boolean),
      communicationEligibility: campaignDraft.communicationEligibility.split(',').map((item) => item.trim()).filter(Boolean),
    };
  }

  async function previewAudience() {
    try {
      const template = templates.find((item) => item.id === campaignDraft.templateId);
      const result = await apiRequest<EmailAudiencePreview>(`${basePath}/email/campaigns/audience-preview`, { method: 'POST', body: { audienceDefinition: audienceDefinition(), templateId: campaignDraft.templateId || undefined, templateVersion: template?.latestVersion } });
      setAudiencePreview(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to preview audience');
    }
  }

  async function createCampaign(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await apiRequest(`${basePath}/email/campaigns`, { method: 'POST', body: { name: campaignDraft.name, templateId: campaignDraft.templateId, senderId: campaignDraft.senderId, audienceDefinition: audienceDefinition() } });
      setCampaignDraft({ name: '', templateId: '', senderId: '', statuses: 'new,qualified', communicationEligibility: 'allowed' });
      setAudiencePreview(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create broadcast');
    } finally {
      setBusy(false);
    }
  }

  function updateSequenceStep(index: number, patch: Partial<EmailSequenceStep>) {
    setSequenceDraft((draft) => ({ ...draft, steps: draft.steps.map((step, i) => (i === index ? { ...step, ...patch, templateVersion: patch.templateId ? templates.find((template) => template.id === patch.templateId)?.latestVersion || step.templateVersion : patch.templateVersion ?? step.templateVersion } : step)).map((step, i) => ({ ...step, order: i + 1 })) }));
  }

  async function saveSequence(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const body = { name: sequenceDraft.name, senderId: sequenceDraft.senderId, stopOnOpportunityWon: sequenceDraft.stopOnOpportunityWon, steps: sequenceDraft.steps.map((step, i) => ({ ...step, order: i + 1, templateVersion: step.templateVersion || templates.find((template) => template.id === step.templateId)?.latestVersion || 1 })) };
      await apiRequest(`${basePath}/email/sequences${sequenceDraft.id ? `/${sequenceDraft.id}` : ''}`, { method: sequenceDraft.id ? 'PATCH' : 'POST', body });
      setSequenceDraft({ id: '', name: '', senderId: '', stopOnOpportunityWon: true, steps: [{ order: 1, delayValue: 0, delayUnit: 'hours', templateId: '', templateVersion: 1 }] });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save sequence');
    } finally {
      setBusy(false);
    }
  }

  async function enrollLead(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await apiRequest(`${basePath}/email/sequences/${enrollmentDraft.sequenceId}/enroll`, { method: 'POST', body: { leadId: enrollmentDraft.leadId, opportunityId: enrollmentDraft.opportunityId || undefined } });
      setEnrollmentDraft({ sequenceId: '', leadId: '', opportunityId: '' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to enroll lead');
    } finally {
      setBusy(false);
    }
  }

  async function createSchedule(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await apiRequest(`${basePath}/email/schedules`, { method: 'POST', body: { ...scheduleDraft, templateVersion: scheduleDraft.templateVersion ? Number(scheduleDraft.templateVersion) : undefined, opportunityId: scheduleDraft.opportunityId || undefined, idempotencyKey: scheduleDraft.idempotencyKey || `email-schedule-${Date.now()}` } });
      setScheduleDraft({ leadId: '', opportunityId: '', senderId: '', templateId: '', templateVersion: '', scheduledAt: '', idempotencyKey: '' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to schedule email');
    } finally {
      setBusy(false);
    }
  }

  async function createSuppression(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await apiRequest(`${basePath}/email/suppressions`, { method: 'POST', body: suppressionDraft });
      setSuppressionDraft({ email: '', reason: 'manual', source: 'manual' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to suppress email');
    } finally {
      setBusy(false);
    }
  }

  function percent(value: number | null) {
    return value === null ? '-' : `${Math.round(value * 1000) / 10}%`;
  }

  const verifiedSenders = senders.filter((sender) => sender.status === 'verified' && connections.some((connection) => connection.id === sender.emailConnectionId && connection.status === 'active'));

  return (
    <AppLayout>
      <PageHeader title="Email Settings" backTo={{ to: basePath, label: 'Product' }} />
      <ErrorMessage message={error} />
      {loading && <Loading />}

      <Card>
        <h2 className="card-title">Email Dashboard</h2>
        {dashboard && (
          <>
            <div className="summary-grid">
              <div><span className="summary-label">Accepted</span><p>{dashboard.summary.accepted}</p></div>
              <div><span className="summary-label">Delivered</span><p>{dashboard.summary.delivered}</p></div>
              <div><span className="summary-label">Bounced</span><p>{dashboard.summary.bounced}</p></div>
              <div><span className="summary-label">Complained</span><p>{dashboard.summary.complained}</p></div>
              <div><span className="summary-label">Recorded Opens</span><p>{dashboard.summary.recordedOpens}</p></div>
              <div><span className="summary-label">Recorded Clicks</span><p>{dashboard.summary.recordedClicks}</p></div>
              <div><span className="summary-label">Unsubscribes</span><p>{dashboard.summary.unsubscribes}</p></div>
              <div><span className="summary-label">Delivery Rate</span><p>{percent(dashboard.summary.deliveryRate)}</p></div>
            </div>
            <p className="entity-card-meta">Recorded open and click rates use delivered messages as the denominator when available.</p>
          </>
        )}
      </Card>

      <Card>
        <h2 className="card-title">Sequences</h2>
        <form className="form form-grid-2" onSubmit={saveSequence}>
          <div className="field"><label>Name</label><input value={sequenceDraft.name} onChange={(e) => setSequenceDraft({ ...sequenceDraft, name: e.target.value })} /></div>
          <div className="field"><label>Sender</label><select value={sequenceDraft.senderId} onChange={(e) => setSequenceDraft({ ...sequenceDraft, senderId: e.target.value })}><option value="">Select sender</option>{verifiedSenders.map((sender) => <option key={sender.id} value={sender.id}>{sender.name || sender.email}</option>)}</select></div>
          <div className="field"><label>Stop On Won Opportunity</label><select value={String(sequenceDraft.stopOnOpportunityWon)} onChange={(e) => setSequenceDraft({ ...sequenceDraft, stopOnOpportunityWon: e.target.value === 'true' })}><option value="true">Yes</option><option value="false">No</option></select></div>
          <div className="field field-full">
            <label>Steps</label>
            {sequenceDraft.steps.map((step, index) => (
              <div key={index} className="form form-grid-2" style={{ marginBottom: 10 }}>
                <input type="number" min={0} max={365} value={step.delayValue} onChange={(e) => updateSequenceStep(index, { delayValue: Number(e.target.value) })} />
                <select value={step.delayUnit} onChange={(e) => updateSequenceStep(index, { delayUnit: e.target.value as 'hours' | 'days' })}><option value="hours">Hours</option><option value="days">Days</option></select>
                <select value={step.templateId} onChange={(e) => updateSequenceStep(index, { templateId: e.target.value })}><option value="">Select template</option>{templates.filter((template) => template.status !== 'archived').map((template) => <option key={template.id} value={template.id}>{template.name} v{template.latestVersion}</option>)}</select>
                <input type="number" min={1} value={step.templateVersion} onChange={(e) => updateSequenceStep(index, { templateVersion: Number(e.target.value) })} />
                <div className="tag-list">
                  <button type="button" className="btn btn-secondary" onClick={() => setSequenceDraft((draft) => ({ ...draft, steps: draft.steps.filter((_, i) => i !== index).map((item, i) => ({ ...item, order: i + 1 })) }))} disabled={sequenceDraft.steps.length === 1}>Remove</button>
                </div>
              </div>
            ))}
            <button type="button" className="btn btn-secondary" onClick={() => setSequenceDraft((draft) => ({ ...draft, steps: [...draft.steps, { order: draft.steps.length + 1, delayValue: 1, delayUnit: 'days', templateId: '', templateVersion: 1 }] }))}>Add Step</button>
          </div>
          <button className="btn btn-primary" disabled={busy || !sequenceDraft.name || !sequenceDraft.senderId || sequenceDraft.steps.some((step) => !step.templateId)}>{sequenceDraft.id ? 'Save Sequence' : 'Create Sequence'}</button>
        </form>
        <form className="form form-grid-2" onSubmit={enrollLead} style={{ marginTop: 14 }}>
          <div className="field"><label>Sequence</label><select value={enrollmentDraft.sequenceId} onChange={(e) => setEnrollmentDraft({ ...enrollmentDraft, sequenceId: e.target.value })}><option value="">Select active sequence</option>{sequences.filter((sequence) => sequence.status === 'active').map((sequence) => <option key={sequence.id} value={sequence.id}>{sequence.name}</option>)}</select></div>
          <div className="field"><label>Lead ID</label><input value={enrollmentDraft.leadId} onChange={(e) => setEnrollmentDraft({ ...enrollmentDraft, leadId: e.target.value })} /></div>
          <div className="field"><label>Opportunity ID</label><input value={enrollmentDraft.opportunityId} onChange={(e) => setEnrollmentDraft({ ...enrollmentDraft, opportunityId: e.target.value })} /></div>
          <button className="btn btn-secondary" disabled={busy || !enrollmentDraft.sequenceId || !enrollmentDraft.leadId}>Enroll Lead</button>
        </form>
        {sequences.map((sequence) => (
          <div key={sequence.id} className="entity-card" style={{ borderTop: '1px solid var(--border-color, #ddd)', paddingTop: 10, marginTop: 10 }}>
            <div className="entity-card-header"><h3>{sequence.name}</h3><span className="quality-badge quality-unavailable">{labelize(sequence.status)}</span></div>
            <p className="entity-card-meta">Steps {sequence.stepCount} · Active {sequence.activeEnrollments} · Completed {sequence.completedEnrollments} · Stopped {sequence.stoppedEnrollments} · Failed {sequence.failedEnrollments}</p>
            <div className="tag-list">
              <button className="btn btn-secondary" onClick={() => apiRequest<EmailSequence>(`${basePath}/email/sequences/${sequence.id}`).then((detail) => setSequenceDraft({ id: detail.id, name: detail.name, senderId: detail.senderId, stopOnOpportunityWon: detail.stopOnOpportunityWon, steps: detail.steps?.length ? detail.steps : [{ order: 1, delayValue: 0, delayUnit: 'hours', templateId: '', templateVersion: 1 }] })).catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load sequence'))}>Edit</button>
              {sequence.status !== 'active' && <button className="btn btn-secondary" onClick={() => apiRequest(`${basePath}/email/sequences/${sequence.id}`, { method: 'PATCH', body: { status: 'active' } }).then(load).catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to activate sequence'))}>Activate</button>}
              {sequence.status === 'active' && <button className="btn btn-secondary" onClick={() => apiRequest(`${basePath}/email/sequences/${sequence.id}`, { method: 'PATCH', body: { status: 'paused' } }).then(load).catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to pause sequence'))}>Pause</button>}
              {sequence.status !== 'archived' && <button className="btn btn-secondary" onClick={() => apiRequest(`${basePath}/email/sequences/${sequence.id}`, { method: 'PATCH', body: { status: 'archived' } }).then(load).catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to archive sequence'))}>Archive</button>}
            </div>
          </div>
        ))}
      </Card>

      <Card>
        <h2 className="card-title">Scheduled Email</h2>
        <form className="form form-grid-2" onSubmit={createSchedule}>
          <div className="field"><label>Lead ID</label><input value={scheduleDraft.leadId} onChange={(e) => setScheduleDraft({ ...scheduleDraft, leadId: e.target.value })} /></div>
          <div className="field"><label>Opportunity ID</label><input value={scheduleDraft.opportunityId} onChange={(e) => setScheduleDraft({ ...scheduleDraft, opportunityId: e.target.value })} /></div>
          <div className="field"><label>Sender</label><select value={scheduleDraft.senderId} onChange={(e) => setScheduleDraft({ ...scheduleDraft, senderId: e.target.value })}><option value="">Select sender</option>{verifiedSenders.map((sender) => <option key={sender.id} value={sender.id}>{sender.name || sender.email}</option>)}</select></div>
          <div className="field"><label>Template</label><select value={scheduleDraft.templateId} onChange={(e) => { const template = templates.find((item) => item.id === e.target.value); setScheduleDraft({ ...scheduleDraft, templateId: e.target.value, templateVersion: template ? String(template.latestVersion) : '' }); }}><option value="">Select template</option>{templates.filter((template) => template.status !== 'archived').map((template) => <option key={template.id} value={template.id}>{template.name} v{template.latestVersion}</option>)}</select></div>
          <div className="field"><label>Version</label><input value={scheduleDraft.templateVersion} onChange={(e) => setScheduleDraft({ ...scheduleDraft, templateVersion: e.target.value })} /></div>
          <div className="field"><label>Scheduled At</label><input type="datetime-local" value={scheduleDraft.scheduledAt} onChange={(e) => setScheduleDraft({ ...scheduleDraft, scheduledAt: e.target.value })} /></div>
          <button className="btn btn-primary" disabled={busy || !scheduleDraft.leadId || !scheduleDraft.senderId || !scheduleDraft.templateId || !scheduleDraft.scheduledAt}>Schedule Email</button>
        </form>
        {schedules.map((schedule) => <p key={schedule.id} className="entity-card-meta">{new Date(schedule.scheduledAt).toLocaleString()} · Lead {schedule.leadId} · {labelize(schedule.status)} {schedule.status === 'scheduled' && <button className="btn btn-secondary" onClick={() => action(`/email/schedules/${schedule.id}/cancel`)}>Cancel</button>}</p>)}
      </Card>

      <Card>
        <h2 className="card-title">Suppressions</h2>
        <form className="form form-grid-2" onSubmit={createSuppression}>
          <div className="field"><label>Email</label><input value={suppressionDraft.email} onChange={(e) => setSuppressionDraft({ ...suppressionDraft, email: e.target.value })} /></div>
          <div className="field"><label>Reason</label><select value={suppressionDraft.reason} onChange={(e) => setSuppressionDraft({ ...suppressionDraft, reason: e.target.value })}><option value="manual">Manual</option><option value="invalid">Invalid</option><option value="bounced">Bounced</option><option value="complained">Complained</option><option value="unsubscribed">Unsubscribed</option></select></div>
          <div className="field"><label>Source</label><input value={suppressionDraft.source} onChange={(e) => setSuppressionDraft({ ...suppressionDraft, source: e.target.value })} /></div>
          <button className="btn btn-primary" disabled={busy || !suppressionDraft.email}>Suppress</button>
        </form>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Email</th><th>Reason</th><th>Status</th><th>Source</th><th>Created</th></tr></thead>
            <tbody>{suppressions.map((item) => <tr key={item.id}><td>{item.normalizedEmail}</td><td>{labelize(item.reason)}</td><td>{item.active ? 'Active' : 'Inactive'}</td><td>{item.source || '-'}</td><td>{new Date(item.createdAt).toLocaleString()}</td></tr>)}</tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="card-title">Templates</h2>
        <form className="form form-grid-2" onSubmit={saveTemplate}>
          <div className="field"><label>Name</label><input value={templateDraft.name} onChange={(e) => setTemplateDraft({ ...templateDraft, name: e.target.value })} /></div>
          <div className="field"><label>Type</label><select value={templateDraft.type} onChange={(e) => setTemplateDraft({ ...templateDraft, type: e.target.value })}><option value="marketing">Marketing</option><option value="crm">CRM</option><option value="newsletter">Newsletter</option><option value="announcement">Announcement</option><option value="follow_up">Follow Up</option><option value="generic">Generic</option></select></div>
          <div className="field"><label>Status</label><select value={templateDraft.status} onChange={(e) => setTemplateDraft({ ...templateDraft, status: e.target.value })}><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></select></div>
          <div className="field"><label>Subject</label><input value={templateDraft.subjectTemplate} onChange={(e) => setTemplateDraft({ ...templateDraft, subjectTemplate: e.target.value })} /></div>
          <div className="field field-full"><label>Preview Text</label><input value={templateDraft.previewText} onChange={(e) => setTemplateDraft({ ...templateDraft, previewText: e.target.value })} /></div>
          <div className="field field-full"><label>HTML</label><textarea value={templateDraft.htmlTemplate} onChange={(e) => setTemplateDraft({ ...templateDraft, htmlTemplate: e.target.value })} /></div>
          <div className="field field-full"><label>Plain Text</label><textarea value={templateDraft.textTemplate} onChange={(e) => setTemplateDraft({ ...templateDraft, textTemplate: e.target.value })} /></div>
          <p className="entity-card-meta">Variables: {'{{firstName}} {{fullName}} {{email}} {{companyName}} {{productName}} {{senderName}} {{unsubscribeUrl}}'}</p>
          <button className="btn btn-primary" disabled={busy || !templateDraft.name || !templateDraft.subjectTemplate || (!templateDraft.htmlTemplate && !templateDraft.textTemplate)}>{templateDraft.id ? 'Save New Version' : 'Create Template'}</button>
        </form>
        {templates.map((template) => (
          <div key={template.id} className="entity-card" style={{ borderTop: '1px solid var(--border-color, #ddd)', paddingTop: 10, marginTop: 10 }}>
            <div className="entity-card-header"><h3>{template.name}</h3><span className="quality-badge quality-unavailable">v{template.latestVersion} · {labelize(template.status)}</span></div>
            <p className="entity-card-meta">{labelize(template.type)} · Updated {new Date(template.updatedAt).toLocaleString()}</p>
            <div className="tag-list">
              <button className="btn btn-secondary" onClick={() => setTemplateDraft({ id: template.id, name: template.name, type: template.type, status: template.status, subjectTemplate: template.latest?.subjectTemplate || '', previewText: template.latest?.previewText || '', htmlTemplate: template.latest?.htmlTemplate || '', textTemplate: template.latest?.textTemplate || '' })}>Edit</button>
              <button className="btn btn-secondary" onClick={() => previewTemplate(template)}>Preview</button>
              {template.status !== 'archived' && <button className="btn btn-secondary" onClick={() => action(`/email/templates/${template.id}/archive`)}>Archive</button>}
            </div>
          </div>
        ))}
        {templatePreview && <div className="entity-card-meta" style={{ marginTop: 12 }}>Preview: {templatePreview.subject} · Missing: {templatePreview.missingVariables.join(', ') || '-'}</div>}
      </Card>

      <Card>
        <h2 className="card-title">Campaigns / Broadcasts</h2>
        <form className="form form-grid-2" onSubmit={createCampaign}>
          <div className="field"><label>Name</label><input value={campaignDraft.name} onChange={(e) => setCampaignDraft({ ...campaignDraft, name: e.target.value })} /></div>
          <div className="field"><label>Template</label><select value={campaignDraft.templateId} onChange={(e) => setCampaignDraft({ ...campaignDraft, templateId: e.target.value })}><option value="">Select template</option>{templates.filter((template) => template.status !== 'archived').map((template) => <option key={template.id} value={template.id}>{template.name} v{template.latestVersion}</option>)}</select></div>
          <div className="field"><label>Sender</label><select value={campaignDraft.senderId} onChange={(e) => setCampaignDraft({ ...campaignDraft, senderId: e.target.value })}><option value="">Select sender</option>{verifiedSenders.map((sender) => <option key={sender.id} value={sender.id}>{sender.name || sender.email}</option>)}</select></div>
          <div className="field"><label>Lead Statuses</label><input value={campaignDraft.statuses} onChange={(e) => setCampaignDraft({ ...campaignDraft, statuses: e.target.value })} /></div>
          <div className="field"><label>Eligibility</label><input value={campaignDraft.communicationEligibility} onChange={(e) => setCampaignDraft({ ...campaignDraft, communicationEligibility: e.target.value })} /></div>
          <div className="tag-list"><button type="button" className="btn btn-secondary" onClick={previewAudience}>Preview Audience</button><button className="btn btn-primary" disabled={busy || !campaignDraft.name || !campaignDraft.templateId || !campaignDraft.senderId}>Create Broadcast</button></div>
        </form>
        {audiencePreview && <p className="entity-card-meta">Matched {audiencePreview.matched} · Eligible {audiencePreview.eligible} · Restricted {audiencePreview.restricted} · Unknown {audiencePreview.unknown} · No Email {audiencePreview.missingEmail} · Suppressed {audiencePreview.suppressed}</p>}
        {campaigns.map((campaign) => (
          <div key={campaign.id} className="entity-card" style={{ borderTop: '1px solid var(--border-color, #ddd)', paddingTop: 10, marginTop: 10 }}>
            <div className="entity-card-header"><h3>{campaign.name}</h3><span className="quality-badge quality-unavailable">{labelize(campaign.status)}</span></div>
            <p className="entity-card-meta">Template v{campaign.emailTemplateVersion} · Recipients {campaign.recipientCount} · Accepted {campaign.acceptedCount} · Failed {campaign.failedCount} · Skipped {campaign.skippedCount}</p>
            <div className="tag-list">{['draft', 'ready'].includes(campaign.status) && <button className="btn btn-secondary" onClick={() => action(`/email/campaigns/${campaign.id}/send`)} disabled={busy}>Send Now</button>}</div>
          </div>
        ))}
      </Card>

      <Card>
        <h2 className="card-title">Connections</h2>
        <form className="form form-grid-2" onSubmit={createConnection}>
          <div className="field"><label>Provider</label><select value={connectionDraft.platform} onChange={(e) => setConnectionDraft({ ...connectionDraft, platform: e.target.value })}><option value="resend">Resend</option></select></div>
          <div className="field"><label>Name</label><input value={connectionDraft.name} onChange={(e) => setConnectionDraft({ ...connectionDraft, name: e.target.value })} /></div>
          <div className="field"><label>API Key</label><input type="password" value={connectionDraft.apiKey} onChange={(e) => setConnectionDraft({ ...connectionDraft, apiKey: e.target.value })} /></div>
          <button className="btn btn-primary" disabled={busy || !connectionDraft.name.trim() || !connectionDraft.apiKey.trim()}>Connect</button>
        </form>
        {connections.map((connection) => (
          <div key={connection.id} className="entity-card" style={{ borderTop: '1px solid var(--border-color, #ddd)', paddingTop: 10, marginTop: 10 }}>
            <div className="entity-card-header">
              <h3>{connection.name}</h3>
              <span className={`quality-badge ${connection.status === 'active' ? 'quality-good' : 'quality-unavailable'}`}>{labelize(connection.status)}</span>
            </div>
            <p className="entity-card-meta">{labelize(connection.platform)} · Last validated {connection.lastValidatedAt ? new Date(connection.lastValidatedAt).toLocaleString() : '-'}</p>
            <p className="entity-card-meta">Capabilities: {Object.entries(connection.capabilities).filter(([, enabled]) => enabled).map(([key]) => labelize(key)).join(', ') || '-'}</p>
            <div className="tag-list">
              <button className="btn btn-secondary" onClick={() => action(`/email/connections/${connection.id}/validate`)} disabled={busy}>Validate</button>
              {connection.status !== 'disabled' && <button className="btn btn-secondary" onClick={() => action(`/email/connections/${connection.id}/disable`)} disabled={busy}>Disable</button>}
            </div>
          </div>
        ))}
      </Card>

      <Card>
        <h2 className="card-title">Senders</h2>
        <form className="form form-grid-2" onSubmit={createSender}>
          <div className="field"><label>Connection</label><select value={senderDraft.connectionId} onChange={(e) => setSenderDraft({ ...senderDraft, connectionId: e.target.value })}><option value="">Select connection</option>{connections.filter((connection) => connection.status === 'active').map((connection) => <option key={connection.id} value={connection.id}>{connection.name}</option>)}</select></div>
          <div className="field"><label>Email</label><input value={senderDraft.email} onChange={(e) => setSenderDraft({ ...senderDraft, email: e.target.value })} /></div>
          <div className="field"><label>Name</label><input value={senderDraft.name} onChange={(e) => setSenderDraft({ ...senderDraft, name: e.target.value })} /></div>
          <button className="btn btn-primary" disabled={busy || !senderDraft.connectionId || !senderDraft.email.trim()}>Create Sender</button>
        </form>
        {senders.map((sender) => (
          <div key={sender.id} className="entity-card" style={{ borderTop: '1px solid var(--border-color, #ddd)', paddingTop: 10, marginTop: 10 }}>
            <div className="entity-card-header">
              <h3>{sender.name || sender.email}</h3>
              <span className={`quality-badge ${sender.status === 'verified' ? 'quality-good' : sender.status === 'failed' ? 'quality-poor' : 'quality-unavailable'}`}>{labelize(sender.status)}</span>
            </div>
            <p className="entity-card-meta">{sender.email} · {sender.domain} · {sender.isDefault ? 'Default' : 'Selectable'}</p>
            {!!sender.verificationDetails?.dnsRecords?.length && (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Type</th><th>Name / Host</th><th>Value</th><th>Priority</th></tr></thead>
                  <tbody>{sender.verificationDetails.dnsRecords.map((record, index) => <tr key={`${record.name}-${index}`}><td>{record.type}</td><td>{record.name}</td><td>{record.value}</td><td>{record.priority ?? '-'}</td></tr>)}</tbody>
                </table>
              </div>
            )}
            <div className="tag-list">
              <button className="btn btn-secondary" onClick={() => action(`/email/senders/${sender.id}/check-verification`)} disabled={busy}>Check Verification</button>
              <button className="btn btn-secondary" onClick={() => action(`/email/senders/${sender.id}/set-default`)} disabled={busy || sender.status !== 'verified'}>Set Default</button>
              {sender.status !== 'disabled' && <button className="btn btn-secondary" onClick={() => action(`/email/senders/${sender.id}/disable`)} disabled={busy}>Disable</button>}
            </div>
          </div>
        ))}
      </Card>

      <Card>
        <h2 className="card-title">Send Test Email</h2>
        <form className="form form-grid-2" onSubmit={sendTest}>
          <div className="field"><label>Sender</label><select value={testDraft.senderId} onChange={(e) => { const sender = senders.find((item) => item.id === e.target.value); setTestDraft({ ...testDraft, senderId: e.target.value, connectionId: sender?.emailConnectionId || '' }); }}><option value="">Select verified sender</option>{verifiedSenders.map((sender) => <option key={sender.id} value={sender.id}>{sender.name || sender.email}</option>)}</select></div>
          <div className="field"><label>Recipient</label><input value={testDraft.recipientEmail} onChange={(e) => setTestDraft({ ...testDraft, recipientEmail: e.target.value })} /></div>
          <div className="field"><label>Subject</label><input value={testDraft.subject} onChange={(e) => setTestDraft({ ...testDraft, subject: e.target.value })} /></div>
          <div className="field field-full"><label>Text</label><textarea value={testDraft.text} onChange={(e) => setTestDraft({ ...testDraft, text: e.target.value })} /></div>
          <button className="btn btn-primary" disabled={busy || !testDraft.senderId || !testDraft.recipientEmail || !testDraft.subject || !testDraft.text}>Send Test</button>
        </form>
      </Card>

      <Card>
        <h2 className="card-title">Recent Email Messages</h2>
        {messages.map((message) => (
          <div key={message.id} className="entity-card" style={{ borderTop: '1px solid var(--border-color, #ddd)', paddingTop: 10, marginTop: 10 }}>
            <div className="entity-card-header"><h3>{message.subject}</h3><span className="quality-badge quality-unavailable">{labelize(message.status)} · {labelize(message.deliveryStatus || 'unknown')}</span></div>
            <p className="entity-card-meta">{new Date(message.createdAt).toLocaleString()} · To {message.toEmail} · {labelize(message.sendReason)}</p>
            <p className="entity-card-meta">Accepted {message.acceptedAt ? new Date(message.acceptedAt).toLocaleString() : '-'} · Delivered {message.deliveredAt ? new Date(message.deliveredAt).toLocaleString() : '-'} · Recorded Opens {message.openCount ?? 0} · Recorded Clicks {message.clickCount ?? 0}</p>
          </div>
        ))}
        {!messages.length && <p className="entity-card-meta">No email messages yet.</p>}
      </Card>
    </AppLayout>
  );
}
