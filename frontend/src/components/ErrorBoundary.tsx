import { Component, type ErrorInfo, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.VITE_ERROR_MONITORING_DSN) {
      console.error('frontend_error', { message: error.message, componentStack: info.componentStack });
    }
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="app-main">
          <div className="container">
            <div className="card empty-state">
              <h1 className="page-title">Something went wrong.</h1>
              <p className="muted" style={{ marginTop: 8 }}>Refresh the page or return to the dashboard.</p>
              <button type="button" className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => window.location.assign('/dashboard')}>
                Back to Dashboard
              </button>
            </div>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
