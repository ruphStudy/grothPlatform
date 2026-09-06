import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { Card } from '../components/Card';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import type { BrandAssetSummary, BrandAssetType, BrandVisualProfile, CreativeAssetKind, CreativeAssetReviewStatus, CreativeAssetSummary } from '../types';

const CREATIVE_KIND_FILTERS: { value: '' | CreativeAssetKind; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'social_image', label: 'Social' },
  { value: 'blog_hero', label: 'Blog Hero' },
  { value: 'thumbnail', label: 'Thumbnail' },
];

const BRAND_ASSET_TYPES: BrandAssetType[] = ['logo', 'logo_mark', 'icon', 'product_image', 'screenshot', 'background', 'reference_image', 'other'];

function labelize(value: string): string {
  return value
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function CreativeReviewPage() {
  const { organizationId, productId, campaignId } = useParams<{ organizationId: string; productId: string; campaignId: string }>();
  const basePath = `/organizations/${organizationId}/products/${productId}/campaigns/${campaignId}`;
  const productBasePath = `/organizations/${organizationId}/products/${productId}`;

  const [tab, setTab] = useState<'creative' | 'brand'>('creative');

  // Campaign creative
  const [assets, setAssets] = useState<CreativeAssetSummary[] | null>(null);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<'' | CreativeAssetKind>('');
  const [selectedAsset, setSelectedAsset] = useState<CreativeAssetSummary | null>(null);
  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null);
  const [promoteAssetId, setPromoteAssetId] = useState<string | null>(null);
  const [promoteName, setPromoteName] = useState('');
  const [promoteType, setPromoteType] = useState<BrandAssetType>('reference_image');
  const [promoteBusy, setPromoteBusy] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);

  // Brand assets
  const [brandAssets, setBrandAssets] = useState<BrandAssetSummary[] | null>(null);
  const [brandAssetsLoading, setBrandAssetsLoading] = useState(false);
  const [brandAssetsError, setBrandAssetsError] = useState<string | null>(null);
  const [newAssetType, setNewAssetType] = useState<BrandAssetType>('logo');
  const [newAssetName, setNewAssetName] = useState('');
  const [newAssetUrl, setNewAssetUrl] = useState('');
  const [addAssetBusy, setAddAssetBusy] = useState(false);
  const [addAssetError, setAddAssetError] = useState<string | null>(null);

  // Brand visual profile
  const [profile, setProfile] = useState<BrandVisualProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState({
    primary: '',
    secondary: '',
    accent: '',
    background: '',
    visualStyle: '',
    avoidStyles: '',
    preferredSubjects: '',
    avoidSubjects: '',
    logoEnabled: false,
  });
  const [profileSaving, setProfileSaving] = useState(false);

  async function loadCreativeAssets() {
    setAssetsLoading(true);
    setAssetsError(null);
    try {
      const query = kindFilter ? `?kind=${encodeURIComponent(kindFilter)}` : '';
      const result = await apiRequest<CreativeAssetSummary[]>(`${basePath}/creative/assets${query}`);
      setAssets(result);
    } catch (err) {
      setAssetsError(err instanceof ApiError ? err.message : 'Failed to load creative assets');
    } finally {
      setAssetsLoading(false);
    }
  }

  useEffect(() => {
    loadCreativeAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, productId, campaignId, kindFilter]);

  async function loadBrandAssets() {
    setBrandAssetsLoading(true);
    setBrandAssetsError(null);
    try {
      const result = await apiRequest<BrandAssetSummary[]>(`${productBasePath}/brand-assets`);
      setBrandAssets(result);
    } catch (err) {
      setBrandAssetsError(err instanceof ApiError ? err.message : 'Failed to load brand assets');
    } finally {
      setBrandAssetsLoading(false);
    }
  }

  async function loadProfile() {
    setProfileLoading(true);
    setProfileError(null);
    try {
      const result = await apiRequest<BrandVisualProfile | null>(`${productBasePath}/brand-visual-profile`);
      setProfile(result);
      if (result) {
        setProfileForm({
          primary: result.colors?.primary ?? '',
          secondary: result.colors?.secondary ?? '',
          accent: result.colors?.accent ?? '',
          background: result.colors?.background ?? '',
          visualStyle: result.visualStyle.join(', '),
          avoidStyles: result.avoidStyles.join(', '),
          preferredSubjects: result.preferredSubjects.join(', '),
          avoidSubjects: result.avoidSubjects.join(', '),
          logoEnabled: !!result.logoUsage?.enabled,
        });
      }
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : 'Failed to load brand visual profile');
    } finally {
      setProfileLoading(false);
    }
  }

  useEffect(() => {
    if (tab !== 'brand') return;
    if (brandAssets === null) loadBrandAssets();
    if (profile === null) loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function handleReviewChange(assetId: string, status: CreativeAssetReviewStatus) {
    setReviewBusyId(assetId);
    try {
      const updated = await apiRequest<CreativeAssetSummary>(`${basePath}/creative/assets/${assetId}/review`, { method: 'PATCH', body: { status } });
      setAssets((prev) => (prev ? prev.map((a) => (a.id === assetId ? updated : a)) : prev));
      if (selectedAsset?.id === assetId) setSelectedAsset(updated);
    } catch (err) {
      setAssetsError(err instanceof ApiError ? err.message : 'Failed to update review status');
    } finally {
      setReviewBusyId(null);
    }
  }

  function startPromote(assetId: string) {
    setPromoteAssetId(assetId);
    setPromoteName('');
    setPromoteType('reference_image');
    setPromoteError(null);
  }

  async function handlePromote() {
    if (!promoteAssetId || !promoteName.trim()) return;
    setPromoteBusy(true);
    setPromoteError(null);
    try {
      await apiRequest(`${productBasePath}/brand-assets/from-creative/${promoteAssetId}`, {
        method: 'POST',
        body: { type: promoteType, name: promoteName.trim() },
      });
      setPromoteAssetId(null);
      setBrandAssets(null); // force reload next time the Brand Assets tab is viewed
    } catch (err) {
      setPromoteError(err instanceof ApiError ? err.message : 'Failed to save as brand asset');
    } finally {
      setPromoteBusy(false);
    }
  }

  async function handleAddBrandAsset() {
    if (!newAssetName.trim() || !newAssetUrl.trim()) return;
    setAddAssetBusy(true);
    setAddAssetError(null);
    try {
      const created = await apiRequest<BrandAssetSummary>(`${productBasePath}/brand-assets`, {
        method: 'POST',
        body: { type: newAssetType, name: newAssetName.trim(), asset: { url: newAssetUrl.trim() } },
      });
      setBrandAssets((prev) => [created, ...(prev ?? [])]);
      setNewAssetName('');
      setNewAssetUrl('');
    } catch (err) {
      setAddAssetError(err instanceof ApiError ? err.message : 'Failed to add brand asset');
    } finally {
      setAddAssetBusy(false);
    }
  }

  async function handleTogglePrimary(brandAsset: BrandAssetSummary) {
    try {
      const updated = await apiRequest<BrandAssetSummary>(`${productBasePath}/brand-assets/${brandAsset.id}`, {
        method: 'PATCH',
        body: { usage: { primary: !brandAsset.usage?.primary } },
      });
      setBrandAssets((prev) => (prev ? prev.map((a) => (a.id === brandAsset.id ? updated : a.type === updated.type ? { ...a, usage: { ...a.usage, primary: false } } : a)) : prev));
    } catch (err) {
      setBrandAssetsError(err instanceof ApiError ? err.message : 'Failed to update brand asset');
    }
  }

  async function handleDeleteBrandAsset(id: string) {
    const confirmed = window.confirm('Remove this brand asset reference? This does not delete any originating generated image.');
    if (!confirmed) return;
    try {
      await apiRequest(`${productBasePath}/brand-assets/${id}`, { method: 'DELETE' });
      setBrandAssets((prev) => (prev ? prev.filter((a) => a.id !== id) : prev));
    } catch (err) {
      setBrandAssetsError(err instanceof ApiError ? err.message : 'Failed to delete brand asset');
    }
  }

  async function handleSaveProfile() {
    setProfileSaving(true);
    setProfileError(null);
    try {
      const toList = (v: string) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      const colors: Record<string, string> = {};
      if (profileForm.primary.trim()) colors.primary = profileForm.primary.trim();
      if (profileForm.secondary.trim()) colors.secondary = profileForm.secondary.trim();
      if (profileForm.accent.trim()) colors.accent = profileForm.accent.trim();
      if (profileForm.background.trim()) colors.background = profileForm.background.trim();
      const updated = await apiRequest<BrandVisualProfile>(`${productBasePath}/brand-visual-profile`, {
        method: 'PUT',
        body: {
          colors: Object.keys(colors).length > 0 ? colors : undefined,
          visualStyle: toList(profileForm.visualStyle),
          avoidStyles: toList(profileForm.avoidStyles),
          preferredSubjects: toList(profileForm.preferredSubjects),
          avoidSubjects: toList(profileForm.avoidSubjects),
          logoUsage: { enabled: profileForm.logoEnabled },
        },
      });
      setProfile(updated);
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : 'Failed to save brand visual profile');
    } finally {
      setProfileSaving(false);
    }
  }

  const knownCostTotal = (assets ?? []).reduce((sum, a) => sum + (a.cost?.estimated ?? 0), 0);
  const knownCostCount = (assets ?? []).filter((a) => a.cost !== undefined).length;

  return (
    <AppLayout>
      <PageHeader
        title="Creative"
        subtitle="Generated creative assets and reusable brand assets for this product."
        backTo={{ to: `/organizations/${organizationId}/products/${productId}/campaigns/${campaignId}`, label: 'Back to Campaign' }}
      />

      <div className="tag-list" style={{ marginBottom: 12 }}>
        <button className={`btn ${tab === 'creative' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('creative')}>
          Campaign Creative
        </button>
        <button className={`btn ${tab === 'brand' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('brand')}>
          Brand Assets
        </button>
      </div>

      {tab === 'creative' && (
        <Card>
          <div className="tag-list" style={{ marginBottom: 10 }}>
            {CREATIVE_KIND_FILTERS.map((f) => (
              <button key={f.value || 'all'} className={`btn ${kindFilter === f.value ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setKindFilter(f.value)}>
                {f.label}
              </button>
            ))}
          </div>
          <ErrorMessage message={assetsError} />
          {assetsLoading && <Loading />}
          {!assetsLoading && assets && assets.length === 0 && <p className="entity-card-meta">No creative assets generated yet.</p>}
          {!assetsLoading && assets && assets.length > 0 && (
            <>
              {knownCostCount > 0 && (
                <p className="entity-card-meta" style={{ marginBottom: 8 }}>
                  Total known generation cost: ${knownCostTotal.toFixed(4)} (across {knownCostCount} of {assets.length} assets with known cost)
                </p>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                {assets.map((asset) => (
                  <div key={asset.id} style={{ border: '1px solid var(--border-color, #ddd)', borderRadius: 6, padding: 8 }}>
                    {asset.asset.url ? (
                      <img
                        src={asset.asset.url}
                        alt={labelize(asset.kind)}
                        style={{ width: '100%', height: 130, objectFit: 'cover', borderRadius: 4, cursor: 'pointer' }}
                        onClick={() => setSelectedAsset(asset)}
                      />
                    ) : (
                      <div style={{ width: '100%', height: 130, borderRadius: 4, background: 'var(--surface-muted, #f5f5f5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span className="entity-card-meta">Image unavailable</span>
                      </div>
                    )}
                    <div className="tag-list" style={{ marginTop: 6 }}>
                      <span className="tag">{labelize(asset.kind)}</span>
                      <span className="tag">{asset.source.platform}</span>
                      <span className="tag">v{asset.source.contentVersion}</span>
                      {asset.promptSnapshot.aspectRatio && <span className="tag">{asset.promptSnapshot.aspectRatio}</span>}
                    </div>
                    <div className="entity-card-meta">{new Date(asset.createdAt).toLocaleString()}</div>
                    {asset.cost && (
                      <div className="entity-card-meta">
                        ${asset.cost.estimated.toFixed(4)} {asset.cost.currency}
                      </div>
                    )}
                    <div className="form-inline" style={{ marginTop: 6 }}>
                      <select value={asset.reviewStatus} onChange={(e) => handleReviewChange(asset.id, e.target.value as CreativeAssetReviewStatus)} disabled={reviewBusyId === asset.id}>
                        <option value="unreviewed">Unreviewed</option>
                        <option value="preferred">Preferred</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </div>
                    <div className="tag-list" style={{ marginTop: 6 }}>
                      <button className="btn btn-secondary" onClick={() => setSelectedAsset(asset)}>
                        Details
                      </button>
                      <button className="btn btn-secondary" onClick={() => startPromote(asset.id)}>
                        Save as Brand Asset
                      </button>
                    </div>
                    {promoteAssetId === asset.id && (
                      <div style={{ marginTop: 6 }}>
                        <ErrorMessage message={promoteError} />
                        <div className="field" style={{ marginBottom: 4 }}>
                          <select value={promoteType} onChange={(e) => setPromoteType(e.target.value as BrandAssetType)}>
                            {BRAND_ASSET_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {labelize(t)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="field" style={{ marginBottom: 4 }}>
                          <input type="text" placeholder="Name" value={promoteName} onChange={(e) => setPromoteName(e.target.value)} />
                        </div>
                        <div className="tag-list">
                          <button className="btn btn-secondary" onClick={handlePromote} disabled={promoteBusy || !promoteName.trim()}>
                            {promoteBusy ? 'Saving...' : 'Save'}
                          </button>
                          <button className="btn btn-secondary" onClick={() => setPromoteAssetId(null)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {selectedAsset && (
            <div style={{ marginTop: 16, padding: 12, border: '1px solid var(--border-color, #ddd)', borderRadius: 6 }}>
              <div className="tag-list">
                <span className="summary-label">Creative Detail</span>
                <button className="btn btn-secondary" onClick={() => setSelectedAsset(null)}>
                  Close
                </button>
              </div>
              {selectedAsset.asset.url && <img src={selectedAsset.asset.url} alt={labelize(selectedAsset.kind)} style={{ maxWidth: '100%', maxHeight: 400, borderRadius: 4, marginTop: 8 }} />}
              <div className="tag-list" style={{ marginTop: 8 }}>
                <span className="tag">{labelize(selectedAsset.kind)}</span>
                <span className="tag">Source: {selectedAsset.source.contentKind} / {selectedAsset.source.platform}</span>
                <span className="tag">v{selectedAsset.source.contentVersion}</span>
                <span className="tag">
                  {selectedAsset.provider}
                  {selectedAsset.model ? ` / ${selectedAsset.model}` : ''}
                </span>
                {selectedAsset.asset.width && selectedAsset.asset.height && (
                  <span className="tag">
                    {selectedAsset.asset.width}x{selectedAsset.asset.height}
                  </span>
                )}
                {selectedAsset.cost && (
                  <span className="tag">
                    ${selectedAsset.cost.estimated.toFixed(4)} {selectedAsset.cost.currency}
                  </span>
                )}
              </div>
              <div className="entity-card-meta">Generated {new Date(selectedAsset.createdAt).toLocaleString()}</div>
            </div>
          )}
        </Card>
      )}

      {tab === 'brand' && (
        <>
          <Card>
            <span className="summary-label" style={{ display: 'block', marginBottom: 8 }}>
              Brand Assets
            </span>
            <ErrorMessage message={brandAssetsError} />
            {brandAssetsLoading && <Loading />}
            {!brandAssetsLoading && brandAssets && brandAssets.length === 0 && <p className="entity-card-meta">No brand assets configured.</p>}
            {!brandAssetsLoading && brandAssets && brandAssets.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
                {brandAssets.map((ba) => (
                  <div key={ba.id} style={{ border: '1px solid var(--border-color, #ddd)', borderRadius: 6, padding: 8 }}>
                    {ba.asset.url && <img src={ba.asset.url} alt={ba.name} style={{ width: '100%', height: 100, objectFit: 'contain', borderRadius: 4 }} />}
                    <div className="tag-list" style={{ marginTop: 6 }}>
                      <span className="tag">{labelize(ba.type)}</span>
                      {ba.usage?.primary && <span className="tag">Primary</span>}
                    </div>
                    <div className="entity-card-meta">{ba.name}</div>
                    <div className="tag-list" style={{ marginTop: 6 }}>
                      <button className="btn btn-secondary" onClick={() => handleTogglePrimary(ba)}>
                        {ba.usage?.primary ? 'Unset Primary' : 'Set Primary'}
                      </button>
                      <button className="btn btn-secondary" onClick={() => handleDeleteBrandAsset(ba.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <span className="summary-label" style={{ display: 'block', marginTop: 8 }}>
              Add Brand Asset
            </span>
            <ErrorMessage message={addAssetError} />
            <div className="form-inline">
              <div className="field" style={{ marginBottom: 0 }}>
                <select value={newAssetType} onChange={(e) => setNewAssetType(e.target.value as BrandAssetType)}>
                  {BRAND_ASSET_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {labelize(t)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <input type="text" placeholder="Name" value={newAssetName} onChange={(e) => setNewAssetName(e.target.value)} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <input type="text" placeholder="Image URL" value={newAssetUrl} onChange={(e) => setNewAssetUrl(e.target.value)} />
              </div>
            </div>
            <button className="btn btn-secondary" onClick={handleAddBrandAsset} disabled={addAssetBusy || !newAssetName.trim() || !newAssetUrl.trim()}>
              {addAssetBusy ? 'Adding...' : 'Add Brand Asset'}
            </button>
          </Card>

          <Card className="section">
            <span className="summary-label" style={{ display: 'block', marginBottom: 8 }}>
              Brand Visual Profile
            </span>
            <ErrorMessage message={profileError} />
            {profileLoading && <Loading />}
            {!profileLoading && (
              <>
                <div className="form-inline">
                  <div className="field" style={{ marginBottom: 0 }}>
                    <input type="text" placeholder="Primary #hex" value={profileForm.primary} onChange={(e) => setProfileForm((p) => ({ ...p, primary: e.target.value }))} />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <input type="text" placeholder="Secondary #hex" value={profileForm.secondary} onChange={(e) => setProfileForm((p) => ({ ...p, secondary: e.target.value }))} />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <input type="text" placeholder="Accent #hex" value={profileForm.accent} onChange={(e) => setProfileForm((p) => ({ ...p, accent: e.target.value }))} />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <input type="text" placeholder="Background #hex" value={profileForm.background} onChange={(e) => setProfileForm((p) => ({ ...p, background: e.target.value }))} />
                  </div>
                </div>
                <div className="field">
                  <input
                    type="text"
                    placeholder="Visual style (comma-separated, e.g. minimal, editorial)"
                    value={profileForm.visualStyle}
                    onChange={(e) => setProfileForm((p) => ({ ...p, visualStyle: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <input
                    type="text"
                    placeholder="Avoid styles (comma-separated)"
                    value={profileForm.avoidStyles}
                    onChange={(e) => setProfileForm((p) => ({ ...p, avoidStyles: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <input
                    type="text"
                    placeholder="Preferred subjects (comma-separated)"
                    value={profileForm.preferredSubjects}
                    onChange={(e) => setProfileForm((p) => ({ ...p, preferredSubjects: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <input
                    type="text"
                    placeholder="Avoid subjects (comma-separated)"
                    value={profileForm.avoidSubjects}
                    onChange={(e) => setProfileForm((p) => ({ ...p, avoidSubjects: e.target.value }))}
                  />
                </div>
                <label className="entity-card-meta" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="checkbox" checked={profileForm.logoEnabled} onChange={(e) => setProfileForm((p) => ({ ...p, logoEnabled: e.target.checked }))} />
                  Reference a logo asset when generating creative (never redrawn/invented by the provider)
                </label>
                <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={handleSaveProfile} disabled={profileSaving}>
                  {profileSaving ? 'Saving...' : 'Save Visual Profile'}
                </button>
                {profile && <div className="entity-card-meta" style={{ marginTop: 6 }}>Last updated {new Date(profile.updatedAt).toLocaleString()}</div>}
              </>
            )}
          </Card>
        </>
      )}
    </AppLayout>
  );
}
