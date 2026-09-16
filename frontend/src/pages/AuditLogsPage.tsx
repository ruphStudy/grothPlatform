import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { Badge } from '../components/Badge';
import { Card } from '../components/Card';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import { usePermissions } from '../hooks/usePermissions';
import type { AuditLogResponse } from '../types';

function compact(value?: Record<string, unknown>) {
  if (!value || Object.keys(value).length === 0) return '-';
  return JSON.stringify(value).slice(0, 240);
}

export default function AuditLogsPage() {
  const { organizationId } = useParams<{ organizationId: string }>();
  const [params, setParams] = useSearchParams();
  const permissions = usePermissions(organizationId);
  const [data, setData] = useState<AuditLogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const page = Number(params.get('page') || 1);

  const canView = permissions.hasPermission('audit.view');

  async function load() {
    if (!organizationId || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<AuditLogResponse>(`/organizations/${organizationId}/audit-logs?page=${page}&limit=25`);
      setData(result);
    } catch (err) {
      setError(err instanceof ApiError ? `${err.message}${err.requestId ? ` Reference: ${err.requestId}` : ''}` : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!permissions.loading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, permissions.loading, canView, page]);

  if (permissions.loading || loading) {
    return (
      <AppLayout>
        <Loading />
      </AppLayout>
    );
  }

  if (!canView) {
    return (
      <AppLayout>
        <PageHeader backTo={{ to: `/organizations/${organizationId}`, label: 'Organization' }} title="Audit Logs" />
        <Card><ErrorMessage message="You don't have permission to view audit logs." /></Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader backTo={{ to: `/organizations/${organizationId}`, label: 'Organization' }} title="Audit Logs" subtitle="Security and business-critical activity for this organization." />
      <ErrorMessage message={error} />
      <Card>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Date</th><th>Actor</th><th>Action</th><th>Resource</th><th>Result</th><th>Product</th><th>Request ID</th><th>Detail</th></tr>
            </thead>
            <tbody>
              {data?.items.map((item) => (
                <tr key={item._id}>
                  <td>{new Date(item.occurredAt).toLocaleString()}</td>
                  <td>{item.actorType}{item.actorUserId ? `:${item.actorUserId.slice(-6)}` : ''}</td>
                  <td>{item.action}</td>
                  <td>{item.resourceType}{item.resourceId ? `:${item.resourceId.slice(-6)}` : ''}</td>
                  <td><Badge status={item.result === 'success' ? 'active' : 'failed'} /></td>
                  <td>{item.productId ? item.productId.slice(-6) : '-'}</td>
                  <td>{item.requestId || '-'}</td>
                  <td>{compact(item.afterSummary || item.metadata)}</td>
                </tr>
              ))}
              {(!data || data.items.length === 0) && <tr><td colSpan={8} className="empty-table">No audit logs yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="form-inline" style={{ marginTop: 14 }}>
          <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) })}>Previous</button>
          <span className="muted">Page {data?.page ?? page}</span>
          <button className="btn btn-secondary" disabled={!data || page * data.limit >= data.total} onClick={() => setParams({ page: String(page + 1) })}>Next</button>
        </div>
      </Card>
      <p className="muted" style={{ marginTop: 18 }}><Link to={`/organizations/${organizationId}`}>Back to organization</Link></p>
    </AppLayout>
  );
}
