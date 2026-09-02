import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { Badge } from '../components/Badge';
import { Card } from '../components/Card';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import type { Product, ProductIntelligenceProfile, WebsitePreview } from '../types';

export default function ProductPage() {
  const { organizationId, productId } = useParams<{ organizationId: string; productId: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [profile, setProfile] = useState<ProductIntelligenceProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [websitePreview, setWebsitePreview] = useState<WebsitePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  async function loadData() {
    if (!organizationId || !productId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const productData = await apiRequest<Product>(`/organizations/${organizationId}/products/${productId}`);
      setProduct(productData);

      try {
        const profileData = await apiRequest<ProductIntelligenceProfile>(
          `/organizations/${organizationId}/products/${productId}/intelligence`,
        );
        setProfile(profileData);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setProfile(null);
        } else {
          throw err;
        }
      }
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load product');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, productId]);

  async function handleAnalyze() {
    setAnalyzeError(null);
    setAnalyzing(true);
    try {
      const data = await apiRequest<ProductIntelligenceProfile>(
        `/organizations/${organizationId}/products/${productId}/intelligence/analyze`,
        { method: 'POST' },
      );
      setProfile(data);
    } catch (err) {
      setAnalyzeError(err instanceof ApiError ? err.message : 'AI analysis failed');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handlePreviewWebsite() {
    setPreviewError(null);
    setPreviewing(true);
    try {
      const data = await apiRequest<WebsitePreview>(
        `/organizations/${organizationId}/products/${productId}/intelligence/website-preview`,
        { method: 'POST' },
      );
      setWebsitePreview(data);
    } catch (err) {
      setPreviewError(err instanceof ApiError ? err.message : 'Website preview failed');
    } finally {
      setPreviewing(false);
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
        backTo={{ to: `/organizations/${organizationId}`, label: 'Organization' }}
        title={product?.name}
        actions={product && <Badge status={product.status} />}
      />

      <Card className="summary-card">
        <div className="summary-grid">
          <div>
            <span className="summary-label">Description</span>
            <p>{product?.shortDescription || 'No description provided.'}</p>
          </div>
          <div>
            <span className="summary-label">Website</span>
            <p>
              {product?.websiteUrl ? (
                <a href={product.websiteUrl} target="_blank" rel="noreferrer">
                  {product.websiteUrl}
                </a>
              ) : (
                '-'
              )}
            </p>
          </div>
          <div>
            <span className="summary-label">Type</span>
            <p>{product?.productType || '-'}</p>
          </div>
          <div>
            <span className="summary-label">Primary Goal</span>
            <p>{product?.primaryGoal || '-'}</p>
          </div>
          <div>
            <span className="summary-label">Target Markets</span>
            <p>{product?.targetMarkets?.length ? product.targetMarkets.join(', ') : '-'}</p>
          </div>
        </div>
      </Card>

      <Card className="analysis-card">
        <div className="analysis-header">
          <div>
            <h2 className="card-title">Website Intelligence</h2>
            <p className="card-subtitle">
              Preview what GIP can read from this product's website before running AI analysis.
            </p>
          </div>
          {product?.websiteUrl && (
            <button type="button" onClick={handlePreviewWebsite} className="btn btn-primary" disabled={previewing}>
              {previewing ? 'Analyzing website...' : 'Preview Website'}
            </button>
          )}
        </div>

        {!product?.websiteUrl && (
          <p className="muted" style={{ marginTop: 10 }}>
            Add a website URL to enable Website Intelligence.
          </p>
        )}

        <ErrorMessage message={previewError} />
        {previewing && (
          <div className="analyzing-state">
            <span className="spinner" /> Analyzing website...
          </div>
        )}

        {websitePreview && (
          <div style={{ marginTop: 16 }}>
            <div className="summary-grid">
              <div>
                <span className="summary-label">Configured URL</span>
                <p>{websitePreview.source.configuredUrl}</p>
              </div>
              <div>
                <span className="summary-label">Final URL</span>
                <p>{websitePreview.finalUrl}</p>
              </div>
              <div>
                <span className="summary-label">Fetched At</span>
                <p>{new Date(websitePreview.fetchedAt).toLocaleString()}</p>
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <span className="summary-label">Page</span>
              <p>
                <strong>{websitePreview.title || 'No title found'}</strong>
              </p>
              {websitePreview.metaDescription && <p className="muted">{websitePreview.metaDescription}</p>}
            </div>

            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="summary-label" style={{ marginBottom: 0 }}>
                Content Quality
              </span>
              <span className={`quality-badge quality-${websitePreview.contentQuality}`}>
                {websitePreview.contentQuality}
              </span>
            </div>

            {websitePreview.contentWarning && (
              <div className="content-warning" style={{ marginTop: 10 }}>
                {websitePreview.contentWarning}
              </div>
            )}

            {websitePreview.headings.h1.length > 0 ||
            websitePreview.headings.h2.length > 0 ||
            websitePreview.headings.h3.length > 0 ? (
              <div style={{ marginTop: 16 }}>
                <h3 className="section-title">Headings</h3>
                {websitePreview.headings.h1.length > 0 && (
                  <>
                    <span className="summary-label">H1</span>
                    <ul className="bullet-list">
                      {websitePreview.headings.h1.map((heading, i) => (
                        <li key={i}>{heading}</li>
                      ))}
                    </ul>
                  </>
                )}
                {websitePreview.headings.h2.length > 0 && (
                  <>
                    <span className="summary-label">H2</span>
                    <ul className="bullet-list">
                      {websitePreview.headings.h2.map((heading, i) => (
                        <li key={i}>{heading}</li>
                      ))}
                    </ul>
                  </>
                )}
                {websitePreview.headings.h3.length > 0 && (
                  <>
                    <span className="summary-label">H3</span>
                    <ul className="bullet-list">
                      {websitePreview.headings.h3.map((heading, i) => (
                        <li key={i}>{heading}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            ) : (
              <p className="muted" style={{ marginTop: 16 }}>
                No headings found.
              </p>
            )}

            {websitePreview.paragraphs.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h3 className="section-title">Paragraphs</h3>
                <ul className="bullet-list">
                  {websitePreview.paragraphs.map((paragraph, i) => (
                    <li key={i}>{paragraph}</li>
                  ))}
                </ul>
              </div>
            )}

            {websitePreview.listItems.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h3 className="section-title">List Items</h3>
                <ul className="bullet-list">
                  {websitePreview.listItems.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {websitePreview.ctas.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h3 className="section-title">CTAs</h3>
                <div className="tag-list">
                  {websitePreview.ctas.map((cta, i) => (
                    <span key={i} className="tag">
                      {cta}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <h3 className="section-title">Text Content Preview</h3>
              <pre className="preview-text-block">{websitePreview.textContentPreview}</pre>
            </div>

            <div className="profile-meta" style={{ marginTop: 16 }}>
              <span>
                Original chars: <strong>{websitePreview.extraction.originalCharacters}</strong>
              </span>
              <span>
                Extracted chars: <strong>{websitePreview.extraction.extractedCharacters}</strong>
              </span>
              <span>
                Truncated: <strong>{websitePreview.extraction.truncated ? 'Yes' : 'No'}</strong>
              </span>
            </div>
          </div>
        )}
      </Card>

      <Card className="analysis-card">
        <div className="analysis-header">
          <div>
            <h2 className="card-title">AI Product Intelligence</h2>
            <p className="card-subtitle">Generate a structured marketing intelligence profile for this product.</p>
          </div>
          <button type="button" onClick={handleAnalyze} className="btn btn-primary" disabled={analyzing}>
            {analyzing ? 'Analyzing...' : profile ? 'Re-analyze Product' : 'Analyze Product'}
          </button>
        </div>
        <ErrorMessage message={analyzeError} />
        {analyzing && (
          <div className="analyzing-state">
            <span className="spinner" /> Analyzing product...
          </div>
        )}
      </Card>

      {!profile && !analyzing && (
        <Card className="empty-state">Not analyzed yet. Click "Analyze Product" to generate a profile.</Card>
      )}

      {profile && (
        <div className="profile-sections">
          <Card className="profile-section">
            <h3 className="section-title">Overview</h3>
            <p>{profile.summary}</p>
            <div className="tag-list" style={{ marginTop: 10 }}>
              <span className="tag">{profile.category}</span>
              <span className="tag">{profile.businessModel}</span>
            </div>
          </Card>

          <Card className="profile-section">
            <h3 className="section-title">Value Proposition</h3>
            <p>{profile.valueProposition}</p>
          </Card>

          <Card className="profile-section">
            <h3 className="section-title">Core Features</h3>
            <ul className="bullet-list">
              {profile.coreFeatures.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </Card>

          <Card className="profile-section">
            <h3 className="section-title">Problems Solved</h3>
            <ul className="bullet-list">
              {profile.problemsSolved.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </Card>

          <Card className="profile-section">
            <h3 className="section-title">Target Audiences</h3>
            {profile.targetAudiences.map((audience, i) => (
              <div key={i} className="audience-card">
                <h4>{audience.name}</h4>
                <p>{audience.description}</p>
                <p className="audience-meta">
                  <strong>Pain points:</strong> {audience.painPoints.join(', ') || '-'}
                </p>
                <p className="audience-meta">
                  <strong>Goals:</strong> {audience.goals.join(', ') || '-'}
                </p>
              </div>
            ))}
          </Card>

          <Card className="profile-section">
            <h3 className="section-title">Use Cases</h3>
            <ul className="bullet-list">
              {profile.likelyUseCases.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </Card>

          <Card className="profile-section">
            <h3 className="section-title">Differentiators</h3>
            <ul className="bullet-list">
              {profile.differentiators.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </Card>

          <Card className="profile-section">
            <h3 className="section-title">Positioning</h3>
            <p>{profile.suggestedPositioning}</p>
          </Card>

          <Card className="profile-section">
            <h3 className="section-title">Marketing Angles</h3>
            <ul className="bullet-list">
              {profile.marketingAngles.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </Card>

          <Card className="profile-section">
            <h3 className="section-title">Missing Information</h3>
            {profile.missingInformation.length > 0 ? (
              <ul className="bullet-list">
                {profile.missingInformation.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">Nothing flagged.</p>
            )}
          </Card>

          <Card className="profile-section confidence-card">
            <h3 className="section-title">Confidence Score</h3>
            <div className="confidence-row">
              <div className="confidence-track">
                <div className="confidence-fill" style={{ width: `${profile.confidenceScore}%` }} />
              </div>
              <span className="confidence-value">{profile.confidenceScore}%</span>
            </div>
          </Card>

          <div className="profile-meta">
            <span>
              Provider: <strong>{profile.aiProvider}</strong>
            </span>
            <span>
              Model: <strong>{profile.aiModel}</strong>
            </span>
            <span>
              Version: <strong>{profile.version}</strong>
            </span>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
