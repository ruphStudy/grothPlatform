import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, apiRequest } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Loading } from '../../components/Loading';
import { PublicLayout } from '../../components/launch/PublicLayout';
import type { BillingInterval, BillingPlan } from '../../types';

function money(amountMinor: number, currency: string) {
  if (amountMinor === 0) return 'Free';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amountMinor / 100);
}

function limitText(value: unknown) {
  if (value === null) return 'Unlimited';
  if (value === undefined || value === false) return 'Not included';
  if (value === true) return 'Included';
  return String(value);
}

export default function PricingPage() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [interval, setInterval] = useState<BillingInterval>('monthly');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<BillingPlan[]>('/billing/plans', { auth: false })
      .then((data) => setPlans(data.filter((plan) => plan.status === 'active' && plan.visibility === 'public')))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load pricing'))
      .finally(() => setLoading(false));
  }, []);

  const intervals = useMemo(() => new Set(plans.flatMap((plan) => plan.prices.map((price) => price.interval))), [plans]);
  const canToggle = intervals.has('monthly') && intervals.has('yearly');

  function cta(plan: BillingPlan) {
    if (accessToken) {
      navigate('/dashboard');
      return;
    }
    navigate(`/signup?plan=${encodeURIComponent(plan.key)}&interval=${interval}`);
  }

  return (
    <PublicLayout>
      <section className="public-section">
        <div className="section-heading">
          <h1>Pricing</h1>
          <p className="muted">Plans and quotas are loaded from the billing plan configuration.</p>
        </div>
        {canToggle && (
          <div className="team-tabs">
            <button className={`team-tab ${interval === 'monthly' ? 'team-tab-active' : ''}`} type="button" onClick={() => setInterval('monthly')}>Monthly</button>
            <button className={`team-tab ${interval === 'yearly' ? 'team-tab-active' : ''}`} type="button" onClick={() => setInterval('yearly')}>Yearly</button>
          </div>
        )}
        {loading && <Loading />}
        <ErrorMessage message={error} />
        <div className="pricing-grid">
          {plans.map((plan) => {
            const price = plan.prices.find((item) => item.interval === interval) || plan.prices[0];
            return (
              <article className="pricing-card" key={plan.key}>
                <h2>{plan.name}</h2>
                <p className="muted">{plan.description}</p>
                <strong className="price">{price ? money(price.amountMinor, price.currency) : 'Contact'}</strong>
                {price && <span className="muted">/{price.interval}</span>}
                <div className="tag-list">
                  <span className="tag">Products: {limitText(plan.entitlements.maxProducts)}</span>
                  <span className="tag">Team: {limitText(plan.entitlements.maxOrganizationMembers)}</span>
                  <span className="tag">Content: {limitText(plan.entitlements.maxContentGenerationsPerPeriod)}</span>
                  <span className="tag">Creative: {limitText(plan.entitlements.maxCreativeGenerationsPerPeriod)}</span>
                  <span className="tag">Leads: {limitText(plan.entitlements.maxLeads)}</span>
                  <span className="tag">Analytics: {limitText(plan.entitlements.advancedAnalyticsEnabled)}</span>
                  <span className="tag">Growth Brain: {limitText(plan.entitlements.autonomousBrainEnabled)}</span>
                  <span className="tag">Approvals: {limitText(plan.entitlements.approvalsEnabled)}</span>
                </div>
                <button type="button" className="btn btn-primary btn-block" onClick={() => cta(plan)}>
                  {price?.amountMinor === 0 ? 'Start Free' : 'Start Trial'}
                </button>
              </article>
            );
          })}
        </div>
        <div className="public-faq">
          <h2>Billing FAQ</h2>
          <p>Trials do not require card collection by default. Paid checkout is created server-side from plan keys, and customer data is preserved if a trial ends or a plan changes.</p>
          <p><Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy</Link> explain billing, cancellation, AI providers, and data handling.</p>
        </div>
      </section>
    </PublicLayout>
  );
}
