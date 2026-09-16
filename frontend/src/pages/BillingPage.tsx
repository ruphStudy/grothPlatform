import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { Badge } from '../components/Badge';
import { Card } from '../components/Card';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import { usePermissions } from '../hooks/usePermissions';
import type { AiUsageSummary, BillingInterval, BillingPlan, OrganizationSubscription, UsageResponse, UsageSummary } from '../types';

type BillingTab = 'overview' | 'plans' | 'usage' | 'ai' | 'limits' | 'payment';

function money(amountMinor?: number, currency = 'USD') {
  if (amountMinor === undefined) return '-';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amountMinor / 100);
}

function limitText(value: number | null | undefined) {
  if (value === null) return 'Unlimited';
  if (value === undefined) return '-';
  return String(value);
}

function UsageMeter({ item }: { item: UsageSummary }) {
  const width = item.percentage === null ? 0 : Math.min(100, item.percentage);
  return (
    <div className={`quota-meter quota-${item.warningLevel}`}>
      <div className="quota-row">
        <strong>{item.label}</strong>
        <span>{item.used} / {item.limit === null ? 'Unlimited' : item.limit}</span>
      </div>
      <div className="quota-track">
        <div className="quota-fill" style={{ width: `${width}%` }} />
      </div>
      {item.warningLevel === 'warning' && <p className="muted">Approaching quota.</p>}
      {item.warningLevel === 'exceeded' && <p className="muted">Quota reached. Upgrade to continue.</p>}
    </div>
  );
}

export default function BillingPage() {
  const { organizationId } = useParams<{ organizationId: string }>();
  const [params] = useSearchParams();
  const permissions = usePermissions(organizationId);
  const [tab, setTab] = useState<BillingTab>('overview');
  const [interval, setInterval] = useState<BillingInterval>('monthly');
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [subscription, setSubscription] = useState<OrganizationSubscription | null>(null);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [aiUsage, setAiUsage] = useState<AiUsageSummary[]>([]);
  const [quotas, setQuotas] = useState<UsageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(params.get('session_id') ? 'Subscription is being confirmed. We will show the active state after backend synchronization.' : null);

  const canView = permissions.hasPermission('billing.view');
  const canManage = permissions.hasPermission('billing.manage');

  async function loadData() {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const [planData, subData, usageData, aiData, quotaData] = await Promise.all([
        apiRequest<BillingPlan[]>('/billing/plans', { auth: false }),
        apiRequest<OrganizationSubscription>(`/organizations/${organizationId}/billing/subscription`),
        apiRequest<UsageResponse>(`/organizations/${organizationId}/billing/usage`),
        apiRequest<AiUsageSummary[]>(`/organizations/${organizationId}/billing/usage/ai`),
        apiRequest<UsageSummary[]>(`/organizations/${organizationId}/billing/quotas`),
      ]);
      setPlans(planData);
      setSubscription(subData);
      setUsage(usageData);
      setAiUsage(aiData);
      setQuotas(quotaData);
      setInterval(subData.billingInterval || 'monthly');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load billing');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!permissions.loading && canView) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, permissions.loading, canView]);

  const warnings = useMemo(() => quotas.filter((item) => item.warningLevel !== 'none'), [quotas]);

  async function billingAction(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      await action();
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Billing action failed');
    } finally {
      setBusy(null);
    }
  }

  async function choosePlan(plan: BillingPlan) {
    const price = plan.prices.find((item) => item.interval === interval) || plan.prices[0];
    if (!price) return;
    await billingAction(`plan-${plan.key}`, async () => {
      if (price.amountMinor === 0) {
        await apiRequest(`/organizations/${organizationId}/billing/change-plan`, { method: 'POST', body: { planKey: plan.key, billingInterval: price.interval, currency: price.currency } });
        setMessage('Plan updated.');
        return;
      }
      const checkout = await apiRequest<{ checkoutUrl: string }>(`/organizations/${organizationId}/billing/checkout`, { method: 'POST', body: { planKey: plan.key, billingInterval: price.interval, currency: price.currency } });
      setMessage('Checkout created server-side. Subscription activates only after webhook synchronization.');
      if (checkout.checkoutUrl) window.location.href = checkout.checkoutUrl;
    });
  }

  if (permissions.loading || loading) {
    return (
      <AppLayout>
        <Loading />
      </AppLayout>
    );
  }

  if (!canView) {
    return (
      <AppLayout>
        <PageHeader backTo={{ to: `/organizations/${organizationId}`, label: 'Organization' }} title="Billing & Usage" />
        <Card><ErrorMessage message="You don't have permission to view billing." /></Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        backTo={{ to: `/organizations/${organizationId}`, label: 'Organization' }}
        title="Billing & Usage"
        subtitle="Plans, subscription state, quotas, and AI usage for this organization."
        actions={subscription && <Badge status={subscription.status} />}
      />

      <div className="team-tabs" role="tablist">
        {(['overview', 'plans', 'usage', 'ai', 'limits', 'payment'] as BillingTab[]).map((item) => (
          <button key={item} type="button" className={`team-tab ${tab === item ? 'team-tab-active' : ''}`} onClick={() => setTab(item)}>
            {item === 'ai' ? 'AI Usage' : item}
          </button>
        ))}
      </div>

      <ErrorMessage message={error} />
      {message && <p className="success-message">{message}</p>}

      {tab === 'overview' && subscription && (
        <>
          <Card>
            <div className="summary-grid">
              <div><span className="summary-label">Current Plan</span><p>{subscription.planSnapshot.name}</p></div>
              <div><span className="summary-label">Status</span><Badge status={subscription.status} /></div>
              <div><span className="summary-label">Billing Interval</span><p>{subscription.billingInterval}</p></div>
              <div><span className="summary-label">Current Period</span><p>{new Date(subscription.periodStart).toLocaleDateString()} - {new Date(subscription.periodEnd).toLocaleDateString()}</p></div>
              <div><span className="summary-label">Next Renewal</span><p>{subscription.cancelAtPeriodEnd ? 'Cancels at period end' : new Date(subscription.periodEnd).toLocaleDateString()}</p></div>
              <div><span className="summary-label">Provider</span><p>{subscription.provider}</p></div>
            </div>
          </Card>
          {warnings.length > 0 && (
            <Card>
              <h2 className="card-title">Usage Warnings</h2>
              <div className="quota-grid">
                {warnings.slice(0, 6).map((item) => <UsageMeter key={item.metric} item={item} />)}
              </div>
            </Card>
          )}
        </>
      )}

      {tab === 'plans' && (
        <>
          <div className="form-inline" style={{ marginBottom: 12 }}>
            <button className={`btn ${interval === 'monthly' ? 'btn-primary' : 'btn-secondary'}`} type="button" onClick={() => setInterval('monthly')}>Monthly</button>
            <button className={`btn ${interval === 'yearly' ? 'btn-primary' : 'btn-secondary'}`} type="button" onClick={() => setInterval('yearly')}>Yearly</button>
          </div>
          <div className="grid-cards">
            {plans.map((plan) => {
              const price = plan.prices.find((item) => item.interval === interval) || plan.prices[0];
              const current = subscription?.planKey === plan.key;
              return (
                <Card key={plan.key} className="entity-card">
                  <div className="entity-card-header">
                    <h3>{plan.name}</h3>
                    {current && <span className="tag">Current Plan</span>}
                  </div>
                  <p className="card-subtitle">{plan.description}</p>
                  <h2 style={{ marginTop: 14 }}>{money(price?.amountMinor, price?.currency)} <span className="muted">/{price?.interval}</span></h2>
                  <div className="tag-list" style={{ marginTop: 12 }}>
                    <span className="tag">Products: {limitText(plan.entitlements.maxProducts as number | null | undefined)}</span>
                    <span className="tag">Members: {limitText(plan.entitlements.maxOrganizationMembers as number | null | undefined)}</span>
                    <span className="tag">AI units: {limitText(plan.entitlements.aiTokenAllowance as number | null | undefined)}</span>
                  </div>
                  {canManage ? (
                    <button type="button" className="btn btn-primary btn-block" disabled={current || busy === `plan-${plan.key}`} onClick={() => choosePlan(plan)}>
                      {current ? 'Current Plan' : busy === `plan-${plan.key}` ? 'Working...' : 'Select Plan'}
                    </button>
                  ) : (
                    <p className="muted" style={{ marginTop: 12 }}>Ask an organization admin to change plans.</p>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}

      {tab === 'usage' && (
        <Card>
          <h2 className="card-title">Usage</h2>
          <div className="quota-grid" style={{ marginTop: 14 }}>
            {usage?.summary.map((item) => <UsageMeter key={item.metric} item={item} />)}
          </div>
        </Card>
      )}

      {tab === 'ai' && (
        <Card>
          <h2 className="card-title">AI Usage</h2>
          <div className="table-wrap" style={{ marginTop: 14 }}>
            <table className="data-table">
              <thead><tr><th>Feature</th><th>Provider</th><th>Model</th><th>Calls</th><th>Tokens</th><th>Usage Units</th></tr></thead>
              <tbody>
                {aiUsage.map((row) => (
                  <tr key={`${row.feature}-${row.provider}-${row.model}-${row.productId || 'org'}`}>
                    <td>{row.feature.replace(/_/g, ' ')}</td><td>{row.provider}</td><td>{row.model}</td><td>{row.calls}</td><td>{row.tokens}</td><td>{row.customerUsageUnits}</td>
                  </tr>
                ))}
                {aiUsage.length === 0 && <tr><td colSpan={6} className="empty-table">No AI usage recorded for this organization.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'limits' && (
        <Card>
          <h2 className="card-title">Plan Limits</h2>
          <div className="quota-grid" style={{ marginTop: 14 }}>
            {quotas.map((item) => <UsageMeter key={item.metric} item={item} />)}
          </div>
          {warnings.some((item) => item.warningLevel === 'exceeded') && (
            <p className="muted" style={{ marginTop: 14 }}>
              {canManage ? 'View Plans to upgrade.' : 'Contact an organization admin to upgrade.'}
            </p>
          )}
        </Card>
      )}

      {tab === 'payment' && (
        <Card>
          <h2 className="card-title">Invoices & Payment</h2>
          <p className="card-subtitle">Payment method and invoice details are managed by the hosted provider portal when available.</p>
          <div className="form-inline" style={{ marginTop: 16 }}>
            <button type="button" className="btn btn-secondary" disabled={!canManage || busy === 'portal'} onClick={() => billingAction('portal', async () => {
              const portal = await apiRequest<{ portalUrl: string }>(`/organizations/${organizationId}/billing/portal`, { method: 'POST' });
              if (portal.portalUrl) window.location.href = portal.portalUrl;
            })}>Manage Payment & Invoices</button>
            {!subscription?.cancelAtPeriodEnd ? (
              <button type="button" className="btn btn-ghost" disabled={!canManage || busy === 'cancel'} onClick={() => billingAction('cancel', async () => {
                if (window.confirm('Cancel at period end? Access remains until the current period ends.')) await apiRequest(`/organizations/${organizationId}/billing/cancel`, { method: 'POST' });
              })}>Cancel at Period End</button>
            ) : (
              <button type="button" className="btn btn-primary" disabled={!canManage || busy === 'reactivate'} onClick={() => billingAction('reactivate', async () => {
                await apiRequest(`/organizations/${organizationId}/billing/reactivate`, { method: 'POST' });
              })}>Reactivate</button>
            )}
          </div>
          {!canManage && <p className="muted" style={{ marginTop: 12 }}>You can view billing, but only organization billing admins can manage payment or subscription changes.</p>}
        </Card>
      )}

      <p className="muted" style={{ marginTop: 18 }}>
        <Link to={`/organizations/${organizationId}`}>Back to organization</Link>
      </p>
    </AppLayout>
  );
}
