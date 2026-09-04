import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { Badge } from '../components/Badge';
import { Card } from '../components/Card';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import type {
  AudienceIntelligencePreview,
  CompetitiveIntelligencePreview,
  FunnelStage,
  GrowthStrategyOverview,
  KeywordIntelligencePreview,
  Product,
  ProductIntelligenceProfile,
  ProductWebsiteKnowledgePreview,
  WebsitePreview,
} from '../types';

function labelize(value: string): string {
  return value
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function relationshipLabel(value: string): string {
  return value.replace(/_/g, ' ');
}

function tierLabel(tier: string): string {
  return labelize(tier);
}

function qualityBadgeClass(quality: 'high' | 'medium' | 'low'): string {
  if (quality === 'high') return 'quality-good';
  if (quality === 'medium') return 'quality-limited';
  return 'quality-empty';
}

function scoreQuality(score: number): 'high' | 'medium' | 'low' {
  if (score >= 80) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

function ConfidenceBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="confidence-row">
      <span className="summary-label" style={{ minWidth: 140, marginBottom: 0 }}>
        {label}
      </span>
      <div className="confidence-track">
        <div className="confidence-fill" style={{ width: `${score}%` }} />
      </div>
      <span className="confidence-value">{score}</span>
      <span className={`quality-badge ${qualityBadgeClass(scoreQuality(score))}`}>{scoreQuality(score)}</span>
    </div>
  );
}

const COVERAGE_LABELS: { key: keyof ProductWebsiteKnowledgePreview['assessment']['coverage']; label: string }[] = [
  { key: 'identity', label: 'Identity' },
  { key: 'features', label: 'Features' },
  { key: 'pricing', label: 'Pricing' },
  { key: 'faq', label: 'FAQ' },
  { key: 'documentation', label: 'Documentation' },
];

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
  const [productKnowledge, setProductKnowledge] = useState<ProductWebsiteKnowledgePreview | null>(null);
  const [buildingKnowledge, setBuildingKnowledge] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null);
  const [competitiveIntelligence, setCompetitiveIntelligence] = useState<CompetitiveIntelligencePreview | null>(null);
  const [buildingCI, setBuildingCI] = useState(false);
  const [ciError, setCiError] = useState<string | null>(null);
  const [audienceIntelligence, setAudienceIntelligence] = useState<AudienceIntelligencePreview | null>(null);
  const [buildingAudienceIntelligence, setBuildingAudienceIntelligence] = useState(false);
  const [audienceIntelligenceError, setAudienceIntelligenceError] = useState<string | null>(null);
  const [keywordIntelligence, setKeywordIntelligence] = useState<KeywordIntelligencePreview | null>(null);
  const [buildingKeywordIntelligence, setBuildingKeywordIntelligence] = useState(false);
  const [keywordIntelligenceError, setKeywordIntelligenceError] = useState<string | null>(null);
  const [growthStrategy, setGrowthStrategy] = useState<GrowthStrategyOverview | null>(null);
  const [buildingGrowthStrategy, setBuildingGrowthStrategy] = useState(false);
  const [growthStrategyError, setGrowthStrategyError] = useState<string | null>(null);

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

  async function handleBuildProductKnowledge() {
    setKnowledgeError(null);
    setBuildingKnowledge(true);
    try {
      const data = await apiRequest<ProductWebsiteKnowledgePreview>(
        `/organizations/${organizationId}/products/${productId}/intelligence/product-knowledge-preview`,
        { method: 'POST' },
      );
      setProductKnowledge(data);
    } catch (err) {
      setKnowledgeError(err instanceof ApiError ? err.message : 'Building product knowledge failed');
    } finally {
      setBuildingKnowledge(false);
    }
  }

  async function handleBuildCompetitiveIntelligence() {
    setCiError(null);
    setBuildingCI(true);
    try {
      const data = await apiRequest<CompetitiveIntelligencePreview>(
        `/organizations/${organizationId}/products/${productId}/market/competitive-intelligence-preview`,
        { method: 'POST' },
      );
      setCompetitiveIntelligence(data);
    } catch (err) {
      setCiError(err instanceof ApiError ? err.message : 'Building competitive intelligence failed');
    } finally {
      setBuildingCI(false);
    }
  }

  async function handleBuildAudienceIntelligence() {
    setAudienceIntelligenceError(null);
    setBuildingAudienceIntelligence(true);
    try {
      const data = await apiRequest<AudienceIntelligencePreview>(
        `/organizations/${organizationId}/products/${productId}/audience/intelligence-preview`,
        { method: 'POST' },
      );
      setAudienceIntelligence(data);
    } catch (err) {
      setAudienceIntelligenceError(err instanceof ApiError ? err.message : 'Building audience intelligence failed');
    } finally {
      setBuildingAudienceIntelligence(false);
    }
  }

  async function handleBuildKeywordIntelligence() {
    setKeywordIntelligenceError(null);
    setBuildingKeywordIntelligence(true);
    try {
      const data = await apiRequest<KeywordIntelligencePreview>(
        `/organizations/${organizationId}/products/${productId}/keywords/intelligence-preview`,
        { method: 'POST' },
      );
      setKeywordIntelligence(data);
    } catch (err) {
      setKeywordIntelligenceError(err instanceof ApiError ? err.message : 'Building keyword intelligence failed');
    } finally {
      setBuildingKeywordIntelligence(false);
    }
  }

  async function handleBuildGrowthStrategy() {
    setGrowthStrategyError(null);
    setBuildingGrowthStrategy(true);
    try {
      const data = await apiRequest<GrowthStrategyOverview>(
        `/organizations/${organizationId}/products/${productId}/growth-strategy/overview-preview`,
        { method: 'POST' },
      );
      setGrowthStrategy(data);
    } catch (err) {
      setGrowthStrategyError(err instanceof ApiError ? err.message : 'Building growth strategy failed');
    } finally {
      setBuildingGrowthStrategy(false);
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
            <h2 className="card-title">Product Knowledge</h2>
            <p className="card-subtitle">
              Build consolidated, multi-page website knowledge with a deterministic confidence score before running
              AI analysis.
            </p>
          </div>
          {product?.websiteUrl && (
            <button
              type="button"
              onClick={handleBuildProductKnowledge}
              className="btn btn-primary"
              disabled={buildingKnowledge}
            >
              {buildingKnowledge ? 'Building product knowledge...' : 'Build Product Knowledge'}
            </button>
          )}
        </div>

        {!product?.websiteUrl && (
          <p className="muted" style={{ marginTop: 10 }}>
            Add a website URL to enable Product Knowledge.
          </p>
        )}

        <ErrorMessage message={knowledgeError} />
        {buildingKnowledge && (
          <div className="analyzing-state">
            <span className="spinner" /> Building product knowledge...
          </div>
        )}

        {productKnowledge && (
          <div style={{ marginTop: 16 }}>
            <Card className="profile-section confidence-card">
              <h3 className="section-title">Knowledge Confidence</h3>
              <div className="confidence-row">
                <div className="confidence-track">
                  <div className="confidence-fill" style={{ width: `${productKnowledge.assessment.confidenceScore}%` }} />
                </div>
                <span className="confidence-value">{productKnowledge.assessment.confidenceScore} / 100</span>
                <span className={`quality-badge ${qualityBadgeClass(productKnowledge.assessment.quality)}`}>
                  {productKnowledge.assessment.quality}
                </span>
              </div>

              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {COVERAGE_LABELS.map(({ key, label }) => (
                  <div key={key} className="confidence-row">
                    <span className="summary-label" style={{ minWidth: 100, marginBottom: 0 }}>
                      {label}
                    </span>
                    <div className="confidence-track">
                      <div className="confidence-fill" style={{ width: `${productKnowledge.assessment.coverage[key]}%` }} />
                    </div>
                    <span className="confidence-value">{productKnowledge.assessment.coverage[key]}</span>
                  </div>
                ))}
              </div>
            </Card>

            <div style={{ marginTop: 16 }}>
              <h3 className="section-title">Missing Information</h3>
              {productKnowledge.assessment.missingInformation.length > 0 ? (
                <ul className="bullet-list">
                  {productKnowledge.assessment.missingInformation.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No major knowledge gaps detected.</p>
              )}
            </div>

            {productKnowledge.assessment.warnings.length > 0 && (
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {productKnowledge.assessment.warnings.map((warning, i) => (
                  <div key={i} className="content-warning">
                    {warning}
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <h3 className="section-title">Identity</h3>
              <p>
                <strong>{productKnowledge.identity.title || 'No title found'}</strong>
              </p>
              {productKnowledge.identity.metaDescription && (
                <p className="muted">{productKnowledge.identity.metaDescription}</p>
              )}
              {productKnowledge.identity.keyStatements.length > 0 && (
                <ul className="bullet-list" style={{ marginTop: 8 }}>
                  {productKnowledge.identity.keyStatements.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              )}
            </div>

            <div style={{ marginTop: 16 }}>
              <h3 className="section-title">Features</h3>
              {productKnowledge.features.length > 0 ? (
                <ul className="bullet-list">
                  {productKnowledge.features.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No product features were detected.</p>
              )}
            </div>

            <div style={{ marginTop: 16 }}>
              <h3 className="section-title">Pricing</h3>
              {productKnowledge.pricing.signals.length > 0 ? (
                <div className="tag-list">
                  {productKnowledge.pricing.signals.map((signal, i) => (
                    <span key={i} className="tag">
                      {signal}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="muted">No pricing information was found.</p>
              )}
            </div>

            <div style={{ marginTop: 16 }}>
              <h3 className="section-title">FAQ</h3>
              {productKnowledge.faqs.length > 0 ? (
                productKnowledge.faqs.map((faq, i) => (
                  <div key={i} className="audience-card">
                    <h4>{faq.question}</h4>
                    {faq.answer && <p className="audience-meta">{faq.answer}</p>}
                  </div>
                ))
              ) : (
                <p className="muted">No FAQ knowledge found.</p>
              )}
            </div>

            <div style={{ marginTop: 16 }}>
              <h3 className="section-title">Documentation</h3>
              {productKnowledge.documentation.topics.length === 0 &&
              productKnowledge.documentation.technicalFacts.length === 0 ? (
                <p className="muted">No documentation knowledge found.</p>
              ) : (
                <>
                  {productKnowledge.documentation.topics.length > 0 && (
                    <>
                      <span className="summary-label">Topics</span>
                      <ul className="bullet-list">
                        {productKnowledge.documentation.topics.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {productKnowledge.documentation.technicalFacts.length > 0 && (
                    <>
                      <span className="summary-label" style={{ marginTop: 10 }}>
                        Technical Facts
                      </span>
                      <ul className="bullet-list">
                        {productKnowledge.documentation.technicalFacts.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}
            </div>

            {productKnowledge.callsToAction.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h3 className="section-title">Calls To Action</h3>
                <div className="tag-list">
                  {productKnowledge.callsToAction.map((cta, i) => (
                    <span key={i} className="tag">
                      {cta}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <h3 className="section-title">Sources Analyzed</h3>
              <ul className="bullet-list">
                {productKnowledge.pagesAnalyzed.map((page, i) => (
                  <li key={i}>
                    <strong>{page.category}</strong> — {page.url} ({new Date(page.fetchedAt).toLocaleString()})
                  </li>
                ))}
              </ul>
            </div>

            {productKnowledge.failures.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h3 className="section-title">Some pages could not be analyzed</h3>
                <ul className="bullet-list">
                  {productKnowledge.failures.map((failure, i) => (
                    <li key={i}>
                      <strong>{failure.category}</strong> — {failure.url}: {failure.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="profile-meta" style={{ marginTop: 16 }}>
              <span>
                Discovered: <strong>{productKnowledge.extractionStats.discoveredPages}</strong>
              </span>
              <span>
                Selected: <strong>{productKnowledge.extractionStats.selectedPages}</strong>
              </span>
              <span>
                Attempted: <strong>{productKnowledge.extractionStats.attemptedPages}</strong>
              </span>
              <span>
                Successful: <strong>{productKnowledge.extractionStats.successfulPages}</strong>
              </span>
              <span>
                Failed: <strong>{productKnowledge.extractionStats.failedPages}</strong>
              </span>
            </div>

            <div style={{ marginTop: 16 }}>
              <h3 className="section-title">Combined Knowledge Preview</h3>
              <pre className="preview-text-block">{productKnowledge.combinedTextPreview}</pre>
              <p className="muted" style={{ marginTop: 6 }}>
                Length: {productKnowledge.combinedTextLength} chars
                {productKnowledge.combinedTextTruncated ? ' (truncated)' : ''}
              </p>
            </div>
          </div>
        )}
      </Card>

      <Card className="analysis-card">
        <div className="analysis-header">
          <div>
            <h2 className="card-title">Competitive Intelligence</h2>
            <p className="card-subtitle">
              Discover market category, analyze competitor websites, and compare features and positioning.
            </p>
          </div>
          {product?.websiteUrl && (
            <button
              type="button"
              onClick={handleBuildCompetitiveIntelligence}
              className="btn btn-primary"
              disabled={buildingCI}
            >
              {buildingCI
                ? 'Building competitive intelligence...'
                : competitiveIntelligence
                  ? 'Rebuild Competitive Intelligence'
                  : 'Build Competitive Intelligence'}
            </button>
          )}
        </div>

        {!product?.websiteUrl && (
          <p className="muted" style={{ marginTop: 10 }}>
            Add a website URL to enable Competitive Intelligence.
          </p>
        )}

        <ErrorMessage message={ciError} />
        {buildingCI && (
          <div className="analyzing-state">
            <span className="spinner" /> Building competitive intelligence...
            <p className="muted" style={{ marginTop: 4 }}>
              This may analyze multiple competitor websites and can take a while.
            </p>
          </div>
        )}
        {!buildingCI && !competitiveIntelligence && !ciError && product?.websiteUrl && (
          <p className="muted" style={{ marginTop: 10 }}>
            Uses external market research when a research provider is configured.
          </p>
        )}

        {competitiveIntelligence && (
          <div style={{ marginTop: 16 }}>
            {competitiveIntelligence.warnings.length > 0 && (
              <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {competitiveIntelligence.warnings.map((warning, i) => (
                  <div key={i} className="content-warning">
                    {warning}
                  </div>
                ))}
              </div>
            )}

            {/* Market Category */}
            <Card className="profile-section confidence-card">
              <h3 className="section-title">Market Category</h3>
              <p>
                <strong>{competitiveIntelligence.marketCategory.primaryCategory || 'Not determined'}</strong>
              </p>
              <div style={{ marginTop: 10 }}>
                <ConfidenceBar label="Category Confidence" score={competitiveIntelligence.marketCategory.confidenceScore} />
              </div>
              {competitiveIntelligence.marketCategory.subcategories.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <span className="summary-label">Subcategories</span>
                  <div className="tag-list">
                    {competitiveIntelligence.marketCategory.subcategories.map((s, i) => (
                      <span key={i} className="tag">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {competitiveIntelligence.marketCategory.descriptors.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <span className="summary-label">Descriptors</span>
                  <div className="tag-list">
                    {competitiveIntelligence.marketCategory.descriptors.map((d, i) => (
                      <span key={i} className="tag">{d}</span>
                    ))}
                  </div>
                </div>
              )}
              {competitiveIntelligence.marketCategory.categoryTerms.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <span className="summary-label">Category Terms</span>
                  <div className="tag-list">
                    {competitiveIntelligence.marketCategory.categoryTerms.map((t, i) => (
                      <span key={i} className="tag">{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {/* Competitors */}
            <div style={{ marginTop: 20 }}>
              <h3 className="section-title">Competitors</h3>
              <div className="profile-meta">
                <span>Discovered: <strong>{competitiveIntelligence.stats.discoveredCompetitors}</strong></span>
                <span>Analyzed: <strong>{competitiveIntelligence.stats.analyzedCompetitors}</strong></span>
                <span>Failed: <strong>{competitiveIntelligence.stats.failedCompetitorAnalyses}</strong></span>
              </div>

              {competitiveIntelligence.competitorAnalysis.competitors.length === 0 ? (
                <p className="muted" style={{ marginTop: 10 }}>
                  No reliable competitor candidates were identified from the current market evidence.
                </p>
              ) : (
                <div className="grid-cards" style={{ marginTop: 12 }}>
                  {competitiveIntelligence.competitorAnalysis.competitors.map((c, i) => (
                    <Card key={i} className="entity-card">
                      <div className="entity-card-header">
                        <h4 style={{ margin: 0 }}>{c.name}</h4>
                        <span className={`quality-badge ${qualityBadgeClass(c.quality)}`}>{c.quality}</span>
                      </div>
                      <p className="entity-card-meta">{c.domain}</p>
                      <p className="muted" style={{ margin: 0 }}>{c.title || 'No title found'}</p>
                      <div className="profile-meta">
                        <span>Relevance: <strong>{c.relevanceScore}</strong></span>
                        <span>Confidence: <strong>{c.confidenceScore}</strong></span>
                        <span>Features: <strong>{c.features.length}</strong></span>
                        <span>Pricing signals: <strong>{c.pricingSignals.length}</strong></span>
                      </div>

                      <details style={{ marginTop: 8 }}>
                        <summary className="summary-label" style={{ cursor: 'pointer' }}>
                          Details
                        </summary>
                        <div style={{ marginTop: 8 }}>
                          {c.keyStatements.length > 0 && (
                            <>
                              <span className="summary-label">Identity Statements</span>
                              <ul className="bullet-list">
                                {c.keyStatements.slice(0, 5).map((s, j) => (
                                  <li key={j}>{s}</li>
                                ))}
                              </ul>
                            </>
                          )}
                          {c.features.length > 0 && (
                            <>
                              <span className="summary-label" style={{ marginTop: 8 }}>Top Features</span>
                              <ul className="bullet-list">
                                {c.features.slice(0, 10).map((f, j) => (
                                  <li key={j}>{f}</li>
                                ))}
                              </ul>
                            </>
                          )}
                          {c.pricingSignals.length > 0 && (
                            <>
                              <span className="summary-label" style={{ marginTop: 8 }}>Pricing Signals</span>
                              <div className="tag-list">
                                {c.pricingSignals.map((p, j) => (
                                  <span key={j} className="tag">{p}</span>
                                ))}
                              </div>
                            </>
                          )}
                          <p className="muted" style={{ marginTop: 8 }}>Source pages: {c.pagesAnalyzed.length}</p>
                          {c.missingInformation.length > 0 && (
                            <>
                              <span className="summary-label" style={{ marginTop: 8 }}>Missing Information</span>
                              <ul className="bullet-list">
                                {c.missingInformation.map((m, j) => (
                                  <li key={j}>{m}</li>
                                ))}
                              </ul>
                            </>
                          )}
                          {c.warnings.map((w, j) => (
                            <div key={j} className="content-warning" style={{ marginTop: 8 }}>{w}</div>
                          ))}
                        </div>
                      </details>
                    </Card>
                  ))}
                </div>
              )}

              {competitiveIntelligence.competitorAnalysis.failures.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="content-warning">
                    Some competitor websites could not be analyzed:
                    <ul className="bullet-list" style={{ marginTop: 6 }}>
                      {competitiveIntelligence.competitorAnalysis.failures.map((f, i) => (
                        <li key={i}><strong>{f.name}</strong> ({f.domain}): {f.reason}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {/* Feature Comparison */}
            <div style={{ marginTop: 20 }}>
              <h3 className="section-title">Feature Comparison</h3>
              <ConfidenceBar label="Comparison Confidence" score={competitiveIntelligence.featureComparison.confidenceScore} />

              {competitiveIntelligence.featureComparison.competitors.length > 0 && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {competitiveIntelligence.featureComparison.competitors.map((fc, i) => (
                    <div key={i} className="audience-card">
                      <h4>{fc.competitorName}</h4>
                      <p className="audience-meta">
                        Similarity: <strong>{fc.similarityScore}</strong> · Shared: <strong>{fc.sharedCapabilities.length}</strong> · Competitor-only: <strong>{fc.competitorOnlyCapabilities.length}</strong> · Product-only: <strong>{fc.productOnlyCapabilities.length}</strong>
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 16 }}>
                <span className="summary-label">Common Capabilities</span>
                {competitiveIntelligence.featureComparison.commonCapabilities.length > 0 ? (
                  <ul className="bullet-list">
                    {competitiveIntelligence.featureComparison.commonCapabilities.slice(0, 15).map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">None detected.</p>
                )}
              </div>

              <div style={{ marginTop: 16 }}>
                <span className="summary-label">Potential Differentiators</span>
                {competitiveIntelligence.featureComparison.productDifferentiators.length > 0 ? (
                  <ul className="bullet-list">
                    {competitiveIntelligence.featureComparison.productDifferentiators.slice(0, 15).map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">None detected.</p>
                )}
              </div>

              <div style={{ marginTop: 16 }}>
                <span className="summary-label">Possible Feature Gaps</span>
                <p className="muted" style={{ marginTop: 2 }}>
                  Not detected in current product evidence; validate before treating as a real gap.
                </p>
                {competitiveIntelligence.featureComparison.possibleFeatureGaps.length > 0 ? (
                  <ul className="bullet-list">
                    {competitiveIntelligence.featureComparison.possibleFeatureGaps.slice(0, 12).map((g, i) => (
                      <li key={i}>
                        <strong>{g.capability}</strong> — seen at {g.competitorCount} competitor(s) ({g.competitors.join(', ')}), importance {g.importanceScore}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">None detected.</p>
                )}
              </div>
            </div>

            {/* Positioning */}
            <div style={{ marginTop: 20 }}>
              <h3 className="section-title">Competitive Positioning</h3>
              <ConfidenceBar label="Positioning Confidence" score={competitiveIntelligence.positioning.confidenceScore} />

              <div style={{ marginTop: 12 }}>
                <span className="summary-label">Product Value Themes</span>
                <div className="tag-list">
                  {competitiveIntelligence.positioning.productPositioning.valueThemes.length > 0 ? (
                    competitiveIntelligence.positioning.productPositioning.valueThemes.map((t, i) => (
                      <span key={i} className="tag">{t}</span>
                    ))
                  ) : (
                    <p className="muted">None detected.</p>
                  )}
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <span className="summary-label">Product Audience Signals</span>
                <div className="tag-list">
                  {competitiveIntelligence.positioning.productPositioning.audienceSignals.map((a, i) => (
                    <span key={i} className="tag">{a}</span>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <span className="summary-label">Product Pricing Position</span>
                <div className="tag-list">
                  {competitiveIntelligence.positioning.productPositioning.pricingPosition.map((p, i) => (
                    <span key={i} className="tag">{p}</span>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <span className="summary-label">Product CTA Themes</span>
                <div className="tag-list">
                  {competitiveIntelligence.positioning.productPositioning.ctaThemes.map((c, i) => (
                    <span key={i} className="tag">{c}</span>
                  ))}
                </div>
              </div>

              {competitiveIntelligence.positioning.competitorPositioning.length > 0 && (
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span className="summary-label">Competitor Positioning</span>
                  {competitiveIntelligence.positioning.competitorPositioning.map((cp, i) => (
                    <div key={i} className="audience-card">
                      <h4>{cp.competitorName}</h4>
                      <p className="audience-meta">
                        <strong>Themes:</strong> {cp.valueThemes.join(', ') || '-'}
                      </p>
                      <p className="audience-meta">
                        <strong>Audience:</strong> {cp.audienceSignals.join(', ') || '-'}
                      </p>
                      <p className="audience-meta">
                        <strong>Pricing:</strong> {cp.pricingPosition.join(', ') || '-'} · <strong>CTAs:</strong> {cp.ctaThemes.join(', ') || '-'}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 16 }}>
                <span className="summary-label">Common Positioning Themes</span>
                <p className="muted" style={{ marginTop: 2 }}>Observations of market-standard messaging, not recommendations.</p>
                <div className="tag-list">
                  {competitiveIntelligence.positioning.commonPositioningThemes.length > 0 ? (
                    competitiveIntelligence.positioning.commonPositioningThemes.map((t, i) => (
                      <span key={i} className="tag">{t}</span>
                    ))
                  ) : (
                    <p className="muted">None detected.</p>
                  )}
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <span className="summary-label">Potential Positioning Opportunities</span>
                {competitiveIntelligence.positioning.opportunities.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                    {competitiveIntelligence.positioning.opportunities.slice(0, 10).map((o, i) => (
                      <div key={i} className="audience-card">
                        <h4>{o.theme}</h4>
                        <p className="audience-meta">{o.reason}</p>
                        <p className="audience-meta">
                          Supporting competitors: {o.supportingCompetitors.join(', ') || 'none'} · Confidence: {o.confidenceScore}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">None detected.</p>
                )}
              </div>
            </div>

            {/* Market Gaps */}
            <div style={{ marginTop: 20 }}>
              <h3 className="section-title">Market Opportunities</h3>
              <ConfidenceBar label="Market-Gap Confidence" score={competitiveIntelligence.marketGaps.confidenceScore} />

              {competitiveIntelligence.marketGaps.strongestOpportunities.length > 0 ? (
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {competitiveIntelligence.marketGaps.strongestOpportunities.map((o, i) => (
                    <Card key={i} className="entity-card">
                      <div className="entity-card-header">
                        <h4 style={{ margin: 0 }}>{o.title}</h4>
                        <span className="tag">{o.category}</span>
                      </div>
                      <p className="entity-card-meta">{o.opportunityType.replace(/_/g, ' ')}</p>
                      <p>{o.description}</p>
                      <div className="profile-meta">
                        <span>Priority: <strong>{o.priorityScore}</strong></span>
                        <span>Confidence: <strong>{o.confidenceScore}</strong></span>
                      </div>
                      <div className="content-warning" style={{ marginTop: 8 }}>{o.caution}</div>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="muted" style={{ marginTop: 10 }}>No strong opportunities identified yet.</p>
              )}

              {competitiveIntelligence.marketGaps.opportunities.length > competitiveIntelligence.marketGaps.strongestOpportunities.length && (
                <details style={{ marginTop: 12 }}>
                  <summary className="summary-label" style={{ cursor: 'pointer' }}>
                    Show all opportunities ({competitiveIntelligence.marketGaps.opportunities.length})
                  </summary>
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {competitiveIntelligence.marketGaps.opportunities.map((o, i) => (
                      <div key={i} className="audience-card">
                        <h4>{o.title}</h4>
                        <p className="audience-meta">{o.description}</p>
                        <p className="audience-meta">Priority: {o.priorityScore} · Confidence: {o.confidenceScore}</p>
                        <div className="content-warning" style={{ marginTop: 6 }}>{o.caution}</div>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              <div style={{ marginTop: 16 }}>
                <span className="summary-label">Common Market Patterns</span>
                <p className="muted" style={{ marginTop: 2 }}>Observations, not recommended actions.</p>
                {competitiveIntelligence.marketGaps.commonMarketPatterns.length > 0 ? (
                  <ul className="bullet-list">
                    {competitiveIntelligence.marketGaps.commonMarketPatterns.map((p, i) => (
                      <li key={i}>
                        {p.competitorCount}/{p.totalCompetitors} competitors — <strong>{p.label}</strong> ({p.prevalencePercent}%): {p.interpretation}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">None detected.</p>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="profile-meta" style={{ marginTop: 20 }}>
              <span>Discovered: <strong>{competitiveIntelligence.stats.discoveredCompetitors}</strong></span>
              <span>Analyzed: <strong>{competitiveIntelligence.stats.analyzedCompetitors}</strong></span>
              <span>Failed: <strong>{competitiveIntelligence.stats.failedCompetitorAnalyses}</strong></span>
              <span>Product features compared: <strong>{competitiveIntelligence.stats.productFeatureCount}</strong></span>
              <span>Total opportunities: <strong>{competitiveIntelligence.stats.totalOpportunities}</strong></span>
              <span>Generated: <strong>{new Date(competitiveIntelligence.generatedAt).toLocaleString()}</strong></span>
            </div>
          </div>
        )}
      </Card>

      <Card className="analysis-card">
        <div className="analysis-header">
          <div>
            <h2 className="card-title">Audience Intelligence</h2>
            <p className="card-subtitle">
              Discover audience signals, segments, ICPs, buyer/user roles, pain-point hypotheses, jobs-to-be-done, and
              evidence-based prioritization.
            </p>
          </div>
          <button
            type="button"
            onClick={handleBuildAudienceIntelligence}
            className="btn btn-primary"
            disabled={buildingAudienceIntelligence}
          >
            {buildingAudienceIntelligence
              ? 'Building audience intelligence...'
              : audienceIntelligence
                ? 'Rebuild Audience Intelligence'
                : 'Build Audience Intelligence'}
          </button>
        </div>

        <ErrorMessage message={audienceIntelligenceError} />
        {buildingAudienceIntelligence && (
          <div className="analyzing-state">
            <span className="spinner" /> Building audience intelligence...
            <p className="muted" style={{ marginTop: 4 }}>
              Analyzing audience evidence, segments, ICPs, buyer/user roles, pain points and jobs-to-be-done.
            </p>
          </div>
        )}

        {audienceIntelligence && (() => {
          const ai = audienceIntelligence;
          const segmentName = (id?: string) => ai.segments.segments.find((s) => s.id === id)?.name;
          const primaryAudienceName = segmentName(ai.prioritization.primarySegmentId) ?? segmentName(ai.segments.primarySegmentId);
          const primaryIcp = ai.icp.candidates.find((c) => c.id === ai.icp.primaryIcpId);
          const primaryUserEntity = ai.buyerUserMap.entities.find((e) => e.segmentId === ai.buyerUserMap.primaryUserSegmentId);
          const primaryBuyerEntity = ai.buyerUserMap.entities.find((e) => e.segmentId === ai.buyerUserMap.primaryBuyerSegmentId);

          const strongestPains = ai.painPoints.strongestPainPointIds
            .map((id) => ai.painPoints.painPoints.find((p) => p.id === id))
            .filter((p): p is (typeof ai.painPoints.painPoints)[number] => !!p);
          const remainingPains = ai.painPoints.painPoints.filter((p) => !ai.painPoints.strongestPainPointIds.includes(p.id));

          const strongestJobs = ai.jtbd.strongestJobIds
            .map((id) => ai.jtbd.jobs.find((j) => j.id === id))
            .filter((j): j is (typeof ai.jtbd.jobs)[number] => !!j);
          const remainingJobs = ai.jtbd.jobs.filter((j) => !ai.jtbd.strongestJobIds.includes(j.id));

          const evidenceGaps = Array.from(
            new Set([
              ...ai.signals.missingSignals,
              ...ai.icp.missingEvidence,
              ...ai.buyerUserMap.missingEvidence,
              ...ai.painPoints.missingEvidence,
              ...ai.jtbd.missingEvidence,
              ...ai.prioritization.missingEvidence,
            ]),
          );

          const tierBadgeClass = (tier: string) => {
            if (tier === 'primary') return 'quality-good';
            if (tier === 'secondary') return 'quality-limited';
            return 'quality-empty';
          };

          return (
            <div style={{ marginTop: 16 }}>
              {/* Overview */}
              <Card className="profile-section confidence-card">
                <h3 className="section-title">Overview</h3>
                <ConfidenceBar label="Audience Confidence" score={ai.prioritization.confidenceScore} />
                <div className="summary-grid" style={{ marginTop: 14 }}>
                  <div>
                    <span className="summary-label">Primary Audience</span>
                    <p>{primaryAudienceName ?? 'Not determined'}</p>
                  </div>
                  <div>
                    <span className="summary-label">Primary ICP</span>
                    <p>{primaryIcp?.name ?? 'Not determined'}</p>
                  </div>
                  <div>
                    <span className="summary-label">Primary User</span>
                    <p>{primaryUserEntity?.segmentName ?? 'Not determined'}</p>
                  </div>
                  <div>
                    <span className="summary-label">Primary Buyer</span>
                    <p>{primaryBuyerEntity?.segmentName ?? 'Not determined'}</p>
                  </div>
                  <div>
                    <span className="summary-label">Total Segments</span>
                    <p>{ai.stats.segmentCount}</p>
                  </div>
                </div>
              </Card>

              {/* Audience Signals */}
              <div style={{ marginTop: 20 }}>
                <h3 className="section-title">Audience Signals</h3>
                <ConfidenceBar label="Signal Confidence" score={ai.signals.confidenceScore} />
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {([
                    ['Roles', ai.signals.roles],
                    ['User Types', ai.signals.userTypes],
                    ['Company Types', ai.signals.companyTypes],
                    ['Company Sizes', ai.signals.companySizes],
                    ['Industries', ai.signals.industries],
                    ['Use Cases', ai.signals.useCases],
                    ['Lifecycle Stages', ai.signals.lifecycleStages],
                    ['Buyer Signals', ai.signals.buyerSignals],
                    ['Business Model', ai.signals.businessModelSignals],
                  ] as [string, string[]][]).map(([label, values]) => (
                    <div key={label}>
                      <span className="summary-label">{label}</span>
                      {values.length > 0 ? (
                        <div className="tag-list">
                          {values.slice(0, 12).map((v, i) => (
                            <span key={i} className="tag">{v}</span>
                          ))}
                        </div>
                      ) : (
                        <p className="muted">None detected.</p>
                      )}
                    </div>
                  ))}
                </div>

                {ai.signals.missingSignals.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <span className="summary-label">Missing Signals</span>
                    <ul className="bullet-list">
                      {ai.signals.missingSignals.map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                  </div>
                )}
                {ai.signals.warnings.map((w, i) => (
                  <div key={i} className="content-warning" style={{ marginTop: 8 }}>{w}</div>
                ))}

                <details style={{ marginTop: 10 }}>
                  <summary className="summary-label" style={{ cursor: 'pointer' }}>
                    Show detailed signals ({ai.signals.signals.length})
                  </summary>
                  <ul className="bullet-list" style={{ marginTop: 8 }}>
                    {ai.signals.signals.map((s, i) => (
                      <li key={i}><strong>{s.label}</strong> ({labelize(s.category)}) — confidence {s.confidenceScore}</li>
                    ))}
                  </ul>
                </details>
              </div>

              {/* Audience Segments */}
              <div style={{ marginTop: 20 }}>
                <h3 className="section-title">Audience Segments</h3>
                {ai.segments.segments.length === 0 ? (
                  <p className="muted" style={{ marginTop: 8 }}>No coherent audience segments were detected from current evidence.</p>
                ) : (
                  <div className="grid-cards" style={{ marginTop: 10 }}>
                    {ai.segments.segments.map((seg) => (
                      <Card key={seg.id} className="entity-card">
                        <div className="entity-card-header">
                          <h4 style={{ margin: 0 }}>{seg.name}</h4>
                          {seg.id === ai.segments.primarySegmentId && <span className="tag">Primary</span>}
                        </div>
                        <p className="entity-card-meta">{labelize(seg.segmentType)} · Confidence {seg.confidenceScore}</p>
                        {seg.roles.length > 0 && (
                          <div className="tag-list">{seg.roles.map((r, i) => <span key={i} className="tag">{r}</span>)}</div>
                        )}
                        {seg.useCases.length > 0 && (
                          <p className="muted" style={{ margin: '6px 0 0' }}>{seg.useCases.join(', ')}</p>
                        )}
                        <div className="profile-meta">
                          {seg.industries[0] && <span>Industry: <strong>{seg.industries[0]}</strong></span>}
                          {seg.businessModelSignals[0] && <span>Model: <strong>{seg.businessModelSignals[0]}</strong></span>}
                          {seg.buyerSignals.length > 0 && <span>Buyer signals: <strong>{seg.buyerSignals.length}</strong></span>}
                        </div>
                        <details style={{ marginTop: 8 }}>
                          <summary className="summary-label" style={{ cursor: 'pointer' }}>Details</summary>
                          <div style={{ marginTop: 6 }}>
                            {seg.evidence.length > 0 && (
                              <ul className="bullet-list">{seg.evidence.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}</ul>
                            )}
                            {seg.warnings.map((w, i) => <div key={i} className="content-warning" style={{ marginTop: 6 }}>{w}</div>)}
                          </div>
                        </details>
                      </Card>
                    ))}
                  </div>
                )}
                {ai.segments.ungroupedSignals.length > 0 && (
                  <details style={{ marginTop: 10 }}>
                    <summary className="summary-label" style={{ cursor: 'pointer' }}>
                      Ungrouped signals ({ai.segments.ungroupedSignals.length})
                    </summary>
                    <div className="tag-list" style={{ marginTop: 6 }}>
                      {ai.segments.ungroupedSignals.map((s, i) => <span key={i} className="tag">{s}</span>)}
                    </div>
                  </details>
                )}
              </div>

              {/* ICP */}
              <div style={{ marginTop: 20 }}>
                <h3 className="section-title">Ideal Customer Profile Candidates</h3>
                <p className="muted">ICP candidates are evidence-based product-fit hypotheses and are not validated revenue/customer data.</p>
                {ai.icp.candidates.length === 0 ? (
                  <p className="muted" style={{ marginTop: 8 }}>No ICP candidates met the evidence threshold.</p>
                ) : (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {ai.icp.candidates.slice(0, 5).map((c) => (
                      <div key={c.id} className="audience-card">
                        <div className="entity-card-header">
                          <h4 style={{ margin: 0 }}>{c.name}</h4>
                          {c.id === ai.icp.primaryIcpId && <span className="tag">Primary ICP</span>}
                        </div>
                        <p className="audience-meta">
                          Fit: <strong>{c.fitScore}</strong> ({c.fitLevel}) · Confidence: <strong>{c.confidenceScore}</strong> · Segment: {c.segmentName}
                        </p>
                        {c.useCases.length > 0 && <p className="audience-meta">Use cases: {c.useCases.join(', ')}</p>}
                        {(c.companyTypes.length > 0 || c.companySizes.length > 0) && (
                          <p className="audience-meta">Company context: {[...c.companyTypes, ...c.companySizes].join(', ')}</p>
                        )}
                        {c.buyerSignals.length > 0 && <p className="audience-meta">Buyer signals: {c.buyerSignals.join(', ')}</p>}
                        {c.reasons.length > 0 && (
                          <ul className="bullet-list" style={{ marginTop: 6 }}>{c.reasons.slice(0, 4).map((r, i) => <li key={i}>{r}</li>)}</ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Buyer vs User */}
              <div style={{ marginTop: 20 }}>
                <h3 className="section-title">Buyer vs User Mapping</h3>
                {ai.buyerUserMap.entities.length === 0 ? (
                  <p className="muted" style={{ marginTop: 8 }}>No buyer/user roles could be determined from current evidence.</p>
                ) : (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {ai.buyerUserMap.entities.map((e, i) => (
                      <div key={i} className="audience-card">
                        <div className="entity-card-header">
                          <h4 style={{ margin: 0 }}>{e.segmentName}</h4>
                          <div className="tag-list">
                            {e.segmentId === ai.buyerUserMap.primaryUserSegmentId && <span className="tag">Primary User</span>}
                            {e.segmentId === ai.buyerUserMap.primaryBuyerSegmentId && <span className="tag">Primary Buyer</span>}
                          </div>
                        </div>
                        <div className="tag-list">
                          {e.commercialRoles.map((r, j) => <span key={j} className="tag">{labelize(r)}</span>)}
                        </div>
                        <p className="audience-meta">Confidence: {e.confidenceScore}</p>
                        {e.reasons.length > 0 && (
                          <ul className="bullet-list" style={{ marginTop: 6 }}>{e.reasons.slice(0, 3).map((r, j) => <li key={j}>{r}</li>)}</ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 12 }}>
                  <span className="summary-label">Relationships</span>
                  {ai.buyerUserMap.relationships.length > 0 ? (
                    <ul className="bullet-list">
                      {ai.buyerUserMap.relationships.slice(0, 15).map((r, i) => (
                        <li key={i}>
                          <strong>{segmentName(r.fromSegmentId) ?? r.fromSegmentId}</strong> → {relationshipLabel(r.relationship)} → <strong>{segmentName(r.toSegmentId) ?? r.toSegmentId}</strong>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">No clear cross-segment buyer/user relationship was detected.</p>
                  )}
                </div>
              </div>

              {/* Pain Points */}
              <div style={{ marginTop: 20 }}>
                <h3 className="section-title">Possible Audience Pain Points</h3>
                <p className="muted">
                  These are hypotheses inferred from product and audience evidence and should be validated with customer research.
                </p>
                {ai.painPoints.painPoints.length === 0 ? (
                  <p className="muted" style={{ marginTop: 8 }}>No pain-point hypotheses were generated from current evidence.</p>
                ) : (
                  <>
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {(strongestPains.length > 0 ? strongestPains : ai.painPoints.painPoints.slice(0, 8)).map((p) => (
                        <div key={p.id} className="audience-card">
                          <h4>{p.title}</h4>
                          <p className="audience-meta">{p.segmentName} · {labelize(p.category)} · Severity {p.severityScore} · Confidence {p.confidenceScore}</p>
                          <p>{p.description}</p>
                          <div className="content-warning" style={{ marginTop: 6 }}>{p.caution}</div>
                        </div>
                      ))}
                    </div>
                    {remainingPains.length > 0 && (
                      <details style={{ marginTop: 10 }}>
                        <summary className="summary-label" style={{ cursor: 'pointer' }}>
                          Show {remainingPains.length} more pain point(s)
                        </summary>
                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {remainingPains.map((p) => (
                            <div key={p.id} className="audience-card">
                              <h4>{p.title}</h4>
                              <p className="audience-meta">{p.segmentName} · {labelize(p.category)} · Severity {p.severityScore}</p>
                              <p className="muted">{p.description}</p>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </>
                )}
              </div>

              {/* JTBD */}
              <div style={{ marginTop: 20 }}>
                <h3 className="section-title">Jobs-to-be-Done</h3>
                <p className="muted">Jobs-to-be-Done are inferred hypotheses, not direct customer statements.</p>
                {ai.jtbd.jobs.length === 0 ? (
                  <p className="muted" style={{ marginTop: 8 }}>No Jobs-to-be-Done were generated from current evidence.</p>
                ) : (
                  <>
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {(strongestJobs.length > 0 ? strongestJobs : ai.jtbd.jobs.slice(0, 8)).map((j) => (
                        <div key={j.id} className="audience-card">
                          <h4>{j.segmentName}{ai.jtbd.primaryJobIdBySegment[j.segmentId] === j.id ? ' — Primary Job' : ''}</h4>
                          <p>"{j.statement}"</p>
                          <p className="audience-meta">
                            {labelize(j.type)} · Priority {j.priorityScore} · Confidence {j.confidenceScore}
                            {j.relatedUseCases.length > 0 ? ` · ${j.relatedUseCases.join(', ')}` : ''}
                          </p>
                          <details>
                            <summary className="summary-label" style={{ cursor: 'pointer' }}>Details</summary>
                            <p className="audience-meta" style={{ marginTop: 6 }}>
                              Situation: {j.situation} · Motivation: {j.motivation} · Desired outcome: {j.desiredOutcome}
                            </p>
                          </details>
                        </div>
                      ))}
                    </div>
                    {remainingJobs.length > 0 && (
                      <details style={{ marginTop: 10 }}>
                        <summary className="summary-label" style={{ cursor: 'pointer' }}>
                          Show {remainingJobs.length} more job(s)
                        </summary>
                        <ul className="bullet-list" style={{ marginTop: 8 }}>
                          {remainingJobs.map((j) => <li key={j.id}>{j.segmentName}: "{j.statement}"</li>)}
                        </ul>
                      </details>
                    )}
                  </>
                )}
              </div>

              {/* Prioritization */}
              <div style={{ marginTop: 20 }}>
                <h3 className="section-title">Audience Prioritization</h3>
                <ConfidenceBar label="Overall Confidence" score={ai.prioritization.confidenceScore} />
                <div className="content-warning" style={{ marginTop: 10 }}>
                  Audience priority is an evidence-based marketing heuristic, not a prediction of revenue, market size, CAC or LTV.
                </div>

                {ai.prioritization.rationale.length > 0 && (
                  <ul className="bullet-list" style={{ marginTop: 10 }}>
                    {ai.prioritization.rationale.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                )}

                {ai.prioritization.priorities.length === 0 ? (
                  <p className="muted" style={{ marginTop: 8 }}>No segments were available to prioritize.</p>
                ) : (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {ai.prioritization.priorities.slice(0, 8).map((p, i) => (
                      <Card key={p.segmentId} className="entity-card">
                        <div className="entity-card-header">
                          <h4 style={{ margin: 0 }}>#{i + 1} {p.segmentName}</h4>
                          <span className={`quality-badge ${tierBadgeClass(p.tier)}`}>{tierLabel(p.tier)}</span>
                        </div>
                        <div className="profile-meta">
                          <span>Priority: <strong>{p.priorityScore}</strong></span>
                          <span>Confidence: <strong>{p.confidenceScore}</strong></span>
                          {p.icpFitScore !== undefined && <span>ICP Fit: <strong>{p.icpFitScore}</strong></span>}
                        </div>
                        {p.useCases.length > 0 && <p className="muted" style={{ margin: '6px 0 0' }}>{p.useCases.join(', ')}</p>}
                        {p.reasons.length > 0 && <p style={{ marginTop: 6 }}>{p.reasons.join(' ')}</p>}
                        {p.strengths.length > 0 && (
                          <>
                            <span className="summary-label" style={{ marginTop: 8 }}>Strengths</span>
                            <ul className="bullet-list">{p.strengths.map((s, j) => <li key={j}>{s}</li>)}</ul>
                          </>
                        )}
                        {p.weaknesses.length > 0 && (
                          <>
                            <span className="summary-label" style={{ marginTop: 8 }}>Weaknesses</span>
                            <ul className="bullet-list">{p.weaknesses.map((w, j) => <li key={j}>{w}</li>)}</ul>
                          </>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* Evidence Gaps */}
              {evidenceGaps.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <h3 className="section-title">Evidence Gaps</h3>
                  <ul className="bullet-list">
                    {evidenceGaps.map((g, i) => <li key={i}>{g}</li>)}
                  </ul>
                </div>
              )}

              {/* Important Notes */}
              {ai.warnings.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <h3 className="section-title">Important Notes</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {ai.warnings.map((w, i) => <div key={i} className="content-warning">{w}</div>)}
                  </div>
                </div>
              )}

              {/* Stats */}
              <div className="profile-meta" style={{ marginTop: 20 }}>
                <span>Signals: <strong>{ai.stats.signalCount}</strong></span>
                <span>Segments: <strong>{ai.stats.segmentCount}</strong></span>
                <span>ICP candidates: <strong>{ai.stats.icpCandidateCount}</strong></span>
                <span>Relationships: <strong>{ai.stats.relationshipCount}</strong></span>
                <span>Pain points: <strong>{ai.stats.painPointCount}</strong></span>
                <span>Jobs: <strong>{ai.stats.jobCount}</strong></span>
                <span>Generated: <strong>{new Date(ai.generatedAt).toLocaleString()}</strong></span>
              </div>
            </div>
          );
        })()}
      </Card>

      <Card className="analysis-card">
        <div className="analysis-header">
          <div>
            <h2 className="card-title">Keyword Intelligence</h2>
            <p className="card-subtitle">
              Discover keyword signals, search intent, clusters, opportunity scores, competitor keyword gaps,
              long-tail expansions, and keyword-to-audience mapping.
            </p>
          </div>
          <button
            type="button"
            onClick={handleBuildKeywordIntelligence}
            className="btn btn-primary"
            disabled={buildingKeywordIntelligence}
          >
            {buildingKeywordIntelligence
              ? 'Building keyword intelligence...'
              : keywordIntelligence
                ? 'Rebuild Keyword Intelligence'
                : 'Build Keyword Intelligence'}
          </button>
        </div>

        <ErrorMessage message={keywordIntelligenceError} />
        {buildingKeywordIntelligence && (
          <div className="analyzing-state">
            <span className="spinner" /> Building keyword intelligence...
            <p className="muted" style={{ marginTop: 4 }}>
              Extracting keyword signals, classifying intent, clustering, scoring opportunities, and mapping to audiences.
            </p>
          </div>
        )}

        {keywordIntelligence && (() => {
          const ki = keywordIntelligence;
          const opportunityTierClass = (tier: string) => {
            if (tier === 'high') return 'quality-good';
            if (tier === 'medium') return 'quality-limited';
            return 'quality-empty';
          };

          const topSignals = ki.signals.keywords.slice(0, 15);
          const remainingSignals = ki.signals.keywords.slice(15);

          const intentOrder: string[] = ['informational', 'commercial', 'transactional', 'comparison', 'problem', 'solution', 'audience_specific', 'navigational'];

          const topOpportunities = ki.opportunities.opportunities.slice(0, 10);

          const gaps = ki.competitorGaps?.gaps ?? [];
          const topGaps = gaps.slice(0, 10);

          const topLongTail = ki.longTail.keywords.slice(0, 15);
          const remainingLongTail = ki.longTail.keywords.slice(15);

          const primaryAudienceEntries = Object.entries(ki.audienceMap.primaryAudienceByKeyword).slice(0, 15);
          const hasAnyAudienceMapping = Object.keys(ki.audienceMap.primaryAudienceByKeyword).length > 0;

          return (
            <div style={{ marginTop: 16 }}>
              {/* Overview */}
              <Card className="profile-section confidence-card">
                <h3 className="section-title">Overview</h3>
                <ConfidenceBar label="Keyword Confidence" score={ki.signals.confidenceScore} />
                <div className="summary-grid" style={{ marginTop: 14 }}>
                  <div>
                    <span className="summary-label">Total Keywords</span>
                    <p>{ki.stats.keywordCount || 'Not determined'}</p>
                  </div>
                  <div>
                    <span className="summary-label">Clusters</span>
                    <p>{ki.stats.clusterCount}</p>
                  </div>
                  <div>
                    <span className="summary-label">High Opportunities</span>
                    <p>{ki.stats.highOpportunityCount}</p>
                  </div>
                  <div>
                    <span className="summary-label">Long-tail Keywords</span>
                    <p>{ki.stats.longTailCount}</p>
                  </div>
                  <div>
                    <span className="summary-label">Mapped Keywords</span>
                    <p>{ki.stats.mappedKeywordCount}</p>
                  </div>
                </div>
              </Card>

              {/* Keyword Signals */}
              <div style={{ marginTop: 20 }}>
                <h3 className="section-title">Keyword Signals</h3>
                {topSignals.length === 0 ? (
                  <p className="muted" style={{ marginTop: 8 }}>No meaningful keyword candidates were extracted from current evidence.</p>
                ) : (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {topSignals.map((k, i) => (
                      <div key={i} className="audience-card">
                        <div className="entity-card-header">
                          <h4 style={{ margin: 0 }}>{k.keyword}</h4>
                          <span>Confidence {k.confidenceScore}</span>
                        </div>
                        <p className="audience-meta">Source(s): {k.sources.map((s) => labelize(s)).join(', ') || 'None'}</p>
                        <div className="tag-list">
                          {k.intent.map((intent, j) => <span key={j} className="tag">{labelize(intent)}</span>)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {remainingSignals.length > 0 && (
                  <details style={{ marginTop: 10 }}>
                    <summary className="summary-label" style={{ cursor: 'pointer' }}>
                      Show {remainingSignals.length} more keyword(s)
                    </summary>
                    <ul className="bullet-list" style={{ marginTop: 8 }}>
                      {remainingSignals.map((k, i) => <li key={i}>{k.keyword} — confidence {k.confidenceScore}</li>)}
                    </ul>
                  </details>
                )}
              </div>

              {/* Search Intent */}
              <div style={{ marginTop: 20 }}>
                <h3 className="section-title">Search Intent</h3>
                <div className="tag-list">
                  {intentOrder.map((intent) => (
                    <span key={intent} className="tag">
                      {labelize(intent)}: {ki.intents.byPrimaryIntent[intent]?.length ?? 0}
                    </span>
                  ))}
                </div>
                <div className="profile-meta" style={{ marginTop: 10 }}>
                  <span>Awareness: <strong>{ki.intents.awarenessKeywords.length}</strong></span>
                  <span>Consideration: <strong>{ki.intents.considerationKeywords.length}</strong></span>
                  <span>Decision: <strong>{ki.intents.decisionKeywords.length}</strong></span>
                </div>
              </div>

              {/* Clusters */}
              <div style={{ marginTop: 20 }}>
                <h3 className="section-title">Keyword Clusters</h3>
                {ki.clusters.clusters.length === 0 ? (
                  <p className="muted" style={{ marginTop: 8 }}>No coherent keyword clusters were formed from current evidence.</p>
                ) : (
                  <div className="grid-cards" style={{ marginTop: 10 }}>
                    {ki.clusters.clusters.slice(0, 8).map((c) => (
                      <Card key={c.id} className="entity-card">
                        <div className="entity-card-header">
                          <h4 style={{ margin: 0 }}>{c.name}</h4>
                          <span className="tag">{labelize(c.type)}</span>
                        </div>
                        <p className="entity-card-meta">Primary: {c.primaryKeyword}</p>
                        <div className="tag-list">
                          {c.keywords.slice(0, 6).map((kw, i) => <span key={i} className="tag">{kw}</span>)}
                        </div>
                        <div className="profile-meta" style={{ marginTop: 6 }}>
                          <span>Coherence: <strong>{c.coherenceScore}</strong></span>
                          <span>Confidence: <strong>{c.confidenceScore}</strong></span>
                        </div>
                        {c.intents.length > 0 && (
                          <p className="muted" style={{ margin: '6px 0 0' }}>{c.intents.map((i) => labelize(i)).join(', ')}</p>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
                {ki.clusters.clusters.length > 8 && (
                  <details style={{ marginTop: 10 }}>
                    <summary className="summary-label" style={{ cursor: 'pointer' }}>
                      Show {ki.clusters.clusters.length - 8} more cluster(s)
                    </summary>
                    <ul className="bullet-list" style={{ marginTop: 8 }}>
                      {ki.clusters.clusters.slice(8).map((c) => <li key={c.id}>{c.name} ({labelize(c.type)}) — {c.keywords.length} keyword(s)</li>)}
                    </ul>
                  </details>
                )}
              </div>

              {/* Opportunities */}
              <div style={{ marginTop: 20 }}>
                <h3 className="section-title">Keyword Opportunities</h3>
                <div className="content-warning">
                  Opportunity scores are evidence-based heuristics and do not include search volume, CPC, SEO difficulty or ranking potential.
                </div>
                {topOpportunities.length === 0 ? (
                  <p className="muted" style={{ marginTop: 8 }}>No ranked keyword opportunities were available.</p>
                ) : (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {topOpportunities.map((o, i) => (
                      <Card key={i} className="entity-card">
                        <div className="entity-card-header">
                          <h4 style={{ margin: 0 }}>{o.keyword}</h4>
                          <span className={`quality-badge ${opportunityTierClass(o.tier)}`}>{labelize(o.tier)}</span>
                        </div>
                        <div className="profile-meta">
                          <span>Opportunity: <strong>{o.opportunityScore}</strong></span>
                          <span>Confidence: <strong>{o.confidenceScore}</strong></span>
                          <span>Intent: <strong>{labelize(o.primaryIntent)}</strong></span>
                          <span>Funnel: <strong>{labelize(o.funnelStage)}</strong></span>
                        </div>
                        {o.strengths.length > 0 && <p style={{ marginTop: 6 }}>{o.strengths.join(' ')}</p>}
                        {o.reasons.length > 0 && (
                          <ul className="bullet-list" style={{ marginTop: 6 }}>{o.reasons.map((r, j) => <li key={j}>{r}</li>)}</ul>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* Competitor Gaps */}
              <div style={{ marginTop: 20 }}>
                <h3 className="section-title">Competitor Keyword Gaps</h3>
                {!ki.competitorGaps ? (
                  <p className="muted" style={{ marginTop: 8 }}>
                    Competitor keyword-gap analysis is unavailable because external competitor research is not configured.
                  </p>
                ) : (
                  <>
                    <div className="content-warning">
                      Competitor gaps are inferred from public competitor messaging, not verified search rankings or traffic.
                    </div>
                    {topGaps.length === 0 ? (
                      <p className="muted" style={{ marginTop: 8 }}>No competitor keyword gaps were identified.</p>
                    ) : (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {topGaps.map((g, i) => (
                          <div key={i} className="audience-card">
                            <div className="entity-card-header">
                              <h4 style={{ margin: 0 }}>{g.keyword}</h4>
                              <span className="tag">{labelize(g.gapType)}</span>
                            </div>
                            <p className="audience-meta">
                              Competitors: {g.competitorCount} · Opportunity: {g.opportunityScore} · Confidence: {g.confidenceScore}
                            </p>
                            {g.reasons.length > 0 && (
                              <ul className="bullet-list" style={{ marginTop: 6 }}>{g.reasons.map((r, j) => <li key={j}>{r}</li>)}</ul>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Long-tail */}
              <div style={{ marginTop: 20 }}>
                <h3 className="section-title">Long-tail Keyword Candidates</h3>
                <div className="content-warning">
                  Long-tail keywords are deterministic candidate expansions and do not include verified search-demand data.
                </div>
                {topLongTail.length === 0 ? (
                  <p className="muted" style={{ marginTop: 8 }}>No long-tail keyword candidates were generated.</p>
                ) : (
                  <>
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {topLongTail.map((k, i) => (
                        <div key={i} className="audience-card">
                          <h4>{k.keyword}</h4>
                          <p className="audience-meta">
                            Base: {k.baseKeyword} · {labelize(k.expansionType)} · {labelize(k.primaryIntent)} · Opportunity {k.opportunityScore} · Confidence {k.confidenceScore}
                          </p>
                        </div>
                      ))}
                    </div>
                    {remainingLongTail.length > 0 && (
                      <details style={{ marginTop: 10 }}>
                        <summary className="summary-label" style={{ cursor: 'pointer' }}>
                          Show {remainingLongTail.length} more long-tail keyword(s)
                        </summary>
                        <ul className="bullet-list" style={{ marginTop: 8 }}>
                          {remainingLongTail.map((k, i) => <li key={i}>{k.keyword}</li>)}
                        </ul>
                      </details>
                    )}
                  </>
                )}
              </div>

              {/* Audience Mapping */}
              <div style={{ marginTop: 20 }}>
                <h3 className="section-title">Keyword-to-Audience Mapping</h3>
                {!hasAnyAudienceMapping ? (
                  <p className="muted" style={{ marginTop: 8 }}>No reliable audience mappings were detected from current product evidence.</p>
                ) : (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {primaryAudienceEntries.map(([keyword, segmentName], i) => {
                      const match = ki.audienceMap.matches.find((m) => m.keyword === keyword && m.segmentName === segmentName);
                      return (
                        <div key={i} className="audience-card">
                          <p style={{ margin: 0 }}><strong>{keyword}</strong> → {segmentName}</p>
                          {match && (
                            <p className="audience-meta">
                              Relevance: {match.relevanceScore} · Confidence: {match.confidenceScore} · Intent: {labelize(match.primaryIntent)}
                              {match.relatedUseCases.length > 0 ? ` · ${match.relatedUseCases.join(', ')}` : ''}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {ki.audienceMap.unmappedKeywords.length > 0 && (
                  <details style={{ marginTop: 10 }}>
                    <summary className="summary-label" style={{ cursor: 'pointer' }}>
                      Unmapped keywords ({ki.audienceMap.unmappedKeywords.length})
                    </summary>
                    <div className="tag-list" style={{ marginTop: 6 }}>
                      {ki.audienceMap.unmappedKeywords.map((k, i) => <span key={i} className="tag">{k}</span>)}
                    </div>
                  </details>
                )}
              </div>

              {/* Important Notes */}
              {ki.warnings.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <h3 className="section-title">Important Notes</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {ki.warnings.map((w, i) => <div key={i} className="content-warning">{w}</div>)}
                  </div>
                </div>
              )}

              {/* Stats */}
              <div className="profile-meta" style={{ marginTop: 20 }}>
                <span>Keywords: <strong>{ki.stats.keywordCount}</strong></span>
                <span>Clusters: <strong>{ki.stats.clusterCount}</strong></span>
                <span>High opportunities: <strong>{ki.stats.highOpportunityCount}</strong></span>
                <span>Competitor gaps: <strong>{ki.stats.gapCount}</strong></span>
                <span>Long-tail: <strong>{ki.stats.longTailCount}</strong></span>
                <span>Mapped: <strong>{ki.stats.mappedKeywordCount}</strong></span>
                <span>Generated: <strong>{new Date(ki.generatedAt).toLocaleString()}</strong></span>
              </div>
            </div>
          );
        })()}
      </Card>

      <Card className="analysis-card">
        <div className="analysis-header">
          <div>
            <h2 className="card-title">Growth Strategy</h2>
            <p className="card-subtitle">
              Synthesize strategy signals, growth objectives, recommended channels, and funnel strategy from existing
              product, market, audience, and keyword evidence.
            </p>
          </div>
          <button
            type="button"
            onClick={handleBuildGrowthStrategy}
            className="btn btn-primary"
            disabled={buildingGrowthStrategy}
          >
            {buildingGrowthStrategy
              ? 'Building growth strategy...'
              : growthStrategy
                ? 'Rebuild Growth Strategy'
                : 'Build Growth Strategy'}
          </button>
        </div>

        <ErrorMessage message={growthStrategyError} />
        {buildingGrowthStrategy && (
          <div className="analyzing-state">
            <span className="spinner" /> Building growth strategy...
            <p className="muted" style={{ marginTop: 4 }}>
              Synthesizing strategy signals, objectives, channel fit, and funnel strategy.
            </p>
          </div>
        )}

        {growthStrategy && (() => {
          const gs = growthStrategy;
          const objectiveById = new Map(gs.objectives.objectives.map((o) => [o.id, o]));
          const overallConfidence = Math.round(
            (gs.signals.confidenceScore + gs.objectives.confidenceScore + gs.channels.confidenceScore + gs.funnel.confidenceScore) / 4,
          );
          const primaryObjective = gs.objectives.primaryObjectiveId ? objectiveById.get(gs.objectives.primaryObjectiveId) : undefined;
          const sortedSignals = [...gs.signals.signals].sort((a, b) => b.strengthScore - a.strengthScore);
          const topSignals = sortedSignals.slice(0, 12);
          const remainingSignals = sortedSignals.slice(12);
          const sortedObjectives = [...gs.objectives.objectives].sort((a, b) => b.priorityScore - a.priorityScore);
          const sortedChannels = [...gs.channels.channels].sort((a, b) => b.fitScore - a.fitScore);
          const funnelStageOrder: FunnelStage[] = ['awareness', 'consideration', 'conversion', 'activation', 'retention'];
          const stageByName = new Map(gs.funnel.stages.map((s) => [s.stage, s]));

          const evidenceNotes = Array.from(
            new Set([
              ...gs.signals.missingEvidence,
              ...gs.funnel.missingEvidence,
              ...gs.signals.warnings,
              ...gs.objectives.warnings,
              ...gs.channels.warnings,
              ...gs.funnel.warnings,
            ]),
          );

          return (
            <div style={{ marginTop: 16 }}>
              {/* A. Strategy Overview */}
              <Card className="profile-section confidence-card">
                <h3 className="section-title">Strategy Overview</h3>
                <ConfidenceBar label="Overall Confidence" score={overallConfidence} />
                <div className="summary-grid" style={{ marginTop: 14 }}>
                  <div>
                    <span className="summary-label">Primary Objective</span>
                    <p>{primaryObjective?.title ?? 'Not determined'}</p>
                  </div>
                  <div>
                    <span className="summary-label">Primary Channel</span>
                    <p>{gs.channels.primaryChannel ? labelize(gs.channels.primaryChannel) : 'Not determined'}</p>
                  </div>
                  <div>
                    <span className="summary-label">Primary Funnel Entry</span>
                    <p>{gs.funnel.primaryEntryStage ? labelize(gs.funnel.primaryEntryStage) : 'Not determined'}</p>
                  </div>
                  <div>
                    <span className="summary-label">Funnel Path</span>
                    <p>{gs.funnel.primaryConversionPath.length > 0 ? gs.funnel.primaryConversionPath.map((s) => labelize(s)).join(' → ') : 'Not determined'}</p>
                  </div>
                  <div>
                    <span className="summary-label">Strongest Signals</span>
                    <p>{gs.signals.strongestSignalIds.length}</p>
                  </div>
                </div>
              </Card>

              {/* B. Strategic Signals */}
              <div style={{ marginTop: 20 }}>
                <h3 className="section-title">Strategic Signals</h3>
                {topSignals.length === 0 ? (
                  <p className="muted" style={{ marginTop: 8 }}>Current product evidence is insufficient to build strong strategy signals.</p>
                ) : (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {topSignals.map((s) => (
                      <div key={s.id} className="audience-card">
                        <div className="entity-card-header">
                          <h4 style={{ margin: 0 }}>{s.title}</h4>
                          <span className="tag">{labelize(s.category)}</span>
                        </div>
                        <p>{s.value}</p>
                        <p className="audience-meta">
                          Strength: {s.strengthScore} · Confidence: {s.confidenceScore} · Source: {s.source}
                        </p>
                        {(s.relatedSegmentIds?.length || s.relatedKeywords?.length) ? (
                          <p className="muted" style={{ margin: '4px 0 0' }}>
                            {s.relatedSegmentIds?.length ? `${s.relatedSegmentIds.length} related audience segment(s). ` : ''}
                            {s.relatedKeywords?.length ? `Keywords: ${s.relatedKeywords.slice(0, 5).join(', ')}` : ''}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
                {remainingSignals.length > 0 && (
                  <details style={{ marginTop: 10 }}>
                    <summary className="summary-label" style={{ cursor: 'pointer' }}>
                      Show {remainingSignals.length} more signal(s)
                    </summary>
                    <ul className="bullet-list" style={{ marginTop: 8 }}>
                      {remainingSignals.map((s) => <li key={s.id}>{s.title}: {s.value} (strength {s.strengthScore})</li>)}
                    </ul>
                  </details>
                )}
              </div>

              {/* C. Growth Objectives */}
              <div style={{ marginTop: 20 }}>
                <h3 className="section-title">Growth Objectives</h3>
                {sortedObjectives.length === 0 ? (
                  <p className="muted" style={{ marginTop: 8 }}>No reliable growth objectives were detected from current evidence.</p>
                ) : (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {sortedObjectives.map((o) => (
                      <Card key={o.id} className="entity-card">
                        <div className="entity-card-header">
                          <h4 style={{ margin: 0 }}>{o.title}</h4>
                          {o.id === gs.objectives.primaryObjectiveId && <span className="tag">Primary</span>}
                        </div>
                        <div className="profile-meta">
                          <span>Priority: <strong>{o.priorityScore}</strong></span>
                          <span>Confidence: <strong>{o.confidenceScore}</strong></span>
                        </div>
                        {o.reasons.length > 0 && <p style={{ marginTop: 6 }}>{o.reasons.join(' ')}</p>}
                        {o.relatedKeywords.length > 0 && (
                          <p className="muted" style={{ margin: '6px 0 0' }}>Keywords: {o.relatedKeywords.slice(0, 6).join(', ')}</p>
                        )}
                        {o.relatedAudienceSegmentIds.length > 0 && (
                          <p className="muted" style={{ margin: '4px 0 0' }}>{o.relatedAudienceSegmentIds.length} related audience segment(s).</p>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* D. Recommended Channels */}
              <div style={{ marginTop: 20 }}>
                <h3 className="section-title">Recommended Channels</h3>
                <div className="content-warning">
                  Channel-fit scores are strategy heuristics and do not predict CAC, ROI, reach, or conversion performance.
                </div>
                {sortedChannels.length === 0 ? (
                  <p className="muted" style={{ marginTop: 8 }}>No reliable channel recommendations were detected.</p>
                ) : (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {sortedChannels.map((c) => (
                      <Card key={c.channel} className="entity-card">
                        <div className="entity-card-header">
                          <h4 style={{ margin: 0 }}>{labelize(c.channel)}</h4>
                          {c.channel === gs.channels.primaryChannel && <span className="tag">Primary Channel</span>}
                        </div>
                        <div className="profile-meta">
                          <span>Fit: <strong>{c.fitScore}</strong></span>
                          <span>Confidence: <strong>{c.confidenceScore}</strong></span>
                        </div>
                        {c.relatedObjectiveIds.length > 0 && (
                          <p className="muted" style={{ margin: '6px 0 0' }}>
                            Objectives: {c.relatedObjectiveIds.map((id) => objectiveById.get(id)?.title ?? id).join(', ')}
                          </p>
                        )}
                        {c.relatedKeywords.length > 0 && (
                          <p className="muted" style={{ margin: '4px 0 0' }}>Keywords: {c.relatedKeywords.slice(0, 6).join(', ')}</p>
                        )}
                        {c.reasons.length > 0 && (
                          <ul className="bullet-list" style={{ marginTop: 6 }}>{c.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
                        )}
                        {c.weaknesses.length > 0 && (
                          <ul className="bullet-list" style={{ marginTop: 6 }}>{c.weaknesses.map((w, i) => <li key={i}>{w}</li>)}</ul>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* E. Funnel Strategy */}
              <div style={{ marginTop: 20 }}>
                <h3 className="section-title">Funnel Strategy</h3>
                {gs.funnel.stages.length === 0 ? (
                  <p className="muted" style={{ marginTop: 8 }}>No reliable funnel stages were detected from current evidence.</p>
                ) : (
                  <>
                    <p className="audience-meta">
                      Conversion path: <strong>{gs.funnel.primaryConversionPath.map((s) => labelize(s)).join(' → ')}</strong>
                    </p>
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {funnelStageOrder
                        .filter((stageName) => stageByName.has(stageName))
                        .map((stageName) => {
                          const s = stageByName.get(stageName)!;
                          return (
                            <Card key={s.stage} className="entity-card">
                              <div className="entity-card-header">
                                <h4 style={{ margin: 0 }}>{labelize(s.stage)}</h4>
                                {s.stage === gs.funnel.primaryEntryStage && <span className="tag">Primary Entry</span>}
                              </div>
                              <div className="profile-meta">
                                <span>Priority: <strong>{s.priorityScore}</strong></span>
                                <span>Confidence: <strong>{s.confidenceScore}</strong></span>
                                {s.objective && <span>Objective: <strong>{s.objective}</strong></span>}
                              </div>
                              {s.channels.length > 0 && (
                                <div className="tag-list" style={{ marginTop: 6 }}>
                                  {s.channels.map((c, i) => <span key={i} className="tag">{labelize(c)}</span>)}
                                </div>
                              )}
                              {s.keywordIntents.length > 0 && (
                                <p className="muted" style={{ margin: '6px 0 0' }}>Intents: {s.keywordIntents.map((i) => labelize(i)).join(', ')}</p>
                              )}
                              {s.recommendedActions.length > 0 && (
                                <ul className="bullet-list" style={{ marginTop: 6 }}>{s.recommendedActions.map((a, i) => <li key={i}>{a}</li>)}</ul>
                              )}
                              <div className="profile-meta" style={{ marginTop: 6 }}>
                                {s.entrySignals.length > 0 && <span>Entry: {s.entrySignals.join(', ')}</span>}
                              </div>
                              {s.successSignals.length > 0 && (
                                <p className="muted" style={{ margin: '4px 0 0' }}>Success signals: {s.successSignals.join(', ')}</p>
                              )}
                              {s.audienceSegmentIds.length > 0 && (
                                <p className="muted" style={{ margin: '4px 0 0' }}>{s.audienceSegmentIds.length} related audience segment(s).</p>
                              )}
                            </Card>
                          );
                        })}
                    </div>
                  </>
                )}
              </div>

              {/* Messaging Strategy */}
              {(() => {
                const msg = gs.messaging;
                const signalById = new Map(gs.signals.signals.map((s) => [s.id, s]));
                const primaryPillar = msg.primaryPillarId ? msg.pillars.find((p) => p.id === msg.primaryPillarId) : undefined;
                const messagingNotes = Array.from(new Set([...msg.missingEvidence, ...msg.warnings]));
                const audienceLabel = (am: (typeof msg.audienceMessages)[number]) => {
                  const audienceSignal = am.supportingSignalIds.map((id) => signalById.get(id)).find((s) => s?.category === 'audience');
                  return audienceSignal?.value ?? am.audienceSegmentId;
                };

                return (
                  <div style={{ marginTop: 24 }}>
                    <h3 className="section-title">Messaging Strategy</h3>

                    {/* A. Messaging Overview */}
                    <Card className="profile-section confidence-card">
                      <ConfidenceBar label="Messaging Confidence" score={msg.confidenceScore} />
                      <div className="summary-grid" style={{ marginTop: 14 }}>
                        <div>
                          <span className="summary-label">Primary Pillar</span>
                          <p>{primaryPillar?.title ?? 'Not determined'}</p>
                        </div>
                        <div>
                          <span className="summary-label">Pillars</span>
                          <p>{msg.pillars.length}</p>
                        </div>
                        <div>
                          <span className="summary-label">Audience Messages</span>
                          <p>{msg.audienceMessages.length}</p>
                        </div>
                      </div>
                    </Card>

                    {/* B. Messaging Pillars */}
                    <div style={{ marginTop: 16 }}>
                      <h4 className="section-title">Messaging Pillars</h4>
                      {msg.pillars.length === 0 ? (
                        <p className="muted" style={{ marginTop: 8 }}>No reliable messaging pillars were detected from current evidence.</p>
                      ) : (
                        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {msg.pillars.slice(0, 6).map((p) => (
                            <Card key={p.id} className="entity-card">
                              <div className="entity-card-header">
                                <h4 style={{ margin: 0 }}>{p.title}</h4>
                                {p.id === msg.primaryPillarId && <span className="tag">Primary</span>}
                              </div>
                              <p className="entity-card-meta">{labelize(p.theme)}</p>
                              <div className="profile-meta">
                                <span>Priority: <strong>{p.priorityScore}</strong></span>
                                <span>Confidence: <strong>{p.confidenceScore}</strong></span>
                              </div>
                              {p.relatedFunnelStages.length > 0 && (
                                <div className="tag-list" style={{ marginTop: 6 }}>
                                  {p.relatedFunnelStages.map((stg, i) => <span key={i} className="tag">{labelize(stg)}</span>)}
                                </div>
                              )}
                              {p.supportingKeywords.length > 0 && (
                                <p className="muted" style={{ margin: '6px 0 0' }}>Keywords: {p.supportingKeywords.join(', ')}</p>
                              )}
                              {p.targetAudienceSegmentIds.length > 0 && (
                                <p className="muted" style={{ margin: '4px 0 0' }}>{p.targetAudienceSegmentIds.length} target audience segment(s).</p>
                              )}
                              {p.reasons.length > 0 && (
                                <ul className="bullet-list" style={{ marginTop: 6 }}>{p.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
                              )}
                            </Card>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* C. Audience Messaging */}
                    <div style={{ marginTop: 16 }}>
                      <h4 className="section-title">Audience Messaging</h4>
                      {msg.audienceMessages.length === 0 ? (
                        <p className="muted" style={{ marginTop: 8 }}>No audience-specific messaging could be derived reliably.</p>
                      ) : (
                        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {msg.audienceMessages.map((am, i) => (
                            <div key={i} className="audience-card">
                              <h4 style={{ margin: 0 }}>{audienceLabel(am)}</h4>
                              <p className="audience-meta">Need: {am.primaryNeed}</p>
                              <p className="audience-meta">Value message: {am.valueMessage}</p>
                              {am.proofFocus.length > 0 && <p className="muted" style={{ margin: '4px 0 0' }}>Proof focus: {am.proofFocus.join(', ')}</p>}
                              {am.objectionFocus.length > 0 && <p className="muted" style={{ margin: '4px 0 0' }}>Address: {am.objectionFocus.join(', ')}</p>}
                              <p className="audience-meta" style={{ marginTop: 4 }}>Confidence: {am.confidenceScore}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* D. Funnel Messaging */}
                    <div style={{ marginTop: 16 }}>
                      <h4 className="section-title">Funnel Messaging</h4>
                      {msg.funnelMessages.length === 0 ? (
                        <p className="muted" style={{ marginTop: 8 }}>No funnel-specific messaging is available from the current strategy.</p>
                      ) : (
                        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {msg.funnelMessages.map((fm, i) => (
                            <div key={i} className="audience-card">
                              <h4 style={{ margin: 0 }}>{labelize(fm.stage)}</h4>
                              <p className="audience-meta">Goal: {fm.messageGoal}</p>
                              {fm.messageThemes.length > 0 && <p className="muted" style={{ margin: '4px 0 0' }}>Themes: {fm.messageThemes.join(', ')}</p>}
                              {fm.proofFocus.length > 0 && <p className="muted" style={{ margin: '4px 0 0' }}>Proof focus: {fm.proofFocus.join(', ')}</p>}
                              {fm.ctaDirection.length > 0 && <p className="muted" style={{ margin: '4px 0 0' }}>CTA direction: {fm.ctaDirection.join(', ')}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* E. Tone Guidance */}
                    {msg.toneGuidance.length > 0 && (
                      <div style={{ marginTop: 16 }}>
                        <h4 className="section-title">Tone Guidance</h4>
                        <div className="tag-list" style={{ marginTop: 8 }}>
                          {msg.toneGuidance.map((t, i) => <span key={i} className="tag">{labelize(t)}</span>)}
                        </div>
                      </div>
                    )}

                    {/* F. Claims to Avoid */}
                    {msg.avoidClaims.length > 0 && (
                      <div style={{ marginTop: 16 }}>
                        <h4 className="section-title">Claims to Avoid</h4>
                        <ul className="bullet-list" style={{ marginTop: 8 }}>
                          {msg.avoidClaims.map((c, i) => <li key={i}>{c}</li>)}
                        </ul>
                      </div>
                    )}

                    {/* G. Messaging Evidence Gaps / Notes */}
                    {messagingNotes.length > 0 && (
                      <div style={{ marginTop: 16 }}>
                        <h4 className="section-title">Messaging Evidence Gaps / Notes</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {messagingNotes.map((w, i) => <div key={i} className="content-warning">{w}</div>)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* F. Evidence Gaps / Notes */}
              {evidenceNotes.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <h3 className="section-title">Evidence Gaps / Important Notes</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {evidenceNotes.map((w, i) => <div key={i} className="content-warning">{w}</div>)}
                  </div>
                </div>
              )}

              <div className="profile-meta" style={{ marginTop: 20 }}>
                <span>Generated: <strong>{new Date(gs.generatedAt).toLocaleString()}</strong></span>
              </div>
            </div>
          );
        })()}
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

          <Card className="profile-section">
            <h3 className="section-title">Website Evidence</h3>
            <p>
              Website analyzed: <strong>{profile.websiteAnalyzed ? 'Yes' : 'No'}</strong>
            </p>
            <p style={{ marginTop: 6 }}>
              Website quality:{' '}
              <span className={`quality-badge quality-${profile.websiteContentQuality ?? 'unavailable'}`}>
                {profile.websiteContentQuality ?? 'unavailable'}
              </span>
            </p>
            {profile.websiteAnalysisUrl && (
              <p className="muted" style={{ marginTop: 6 }}>
                {profile.websiteAnalysisUrl}
              </p>
            )}
            {profile.websiteAnalysisFetchedAt && (
              <p className="muted" style={{ marginTop: 4 }}>
                Fetched: {new Date(profile.websiteAnalysisFetchedAt).toLocaleString()}
              </p>
            )}
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
