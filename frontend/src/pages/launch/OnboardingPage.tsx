import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../../api/client';
import { AppLayout } from '../../components/AppLayout';
import { Card } from '../../components/Card';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Loading } from '../../components/Loading';
import type { BillingPlan, OnboardingState, Organization, Product } from '../../types';

const goals = [
  { label: 'Increase Traffic', value: 'traffic' },
  { label: 'Generate Leads', value: 'leads' },
  { label: 'Improve Conversion', value: 'sales' },
  { label: 'Grow Content', value: 'awareness' },
  { label: 'Improve Email Marketing', value: 'engagement' },
  { label: 'Build Social Presence', value: 'awareness' },
  { label: 'Other', value: 'other' },
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [step, setStep] = useState(1);
  const [orgName, setOrgName] = useState('');
  const [selectedOrg, setSelectedOrg] = useState('');
  const [productName, setProductName] = useState('');
  const [productType, setProductType] = useState('saas');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [description, setDescription] = useState('');
  const [targetMarket, setTargetMarket] = useState('');
  const [goal, setGoal] = useState('leads');
  const [selectedPlan, setSelectedPlan] = useState(params.get('plan') || 'free');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [onboarding, planData, orgData] = await Promise.all([
        apiRequest<OnboardingState>('/me/onboarding'),
        apiRequest<BillingPlan[]>('/billing/plans', { auth: false }),
        apiRequest<Organization[]>('/organizations'),
      ]);
      setState(onboarding);
      setPlans(planData);
      setOrganizations(orgData);
      const orgId = onboarding.organizationId || orgData[0]?.id || '';
      setSelectedOrg(orgId);
      setSelectedPlan(onboarding.selectedPlanKey || params.get('plan') || 'free');
      if (orgId) setProducts(await apiRequest<Product[]>(`/organizations/${orgId}/products`));
      if (onboarding.completedAt && onboarding.organizationId && onboarding.productId) navigate(`/organizations/${onboarding.organizationId}/products/${onboarding.productId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load onboarding');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedOrg) return;
    apiRequest<Product[]>(`/organizations/${selectedOrg}/products`).then(setProducts).catch(() => setProducts([]));
  }, [selectedOrg]);

  async function createOrg(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiRequest<{ organization: Organization; onboarding: OnboardingState }>('/me/onboarding/organization', { method: 'POST', body: { name: orgName } });
      setOrganizations((prev) => [...prev, res.organization]);
      setSelectedOrg(res.organization.id);
      setState(res.onboarding);
      setStep(3);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Organization setup failed');
    } finally {
      setBusy(false);
    }
  }

  async function saveExistingOrg() {
    if (!selectedOrg) return;
    await apiRequest('/me/onboarding', { method: 'PATCH', body: { organizationId: selectedOrg, currentStep: 'product', completedSteps: [...(state?.completedSteps || []), 'organization'] } });
    setStep(3);
  }

  async function createProduct(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiRequest<{ product: Product; onboarding: OnboardingState }>('/me/onboarding/product', {
        method: 'POST',
        body: { organizationId: selectedOrg, name: productName, productType, websiteUrl: websiteUrl || undefined, shortDescription: description, targetMarket, primaryGoal: goal },
      });
      setProducts((prev) => [...prev, res.product]);
      setState(res.onboarding);
      setStep(5);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Product setup failed');
    } finally {
      setBusy(false);
    }
  }

  async function complete() {
    const productId = state?.productId || products[0]?.id;
    if (!selectedOrg || !productId) {
      setError('Organization and product are required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await apiRequest<{ redirectTo: string }>('/me/onboarding/complete', { method: 'POST', body: { organizationId: selectedOrg, productId, selectedPlanKey: selectedPlan, selectedBillingInterval: 'monthly' } });
      navigate(res.redirectTo);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Onboarding completion failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <AppLayout><Loading /></AppLayout>;

  return (
    <AppLayout>
      <div className="onboarding-shell">
        <p className="muted">Step {step} of 7</p>
        <div className="quota-track"><div className="quota-fill" style={{ width: `${Math.round((step / 7) * 100)}%` }} /></div>
        <ErrorMessage message={error} />
        {step === 1 && <Card><h1>Welcome to GIP</h1><p className="muted">Set up your organization, first product, and trial without triggering paid provider actions or AI calls.</p><button className="btn btn-primary" onClick={() => setStep(2)}>Continue</button></Card>}
        {step === 2 && (
          <Card>
            <h1>Organization</h1>
            {organizations.length > 0 && (
              <div className="form">
                <label className="field">Use existing organization<select value={selectedOrg} onChange={(e) => setSelectedOrg(e.target.value)}>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>
                <button className="btn btn-secondary" onClick={saveExistingOrg}>Use Organization</button>
              </div>
            )}
            <form className="form" onSubmit={createOrg} style={{ marginTop: 18 }}>
              <label className="field">Create organization<input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Company or team name" required /></label>
              <button className="btn btn-primary" disabled={busy}>{busy ? 'Creating...' : 'Create Organization'}</button>
            </form>
          </Card>
        )}
        {step === 3 && (
          <Card>
            <h1>First Product</h1>
            {products.length > 0 && <button className="btn btn-secondary" onClick={() => setStep(5)}>Use existing product</button>}
            <form className="form" onSubmit={createProduct} style={{ marginTop: 18 }}>
              <label className="field">Product Name<input value={productName} onChange={(e) => setProductName(e.target.value)} required /></label>
              <label className="field">Product Type<select value={productType} onChange={(e) => setProductType(e.target.value)}><option value="saas">SaaS</option><option value="service">Service</option><option value="ecommerce">Ecommerce</option><option value="mobile_app">Mobile App</option><option value="other">Other</option></select></label>
              <label className="field">Website URL optional<input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://example.com" /></label>
              <label className="field">Short Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} /></label>
              <label className="field">Target Market optional<input value={targetMarket} onChange={(e) => setTargetMarket(e.target.value)} /></label>
              <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Save Product'}</button>
            </form>
          </Card>
        )}
        {step === 5 && (
          <Card>
            <h1>Growth Goal</h1>
            <div className="checkbox-grid">{goals.map((item) => <button key={item.label} className={`team-tab ${goal === item.value ? 'team-tab-active' : ''}`} type="button" onClick={() => setGoal(item.value)}>{item.label}</button>)}</div>
            <div className="page-header-actions" style={{ marginTop: 18 }}><button className="btn btn-ghost" onClick={() => setStep(3)}>Back</button><button className="btn btn-primary" onClick={() => setStep(6)}>Continue</button></div>
          </Card>
        )}
        {step === 6 && (
          <Card>
            <h1>Plan and Trial</h1>
            <p className="muted">Your trial/subscription is created server-side for the organization. Paid provider checkout is not started during onboarding.</p>
            <select value={selectedPlan} onChange={(e) => setSelectedPlan(e.target.value)}>{plans.map((plan) => <option key={plan.key} value={plan.key}>{plan.name}</option>)}</select>
            <div className="page-header-actions" style={{ marginTop: 18 }}><button className="btn btn-ghost" onClick={() => setStep(5)}>Back</button><button className="btn btn-primary" onClick={() => setStep(7)}>Confirm</button></div>
          </Card>
        )}
        {step === 7 && <Card><h1>Launch Dashboard</h1><p className="muted">Next: complete Product Intelligence, connect website, create a campaign, invite team, and review billing.</p><button className="btn btn-primary" disabled={busy} onClick={complete}>{busy ? 'Launching...' : 'Open Dashboard'}</button></Card>}
        <p className="muted" style={{ marginTop: 16 }}><Link to="/dashboard">Skip to dashboard</Link></p>
      </div>
    </AppLayout>
  );
}
