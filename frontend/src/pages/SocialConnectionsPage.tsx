import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { Card } from '../components/Card';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import type { SocialAuthorizeResponse, SocialConnectionSummary, SocialConnectionPlatform } from '../types';

const PLATFORMS: { value: SocialConnectionPlatform; label: string }[] = [
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'x', label: 'X' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
];

function labelize(value: string): string {
  return value
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function statusClass(status: string): string {
  if (status === 'active') return 'quality-badge quality-good';
  if (status === 'expired') return 'quality-badge quality-limited';
  if (status === 'error') return 'quality-badge quality-empty';
  return 'quality-badge quality-unavailable';
}

export default function SocialConnectionsPage() {
  const { organizationId, productId } = useParams<{ organizationId: string; productId: string }>();
  const basePath = `/organizations/${organizationId}/products/${productId}`;

  const [connections, setConnections] = useState<SocialConnectionSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyPlatform, setBusyPlatform] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<SocialConnectionSummary[]>(`${basePath}/social-connections`);
      setConnections(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load social connections');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, productId]);

  function connectionFor(platform: SocialConnectionPlatform): SocialConnectionSummary | undefined {
    return connections?.find((c) => c.platform === platform);
  }

  async function handleConnect(platform: SocialConnectionPlatform) {
    setBusyPlatform(platform);
    setError(null);
    try {
      const result = await apiRequest<SocialAuthorizeResponse>(`${basePath}/social-connections/${platform}/authorize`, { method: 'POST' });
      window.location.href = result.authorizationUrl;
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 503
          ? `${labelize(platform)} connection is not configured on this GIP environment.`
          : err instanceof ApiError
            ? err.message
            : 'Failed to start the connection.',
      );
      setBusyPlatform(null);
    }
  }

  async function handleValidate(connection: SocialConnectionSummary) {
    setBusyPlatform(connection.platform);
    setError(null);
    try {
      const updated = await apiRequest<SocialConnectionSummary>(`${basePath}/social-connections/${connection.id}/validate`, { method: 'POST' });
      setConnections((prev) => (prev ? prev.map((c) => (c.id === connection.id ? updated : c)) : prev));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to validate connection');
    } finally {
      setBusyPlatform(null);
    }
  }

  async function handleDisconnect(connection: SocialConnectionSummary) {
    const confirmed = window.confirm(`Disconnect ${labelize(connection.platform)}?`);
    if (!confirmed) return;
    setBusyPlatform(connection.platform);
    setError(null);
    try {
      const updated = await apiRequest<SocialConnectionSummary>(`${basePath}/social-connections/${connection.id}`, { method: 'DELETE' });
      setConnections((prev) => (prev ? prev.map((c) => (c.id === connection.id ? updated : c)) : prev));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to disconnect');
    } finally {
      setBusyPlatform(null);
    }
  }

  return (
    <AppLayout>
      <PageHeader
        title="Social Connections"
        subtitle="Connect your organization's social accounts. No posts are published from here."
        backTo={{ to: `/organizations/${organizationId}/products/${productId}`, label: 'Back to Product' }}
      />
      <Card>
        <ErrorMessage message={error} />
        {loading && <Loading />}
        {!loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {PLATFORMS.map((p) => {
              const connection = connectionFor(p.value);
              const busy = busyPlatform === p.value;
              return (
                <div key={p.value} style={{ border: '1px solid var(--border-color, #ddd)', borderRadius: 6, padding: 12 }}>
                  <div className="tag-list" style={{ marginBottom: 6 }}>
                    <span className="summary-label">{p.label}</span>
                    {connection ? <span className={statusClass(connection.status)}>{labelize(connection.status)}</span> : <span className="tag">Not connected</span>}
                  </div>
                  {connection ? (
                    <>
                      <div className="entity-card-meta">{connection.accountName ?? connection.username ?? connection.id}</div>
                      {connection.username && connection.accountName && <div className="entity-card-meta">@{connection.username}</div>}
                      {connection.lastValidatedAt && <div className="entity-card-meta">Last validated {new Date(connection.lastValidatedAt).toLocaleString()}</div>}
                      {connection.status === 'error' && connection.lastErrorCode && <div className="content-warning">Connection issue: {labelize(connection.lastErrorCode)}</div>}
                      <div className="tag-list" style={{ marginTop: 8 }}>
                        <button className="btn btn-secondary" onClick={() => handleConnect(p.value)} disabled={busy}>
                          {busy ? 'Working...' : 'Reconnect'}
                        </button>
                        <button className="btn btn-secondary" onClick={() => handleValidate(connection)} disabled={busy}>
                          Validate
                        </button>
                        <button className="btn btn-secondary" onClick={() => handleDisconnect(connection)} disabled={busy}>
                          Disconnect
                        </button>
                      </div>
                    </>
                  ) : (
                    <button className="btn btn-primary" onClick={() => handleConnect(p.value)} disabled={busy}>
                      {busy ? 'Redirecting...' : 'Connect'}
                    </button>
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
