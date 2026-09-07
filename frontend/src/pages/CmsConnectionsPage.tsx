import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { Card } from '../components/Card';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import type { CmsConnectionSummary } from '../types';

function labelize(value: string): string {
  return value
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function statusClass(status: string): string {
  if (status === 'active') return 'quality-badge quality-good';
  if (status === 'invalid') return 'quality-badge quality-limited';
  if (status === 'error') return 'quality-badge quality-empty';
  return 'quality-badge quality-unavailable';
}

// 20B: no publishing UI exists here (item 37) — connecting/validating a
// WordPress site only ever proves credentials work, never sends content.
export default function CmsConnectionsPage() {
  const { organizationId, productId } = useParams<{ organizationId: string; productId: string }>();
  const basePath = `/organizations/${organizationId}/products/${productId}`;

  const [connections, setConnections] = useState<CmsConnectionSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [siteUrl, setSiteUrl] = useState('');
  const [username, setUsername] = useState('');
  const [applicationPassword, setApplicationPassword] = useState('');
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [reconnectingId, setReconnectingId] = useState<string | null>(null);
  const [reconnectUsername, setReconnectUsername] = useState('');
  const [reconnectPassword, setReconnectPassword] = useState('');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<CmsConnectionSummary[]>(`${basePath}/cms-connections`);
      setConnections(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load CMS connections');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, productId]);

  // The backend's typed CMS errors already carry safe, user-appropriate
  // text (never a raw provider response) — this only adds the couple of
  // spec-suggested phrasings (item 36) on top of that.
  function friendlyMessage(err: unknown, fallback: string): string {
    if (!(err instanceof ApiError)) return fallback;
    return err.message || fallback;
  }

  function errorCodeToMessage(code: string): string {
    if (code === 'cms_auth_failed') return 'Credentials were rejected.';
    if (code === 'cms_invalid_site') return 'WordPress REST API is unavailable.';
    if (code === 'cms_site_unreachable' || code === 'cms_timeout') return 'WordPress site could not be reached.';
    return labelize(code);
  }

  async function handleConnect() {
    setConnectBusy(true);
    setConnectError(null);
    try {
      const result = await apiRequest<CmsConnectionSummary>(`${basePath}/cms-connections/wordpress`, {
        method: 'POST',
        body: { siteUrl, username, applicationPassword },
      });
      setConnections((prev) => {
        const rest = (prev ?? []).filter((c) => c.id !== result.id);
        return [result, ...rest];
      });
      setShowForm(false);
      setSiteUrl('');
      setUsername('');
      setApplicationPassword('');
    } catch (err) {
      setConnectError(friendlyMessage(err, 'Failed to connect WordPress site'));
    } finally {
      setConnectBusy(false);
    }
  }

  async function handleValidate(connection: CmsConnectionSummary) {
    setBusyId(connection.id);
    setError(null);
    try {
      const updated = await apiRequest<CmsConnectionSummary>(`${basePath}/cms-connections/${connection.id}/validate`, { method: 'POST' });
      setConnections((prev) => (prev ? prev.map((c) => (c.id === connection.id ? updated : c)) : prev));
    } catch (err) {
      setError(friendlyMessage(err, 'Failed to validate connection'));
    } finally {
      setBusyId(null);
    }
  }

  function startReconnect(connection: CmsConnectionSummary) {
    setReconnectingId(connection.id);
    setReconnectUsername(connection.username ?? '');
    setReconnectPassword('');
    setError(null);
  }

  async function handleSaveReconnect(connection: CmsConnectionSummary) {
    setBusyId(connection.id);
    setError(null);
    try {
      const updated = await apiRequest<CmsConnectionSummary>(`${basePath}/cms-connections/${connection.id}`, {
        method: 'PATCH',
        body: { username: reconnectUsername, applicationPassword: reconnectPassword || undefined },
      });
      setConnections((prev) => (prev ? prev.map((c) => (c.id === connection.id ? updated : c)) : prev));
      setReconnectingId(null);
    } catch (err) {
      setError(friendlyMessage(err, 'Failed to update credentials'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDisconnect(connection: CmsConnectionSummary) {
    if (!window.confirm(`Disconnect ${connection.siteName ?? connection.siteUrl}?`)) return;
    setBusyId(connection.id);
    setError(null);
    try {
      const updated = await apiRequest<CmsConnectionSummary>(`${basePath}/cms-connections/${connection.id}`, { method: 'DELETE' });
      setConnections((prev) => (prev ? prev.map((c) => (c.id === connection.id ? updated : c)) : prev));
    } catch (err) {
      setError(friendlyMessage(err, 'Failed to disconnect'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppLayout>
      <PageHeader
        title="CMS / Blog Connections"
        subtitle="Connect a WordPress site for future GIP blog publishing. No posts are published from here."
        backTo={{ to: `/organizations/${organizationId}/products/${productId}`, label: 'Back to Product' }}
        actions={
          !showForm && (
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              Connect WordPress
            </button>
          )
        }
      />

      {showForm && (
        <Card>
          <span className="summary-label">Connect a WordPress Site</span>
          <ErrorMessage message={connectError} />
          <div className="field">
            <label>WordPress Site URL</label>
            <input type="text" placeholder="https://yourblog.com" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} />
          </div>
          <div className="field">
            <label>Username</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="field">
            <label>Application Password</label>
            <input type="password" autoComplete="off" value={applicationPassword} onChange={(e) => setApplicationPassword(e.target.value)} />
          </div>
          <p className="entity-card-meta">Use a WordPress Application Password, not your normal account password.</p>
          <div className="tag-list">
            <button className="btn btn-primary" onClick={handleConnect} disabled={connectBusy || !siteUrl || !username || !applicationPassword}>
              {connectBusy ? 'Connecting...' : 'Connect'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setShowForm(false);
                setConnectError(null);
              }}
              disabled={connectBusy}
            >
              Cancel
            </button>
          </div>
        </Card>
      )}

      <Card>
        <ErrorMessage message={error} />
        {loading && <Loading />}
        {!loading && connections && connections.length === 0 && !showForm && <p className="entity-card-meta">No CMS connections yet.</p>}
        {!loading && connections && connections.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {connections.map((connection) => {
              const busy = busyId === connection.id;
              return (
                <div key={connection.id} style={{ border: '1px solid var(--border-color, #ddd)', borderRadius: 6, padding: 12 }}>
                  <div className="tag-list" style={{ marginBottom: 6 }}>
                    <span className="summary-label">WordPress</span>
                    <span className={statusClass(connection.status)}>{labelize(connection.status)}</span>
                  </div>
                  <div className="entity-card-meta">{connection.siteName ?? connection.siteUrl}</div>
                  <div className="entity-card-meta">{connection.siteUrl}</div>
                  {connection.username && <div className="entity-card-meta">User: {connection.username}</div>}
                  {connection.capabilities && connection.capabilities.length > 0 && (
                    <div className="tag-list" style={{ marginTop: 4 }}>
                      {connection.capabilities.map((cap) => (
                        <span key={cap} className="tag">
                          {labelize(cap)}
                        </span>
                      ))}
                    </div>
                  )}
                  {connection.lastValidatedAt && <div className="entity-card-meta">Last validated {new Date(connection.lastValidatedAt).toLocaleString()}</div>}
                  {(connection.status === 'invalid' || connection.status === 'error') && connection.lastErrorCode && (
                    <div className="content-warning">{errorCodeToMessage(connection.lastErrorCode)}</div>
                  )}

                  {reconnectingId === connection.id ? (
                    <div style={{ marginTop: 8 }}>
                      <div className="field">
                        <label>Username</label>
                        <input type="text" value={reconnectUsername} onChange={(e) => setReconnectUsername(e.target.value)} />
                      </div>
                      <div className="field">
                        <label>New Application Password</label>
                        <input type="password" autoComplete="off" value={reconnectPassword} onChange={(e) => setReconnectPassword(e.target.value)} />
                      </div>
                      <div className="tag-list">
                        <button className="btn btn-primary" onClick={() => handleSaveReconnect(connection)} disabled={busy || !reconnectUsername || !reconnectPassword}>
                          {busy ? 'Saving...' : 'Save'}
                        </button>
                        <button className="btn btn-secondary" onClick={() => setReconnectingId(null)} disabled={busy}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="tag-list" style={{ marginTop: 8 }}>
                      <button className="btn btn-secondary" onClick={() => handleValidate(connection)} disabled={busy}>
                        {busy ? 'Working...' : 'Validate'}
                      </button>
                      <button className="btn btn-secondary" onClick={() => startReconnect(connection)} disabled={busy}>
                        Reconnect
                      </button>
                      <button className="btn btn-secondary" onClick={() => handleDisconnect(connection)} disabled={busy}>
                        Disconnect
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </AppLayout>
  );
}
