import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { Badge } from '../components/Badge';
import { Card } from '../components/Card';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import { PRIMARY_GOALS, PRODUCT_TYPES, type Organization, type Product } from '../types';

const emptyForm = {
  name: '',
  websiteUrl: '',
  shortDescription: '',
  productType: '',
  primaryGoal: '',
  targetMarkets: '',
};

export default function OrganizationPage() {
  const { organizationId } = useParams<{ organizationId: string }>();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function loadData() {
    if (!organizationId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [organizationData, productsData] = await Promise.all([
        apiRequest<Organization>(`/organizations/${organizationId}`),
        apiRequest<Product[]>(`/organizations/${organizationId}/products`),
      ]);
      setOrganization(organizationData);
      setProducts(productsData);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load organization');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  async function handleCreateProduct(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const body: Record<string, unknown> = { name: form.name };
      if (form.websiteUrl) body.websiteUrl = form.websiteUrl;
      if (form.shortDescription) body.shortDescription = form.shortDescription;
      if (form.productType) body.productType = form.productType;
      if (form.primaryGoal) body.primaryGoal = form.primaryGoal;
      if (form.targetMarkets) {
        body.targetMarkets = form.targetMarkets
          .split(',')
          .map((market) => market.trim())
          .filter(Boolean);
      }

      await apiRequest(`/organizations/${organizationId}/products`, { method: 'POST', body });
      setForm(emptyForm);
      await loadData();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Failed to create product');
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <Loading />
      </AppLayout>
    );
  }

  if (loadError) {
    return (
      <AppLayout>
        <ErrorMessage message={loadError} />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        backTo={{ to: '/dashboard', label: 'Dashboard' }}
        title={organization?.name}
        actions={organization && <Badge status={organization.status} />}
      />

      <Card>
        <h2 className="card-title">Create Product</h2>
        <form onSubmit={handleCreateProduct} className="form form-grid-2" style={{ marginTop: 14 }}>
          <div className="field">
            <label htmlFor="product-name">Name</label>
            <input
              id="product-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="product-website">Website URL</label>
            <input
              id="product-website"
              value={form.websiteUrl}
              onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })}
            />
          </div>
          <div className="field field-full">
            <label htmlFor="product-description">Short description</label>
            <input
              id="product-description"
              value={form.shortDescription}
              onChange={(e) => setForm({ ...form, shortDescription: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="product-type">Product type</label>
            <select
              id="product-type"
              value={form.productType}
              onChange={(e) => setForm({ ...form, productType: e.target.value })}
            >
              <option value="">Select product type</option>
              {PRODUCT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="primary-goal">Primary goal</label>
            <select
              id="primary-goal"
              value={form.primaryGoal}
              onChange={(e) => setForm({ ...form, primaryGoal: e.target.value })}
            >
              <option value="">Select primary goal</option>
              {PRIMARY_GOALS.map((goal) => (
                <option key={goal} value={goal}>
                  {goal}
                </option>
              ))}
            </select>
          </div>
          <div className="field field-full">
            <label htmlFor="target-markets">Target markets</label>
            <input
              id="target-markets"
              placeholder="Comma-separated, e.g. India, Global"
              value={form.targetMarkets}
              onChange={(e) => setForm({ ...form, targetMarkets: e.target.value })}
            />
          </div>
          <div className="field-full">
            <ErrorMessage message={createError} />
            <button type="submit" className="btn btn-primary" disabled={creating} style={{ marginTop: 6 }}>
              {creating ? 'Creating...' : 'Create Product'}
            </button>
          </div>
        </form>
      </Card>

      <div className="section">
        <h2 className="section-title">Products</h2>
        {products.length === 0 && <Card className="empty-state">No products yet.</Card>}
        {products.length > 0 && (
          <div className="grid-cards">
            {products.map((product) => (
              <Card key={product.id} className="entity-card">
                <div className="entity-card-header">
                  <h3>{product.name}</h3>
                  <Badge status={product.status} />
                </div>
                {(product.productType || product.primaryGoal) && (
                  <div className="tag-list">
                    {product.productType && <span className="tag">{product.productType}</span>}
                    {product.primaryGoal && <span className="tag">{product.primaryGoal}</span>}
                  </div>
                )}
                {product.targetMarkets?.length > 0 && (
                  <p className="entity-card-meta">Markets: {product.targetMarkets.join(', ')}</p>
                )}
                <Link
                  to={`/organizations/${organizationId}/products/${product.id}`}
                  className="btn btn-secondary btn-block"
                >
                  Open Product
                </Link>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
