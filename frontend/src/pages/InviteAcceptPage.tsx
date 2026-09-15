import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { Badge } from '../components/Badge';
import { Card } from '../components/Card';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import type { InvitationPreview } from '../types';

function accessLabel(preview: InvitationPreview) {
  if (preview.productAccessMode === 'all_products') return 'All current and future products';
  return `${preview.productIds.length} selected product${preview.productIds.length === 1 ? '' : 's'}`;
}

export default function InviteAcceptPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : 'Invitation token is missing.');

  const redirectPath = useMemo(() => `/invite/accept?token=${encodeURIComponent(token)}`, [token]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    apiRequest<InvitationPreview>(`/invitations/preview/${token}`, { auth: false })
      .then(setPreview)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Invitation could not be loaded.'))
      .finally(() => setLoading(false));
  }, [token]);

  async function acceptInvite() {
    if (!token) return;
    setAccepting(true);
    setError(null);
    try {
      const accepted = await apiRequest<{ organizationId: string }>('/invitations/accept', {
        method: 'POST',
        body: { token },
      });
      navigate(`/organizations/${accepted.organizationId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invitation could not be accepted.');
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <Loading />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader title="Accept Invitation" subtitle="Review your organization invitation before joining." />
      <Card>
        <ErrorMessage message={error} />
        {preview && (
          <div className="summary-grid">
            <div>
              <span className="summary-label">Organization</span>
              <p>{preview.organization.name}</p>
            </div>
            <div>
              <span className="summary-label">Email</span>
              <p>{preview.email}</p>
            </div>
            <div>
              <span className="summary-label">Role</span>
              <p>{preview.role?.name ?? 'Member'}</p>
            </div>
            <div>
              <span className="summary-label">Status</span>
              <Badge status={preview.status} />
            </div>
            <div>
              <span className="summary-label">Product Access</span>
              <p>{accessLabel(preview)}</p>
            </div>
            <div>
              <span className="summary-label">Expires</span>
              <p>{new Date(preview.expiresAt).toLocaleString()}</p>
            </div>
          </div>
        )}
        {preview?.status === 'pending' && (
          <div className="form-inline" style={{ marginTop: 18 }}>
            <button type="button" className="btn btn-primary" onClick={acceptInvite} disabled={accepting}>
              {accepting ? 'Accepting...' : 'Accept Invitation'}
            </button>
            <Link className="btn btn-secondary" to={`/login?redirect=${encodeURIComponent(redirectPath)}`}>
              Log In
            </Link>
            <Link className="btn btn-secondary" to={`/register?redirect=${encodeURIComponent(redirectPath)}`}>
              Register
            </Link>
          </div>
        )}
      </Card>
    </AppLayout>
  );
}
