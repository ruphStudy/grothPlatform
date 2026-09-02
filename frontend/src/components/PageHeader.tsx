import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  backTo?: { to: string; label: string };
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, backTo, actions }: PageHeaderProps) {
  return (
    <div className="page-header">
      {backTo && (
        <Link to={backTo.to} className="back-link">
          &larr; {backTo.label}
        </Link>
      )}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="page-header-actions">{actions}</div>}
      </div>
    </div>
  );
}
