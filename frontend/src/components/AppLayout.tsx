import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner container">
          <Link to="/dashboard" className="brand">
            <span className="brand-title">GIP</span>
            <span className="brand-subtitle">Growth Intelligence Platform</span>
          </Link>
          <div className="header-user">
            {user?.email && <span className="header-email">{user.email}</span>}
            <button type="button" className="btn btn-ghost" onClick={logout}>
              Logout
            </button>
          </div>
        </div>
      </header>
      <main className="container app-main">{children}</main>
    </div>
  );
}
