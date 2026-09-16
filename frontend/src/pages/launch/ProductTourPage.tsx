import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../../api/client';
import { AppLayout } from '../../components/AppLayout';
import { Card } from '../../components/Card';
import type { OnboardingState } from '../../types';

const steps = [
  ['Dashboard', 'Review product context and first-run actions.'],
  ['Product Intelligence', 'Analyze your product only when you choose to run it.'],
  ['Growth Strategy', 'Turn evidence into objectives, messaging, and campaign plans.'],
  ['Campaigns', 'Coordinate content, creative, and publishing work.'],
  ['Content', 'Generate grounded drafts with human review.'],
  ['Leads/CRM', 'Capture, qualify, and manage opportunities.'],
  ['Analytics', 'Track web, campaign, and attribution performance.'],
  ['Growth Brain', 'Run autonomous planning within plan and permission limits.'],
  ['Approvals', 'Keep publishing decisions controlled.'],
  ['Team/Billing', 'Manage roles, access, plans, and quotas.'],
];

export default function ProductTourPage() {
  const { organizationId, productId } = useParams<{ organizationId: string; productId: string }>();
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    apiRequest<OnboardingState>('/me/onboarding/tour', { method: 'POST', body: { tourVersion: 'gip-main-tour:v1', started: true } }).catch(() => null);
  }, []);

  async function finish(skipped = false) {
    await apiRequest('/me/onboarding/tour', { method: 'POST', body: { tourVersion: 'gip-main-tour:v1', completed: !skipped, skipped } }).catch(() => null);
    navigate(`/organizations/${organizationId}/products/${productId}`);
  }

  const step = steps[index];
  return (
    <AppLayout>
      <Card>
        <p className="muted">Tour {index + 1} of {steps.length}</p>
        <h1>{step[0]}</h1>
        <p className="muted">{step[1]}</p>
        <div className="page-header-actions" style={{ marginTop: 18 }}>
          <button className="btn btn-ghost" onClick={() => finish(true)}>Skip</button>
          <button className="btn btn-secondary" disabled={index === 0} onClick={() => setIndex(index - 1)}>Back</button>
          {index < steps.length - 1 ? <button className="btn btn-primary" onClick={() => setIndex(index + 1)}>Next</button> : <button className="btn btn-primary" onClick={() => finish(false)}>Finish</button>}
        </div>
        <p className="muted" style={{ marginTop: 12 }}><Link to={`/organizations/${organizationId}/products/${productId}`}>Return to product</Link></p>
      </Card>
    </AppLayout>
  );
}
