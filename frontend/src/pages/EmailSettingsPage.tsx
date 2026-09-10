import { type FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { Card } from '../components/Card';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import type { EmailConnection, EmailMessage, EmailSender } from '../types';

function labelize(value: string): string {
  return value.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export default function EmailSettingsPage() {
  const { organizationId, productId } = useParams<{ organizationId: string; productId: string }>();
  const basePath = `/organizations/${organizationId}/products/${productId}`;
  const [connections, setConnections] = useState<EmailConnection[]>([]);
  const [senders, setSenders] = useState<EmailSender[]>([]);
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [connectionDraft, setConnectionDraft] = useState({ platform: 'resend', name: '', apiKey: '' });
  const [senderDraft, setSenderDraft] = useState({ connectionId: '', email: '', name: '' });
  const [testDraft, setTestDraft] = useState({ connectionId: '', senderId: '', recipientEmail: '', subject: '', text: '', idempotencyKey: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!organizationId || !productId) return;
    setLoading(true);
    setError(null);
    try {
      const [connectionData, senderData, messageData] = await Promise.all([
        apiRequest<EmailConnection[]>(`${basePath}/email/connections`),
        apiRequest<EmailSender[]>(`${basePath}/email/senders`),
        apiRequest<EmailMessage[]>(`${basePath}/email/messages`),
      ]);
      setConnections(connectionData);
      setSenders(senderData);
      setMessages(messageData);
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

  const verifiedSenders = senders.filter((sender) => sender.status === 'verified' && connections.some((connection) => connection.id === sender.emailConnectionId && connection.status === 'active'));

  return (
    <AppLayout>
      <PageHeader title="Email Settings" backTo={{ to: basePath, label: 'Product' }} />
      <ErrorMessage message={error} />
      {loading && <Loading />}

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
        {messages.map((message) => <p key={message.id} className="entity-card-meta">{new Date(message.createdAt).toLocaleString()} · {message.toEmail} · {message.subject} · {labelize(message.status)}</p>)}
        {!messages.length && <p className="entity-card-meta">No email messages yet.</p>}
      </Card>
    </AppLayout>
  );
}
