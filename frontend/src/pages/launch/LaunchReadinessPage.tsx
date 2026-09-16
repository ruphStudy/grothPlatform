import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../../api/client';
import { AppLayout } from '../../components/AppLayout';
import { Card } from '../../components/Card';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Loading } from '../../components/Loading';
import { PageHeader } from '../../components/PageHeader';
import type { LaunchReadinessResponse } from '../../types';

export default function LaunchReadinessPage() {
  const { organizationId } = useParams<{ organizationId: string }>();
  const [data, setData] = useState<LaunchReadinessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<LaunchReadinessResponse>(`/organizations/${organizationId}/launch-readiness`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load launch readiness'))
      .finally(() => setLoading(false));
  }, [organizationId]);

  const groups = useMemo(() => {
    const map = new Map<string, NonNullable<LaunchReadinessResponse['items']>>();
    for (const item of data?.items || []) map.set(item.category, [...(map.get(item.category) || []), item]);
    return [...map.entries()];
  }, [data]);

  return (
    <AppLayout>
      <PageHeader backTo={{ to: `/organizations/${organizationId}`, label: 'Organization' }} title="Launch Readiness" subtitle="Programmatic checks and manual launch blockers. Secret values are never displayed." />
      {loading && <Loading />}
      <ErrorMessage message={error} />
      {data && (
        <>
          <Card>
            <div className="summary-grid">
              <div><span className="summary-label">Required Passed</span><p>{data.summary.requiredPassed}</p></div>
              <div><span className="summary-label">Failures</span><p>{data.summary.failures}</p></div>
              <div><span className="summary-label">Warnings</span><p>{data.summary.warnings}</p></div>
              <div><span className="summary-label">Manual</span><p>{data.summary.manual}</p></div>
            </div>
          </Card>
          {groups.map(([category, items]) => (
            <Card key={category}>
              <h2>{category}</h2>
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table className="data-table">
                  <thead><tr><th>Check</th><th>Status</th><th>Required</th><th>Details</th></tr></thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.key}>
                        <td>{item.label}</td>
                        <td><span className={`tag readiness-${item.status}`}>{item.status}</span></td>
                        <td>{item.required ? 'Yes' : 'No'}</td>
                        <td>{item.details || 'Configured check'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
          <p className="muted" style={{ marginTop: 18 }}>Full checklist: <Link to="/terms">legal pages</Link> and docs/launch-readiness.md.</p>
        </>
      )}
    </AppLayout>
  );
}
