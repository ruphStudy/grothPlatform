import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { Card } from '../components/Card';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import type { InAppNotification, NotificationListResponse } from '../types';

function labelize(value: string): string {
  return value.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'unread' | 'all'>('unread');
  const [items, setItems] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const query = tab === 'unread' ? '?unreadOnly=true&limit=50' : '?limit=50';
      setItems((await apiRequest<NotificationListResponse>(`/notifications${query}`)).items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function open(item: InAppNotification) {
    await apiRequest(`/notifications/${item._id}/read`, { method: 'POST', body: {} }).catch(() => null);
    if (item.approvalRequestId && item.organizationId && item.productId) navigate(`/organizations/${item.organizationId}/products/${item.productId}/approvals?approvalId=${item.approvalRequestId}`);
    else await load();
  }

  async function markAllRead() {
    await apiRequest('/notifications/read-all', { method: 'POST', body: {} });
    await load();
  }

  return (
    <AppLayout>
      <PageHeader title="Notifications" actions={<button className="btn btn-secondary" onClick={markAllRead}>Mark All Read</button>} />
      <ErrorMessage message={error} />
      {loading && <Loading />}
      <Card>
        <div className="profile-meta"><button className={`btn ${tab === 'unread' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('unread')}>Unread</button><button className={`btn ${tab === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('all')}>All</button></div>
      </Card>
      <Card>
        <h2 className="card-title">{tab === 'unread' ? 'Unread' : 'All'} Notifications</h2>
        {items.map((item) => (
          <button key={item._id} className="entity-card" style={{ width: '100%', textAlign: 'left' }} onClick={() => open(item)}>
            <div className="entity-card-header"><strong>{item.title}</strong><span className="tag">{labelize(item.severity)}</span></div>
            <p>{item.message}</p>
            <p className="entity-card-meta">{labelize(item.type)} · {item.readAt ? 'Read' : 'Unread'} · {new Date(item.createdAt).toLocaleString()}</p>
          </button>
        ))}
        {!items.length && <p className="entity-card-meta">No notifications.</p>}
      </Card>
    </AppLayout>
  );
}
