import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { Card } from '../components/Card';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import type { PendingSelectionSummary, SocialConnectionSummary } from '../types';

function labelize(value: string): string {
  return value
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Landing target for the backend's OAuth callback redirect (18B item 34,
// extended by 18E/18F item 37/38). Never carries a token/code/state — only
// a coarse status, and for Facebook/Instagram a one-time selectionId plus
// the (non-secret) organizationId/productId needed to call the tenant-
// scoped pending-selection endpoints.
export default function SocialConnectionsCallbackPage() {
  const [searchParams] = useSearchParams();
  const status = searchParams.get('status');
  const platform = searchParams.get('platform');
  const errorCode = searchParams.get('error');
  const selectionId = searchParams.get('selectionId');
  const organizationId = searchParams.get('organizationId');
  const productId = searchParams.get('productId');

  const [pending, setPending] = useState<PendingSelectionSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [selected, setSelected] = useState<SocialConnectionSummary | null>(null);

  const basePath = organizationId && productId ? `/organizations/${organizationId}/products/${productId}` : null;

  useEffect(() => {
    if (status !== 'selection_required' || !basePath || !platform || !selectionId) return;
    setLoading(true);
    setError(null);
    apiRequest<PendingSelectionSummary>(`${basePath}/social-connections/${platform}/pending/${selectionId}`)
      .then(setPending)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load the account selection.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, basePath, platform, selectionId]);

  async function handleSelect(externalAccountId: string) {
    if (!basePath || !platform || !selectionId) return;
    setSelecting(externalAccountId);
    setError(null);
    try {
      const result = await apiRequest<SocialConnectionSummary>(`${basePath}/social-connections/${platform}/pending/${selectionId}/select`, {
        method: 'POST',
        body: { externalAccountId },
      });
      setSelected(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to complete the connection.');
    } finally {
      setSelecting(null);
    }
  }

  if (status === 'selection_required') {
    return (
      <AppLayout>
        <PageHeader title="Choose an Account" subtitle={platform ? `Select which ${labelize(platform)} account to connect.` : undefined} />
        <Card>
          <ErrorMessage message={error} />
          {selected ? (
            <>
              <p>
                Connected <strong>{selected.accountName ?? selected.username ?? selected.id}</strong>.
              </p>
              {basePath && (
                <Link to={`${basePath}/social-connections`} className="btn btn-secondary" style={{ marginTop: 12, display: 'inline-block' }}>
                  Back to Social Connections
                </Link>
              )}
            </>
          ) : (
            <>
              {loading && <Loading />}
              {!loading && pending && pending.candidates.length === 0 && <p className="entity-card-meta">No eligible accounts were found.</p>}
              {!loading && pending && pending.candidates.length > 0 && (
                <div style={{ display: 'grid', gap: 8 }}>
                  {pending.candidates.map((c) => (
                    <div key={c.externalAccountId} style={{ border: '1px solid var(--border-color, #ddd)', borderRadius: 6, padding: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                      {c.avatarUrl && <img src={c.avatarUrl} alt={c.accountName ?? c.username ?? ''} style={{ width: 40, height: 40, borderRadius: '50%' }} />}
                      <div style={{ flex: 1 }}>
                        <div>{c.accountName ?? c.username ?? c.externalAccountId}</div>
                        {c.username && <div className="entity-card-meta">@{c.username}</div>}
                      </div>
                      <button className="btn btn-primary" onClick={() => handleSelect(c.externalAccountId)} disabled={selecting !== null}>
                        {selecting === c.externalAccountId ? 'Connecting...' : 'Select'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader title="Social Connection" />
      <Card>
        {status === 'success' ? (
          <p>{platform ? labelize(platform) : 'The social account'} was connected successfully. Return to the product's Social Connections page to see it.</p>
        ) : errorCode === 'social_no_eligible_account' ? (
          <p>No eligible {platform ? labelize(platform) : 'social'} professional account was found for this connection.</p>
        ) : (
          <p>We couldn't complete the {platform ? labelize(platform) : 'social'} connection. Please try again from the product's Social Connections page.</p>
        )}
        <Link to={basePath ? `${basePath}/social-connections` : '/dashboard'} className="btn btn-secondary" style={{ marginTop: 12, display: 'inline-block' }}>
          {basePath ? 'Back to Social Connections' : 'Back to Dashboard'}
        </Link>
      </Card>
    </AppLayout>
  );
}
