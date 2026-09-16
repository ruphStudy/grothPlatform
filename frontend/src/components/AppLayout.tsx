import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { InAppNotification, NotificationListResponse, Organization, OrganizationSubscription } from '../types';

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<InAppNotification[]>([]);
  const [trial, setTrial] = useState<{ organizationId: string; daysRemaining: number | null; expired: boolean } | null>(null);

  async function loadNotifications() {
    if (!user) return;
    try {
      const [count, list] = await Promise.all([
        apiRequest<{ unread: number }>('/notifications/unread-count'),
        apiRequest<NotificationListResponse>('/notifications?limit=5'),
      ]);
      setUnread(count.unread);
      setItems(list.items);
    } catch {
      setUnread(0);
    }
  }

  useEffect(() => {
    loadNotifications();
    const timer = window.setInterval(loadNotifications, 60000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    apiRequest<Organization[]>('/organizations')
      .then(async (orgs) => {
        const org = orgs[0];
        if (!org) return;
        const sub = await apiRequest<OrganizationSubscription>(`/organizations/${org.id}/billing/subscription`);
        if (sub.trial && (sub.trial.daysRemaining !== null || sub.trial.expired)) setTrial({ organizationId: org.id, daysRemaining: sub.trial.daysRemaining, expired: !!sub.trial.expired });
      })
      .catch(() => null);
  }, [user?.id]);

  async function openNotification(item: InAppNotification) {
    await apiRequest(`/notifications/${item._id}/read`, { method: 'POST', body: {} }).catch(() => null);
    setOpen(false);
    await loadNotifications();
    if (item.approvalRequestId && item.organizationId && item.productId) navigate(`/organizations/${item.organizationId}/products/${item.productId}/approvals?approvalId=${item.approvalRequestId}`);
    else navigate('/notifications');
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner container">
          <Link to="/dashboard" className="brand">
            <span className="brand-title">GIP</span>
            <span className="brand-subtitle">Growth Intelligence Platform</span>
          </Link>
          <div className="header-user">
            {user && (
              <div style={{ position: 'relative' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setOpen(!open)}>
                  Notifications {unread > 0 ? `(${unread})` : ''}
                </button>
                {open && (
                  <div className="card" style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 360, zIndex: 20, padding: 12 }}>
                    {items.map((item) => (
                      <button key={item._id} type="button" className="entity-card" style={{ width: '100%', textAlign: 'left' }} onClick={() => openNotification(item)}>
                        <strong>{item.title}</strong>
                        <p className="entity-card-meta">{item.readAt ? 'Read' : 'Unread'} · {new Date(item.createdAt).toLocaleString()}</p>
                      </button>
                    ))}
                    {!items.length && <p className="entity-card-meta">No notifications.</p>}
                    <Link to="/notifications" className="btn btn-secondary" onClick={() => setOpen(false)}>View All</Link>
                  </div>
                )}
              </div>
            )}
            {user?.email && <span className="header-email">{user.email}</span>}
            <button type="button" className="btn btn-ghost" onClick={logout}>
              Logout
            </button>
          </div>
        </div>
      </header>
      {trial && (
        <div className={`trial-banner ${trial.expired ? 'trial-expired' : ''}`}>
          {trial.expired ? 'Trial ended. Your data is safe.' : `Trial: ${trial.daysRemaining ?? 0} day(s) remaining.`}
          <Link to={`/organizations/${trial.organizationId}/billing`}>View Plans</Link>
        </div>
      )}
      <main className="container app-main">{children}</main>
    </div>
  );
}
