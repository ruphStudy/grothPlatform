import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { Badge } from '../components/Badge';
import { Card } from '../components/Card';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import type { Organization } from '../types';

export default function DashboardPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function loadOrganizations() {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiRequest<Organization[]>('/organizations');
      setOrganizations(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load organizations');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrganizations();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      await apiRequest('/organizations', { method: 'POST', body: { name } });
      setName('');
      await loadOrganizations();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Failed to create organization');
    } finally {
      setCreating(false);
    }
  }

  return (
    <AppLayout>
      <PageHeader title="Organizations" subtitle="Manage the organizations you own and their products." />

      <Card>
        <h2 className="card-title">Create Organization</h2>
        <form onSubmit={handleCreate} className="form form-inline" style={{ marginTop: 14 }}>
          <input
            placeholder="Organization name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <button type="submit" className="btn btn-primary" disabled={creating}>
            {creating ? 'Creating...' : 'Create'}
          </button>
        </form>
        <div style={{ marginTop: 10 }}>
          <ErrorMessage message={createError} />
        </div>
      </Card>

      <div className="section">
        <h2 className="section-title">Your Organizations</h2>
        {loading && <Loading />}
        <ErrorMessage message={loadError} />
        {!loading && !loadError && organizations.length === 0 && (
          <Card className="empty-state">No organizations yet. Create your first one above.</Card>
        )}
        {organizations.length > 0 && (
          <div className="grid-cards">
            {organizations.map((org) => (
              <Card key={org.id} className="entity-card">
                <div className="entity-card-header">
                  <h3>{org.name}</h3>
                  <Badge status={org.status} />
                </div>
                <p className="entity-card-meta">/{org.slug}</p>
                <Link to={`/organizations/${org.id}`} className="btn btn-secondary btn-block">
                  Open
                </Link>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
