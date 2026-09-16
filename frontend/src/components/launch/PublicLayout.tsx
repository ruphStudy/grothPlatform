import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="public-shell">
      <header className="public-header">
        <Link to="/" className="brand">
          <span className="brand-title">GIP</span>
          <span className="brand-subtitle">Growth Intelligence Platform</span>
        </Link>
        <nav className="public-nav">
          <Link to="/pricing">Pricing</Link>
          <Link to="/login">Login</Link>
          <Link to="/signup" className="btn btn-primary">Start Trial</Link>
        </nav>
      </header>
      <main>{children}</main>
      <footer className="public-footer">
        <Link to="/pricing">Pricing</Link>
        <Link to="/terms">Terms</Link>
        <Link to="/privacy">Privacy</Link>
        <Link to="/login">Login</Link>
        <Link to="/signup">Signup</Link>
      </footer>
    </div>
  );
}
