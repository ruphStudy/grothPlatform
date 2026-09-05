import { type FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { AppLayout } from '../components/AppLayout';
import { Card } from '../components/Card';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import type {
  Campaign,
  CampaignActivity,
  CampaignAudienceChannelMapping,
  CampaignGoalType,
  CampaignReviewSection,
  CampaignSectionReviewStatus,
  CampaignStatus,
  CampaignType,
  ContentIdeaResult,
  BlogCalendarResult,
  SocialCalendarResult,
  VideoCalendarResult,
  CampaignContentPillarTier,
  ContentPillarPlanResult,
  ContentTopicTier,
  TopicPrioritizationResult,
  RepurposingPlanResult,
  BlogDraftResult,
  BlogGenerationOptions,
  LinkedInDraftResult,
  LinkedInGenerationOptions,
  SocialCalendarItem,
  XDraftResult,
  XGenerationOptions,
  FacebookDraftResult,
  FacebookGenerationOptions,
  InstagramCaptionResult,
  InstagramGenerationOptions,
  NewsletterDraftResult,
  NewsletterGenerationOptions,
  NewsletterSourceType,
  VideoScriptDraftResult,
  VideoScriptGenerationOptions,
  ArtifactWithLatestVersion,
  ContentFactValidationResult,
  ContentFactValidationSummary,
  ContentGroundingResult,
  ContentGroundingSummary,
  ContentSeoReviewResult,
  ContentSeoReviewSummary,
  ContentReadabilityResult,
  ContentReadabilitySummary,
  ContentBrandVoiceResult,
  ContentBrandVoiceSummary,
  ContentOriginalityResult,
  ContentOriginalitySummary,
  ContentQualityResult,
  ContentQualitySummary,
  ContentImprovementFocus,
  ContentImprovementResult,
  ContentVersionDetail,
  ContentVersionSummary,
} from '../types';

const CAMPAIGN_STATUSES: CampaignStatus[] = ['draft', 'planned', 'approved', 'active', 'paused', 'completed', 'archived'];
const CAMPAIGN_TYPES: CampaignType[] = [
  'awareness',
  'education',
  'consideration',
  'lead_generation',
  'conversion',
  'activation',
  'retention',
  'product_launch',
  'promotion',
  'evergreen',
  'custom',
];
const CAMPAIGN_GOAL_TYPES: CampaignGoalType[] = [
  'awareness',
  'education',
  'consideration',
  'lead_generation',
  'conversion',
  'activation',
  'retention',
  'positioning',
  'differentiation',
  'buyer_enablement',
  'product_launch',
  'custom',
];
const CAMPAIGN_REVIEW_SECTION_LIST: { key: CampaignReviewSection; label: string }[] = [
  { key: 'goal', label: 'Goal' },
  { key: 'audience_channels', label: 'Audience & Channels' },
  { key: 'plan', label: 'Plan' },
  { key: 'calendar', label: 'Calendar' },
];
const CAMPAIGN_SECTION_REVIEW_STATUSES: CampaignSectionReviewStatus[] = ['pending', 'approved', 'changes_requested'];

function labelize(value: string): string {
  return value
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function statusQualityClass(status: CampaignStatus): string {
  if (status === 'approved' || status === 'active' || status === 'completed') return 'quality-good';
  if (status === 'planned' || status === 'paused') return 'quality-limited';
  return 'quality-unavailable';
}

function scoreQuality(score: number): 'high' | 'medium' | 'low' {
  if (score >= 80) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

function qualityBadgeClass(quality: 'high' | 'medium' | 'low'): string {
  if (quality === 'high') return 'quality-good';
  if (quality === 'medium') return 'quality-limited';
  return 'quality-empty';
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items));
}

function actualDateForDay(startDate: string | undefined, day: number): string | null {
  if (!startDate) return null;
  const d = new Date(startDate);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + (day - 1));
  return d.toLocaleDateString();
}

function audienceLabel(mapping: CampaignAudienceChannelMapping | undefined, id: string): string {
  return mapping?.audiences.find((a) => a.audienceSegmentId === id)?.label ?? id;
}

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function ActivityCard({ activity, mapping, allActivities }: { activity: CampaignActivity; mapping: CampaignAudienceChannelMapping | undefined; allActivities: CampaignActivity[] }) {
  const dependencyTitles = activity.dependencies.map((depId) => allActivities.find((a) => a.id === depId)?.title ?? depId);
  return (
    <div className="activity-card">
      <div className="activity-card-title">{activity.title}</div>
      <div className="tag-list">
        <span className="tag">{labelize(activity.type)}</span>
        <span className="tag">{labelize(activity.channel)}</span>
        <span className="tag">{labelize(activity.funnelStage)}</span>
        <span className={`quality-badge ${qualityBadgeClass(scoreQuality(activity.priorityScore))}`}>Priority {activity.priorityScore}</span>
        <span className={`quality-badge ${statusQualityClass(activity.status as CampaignStatus)}`}>{labelize(activity.status)}</span>
      </div>
      {activity.audienceSegmentIds.length > 0 && (
        <div className="entity-card-meta">Audience: {activity.audienceSegmentIds.map((id) => audienceLabel(mapping, id)).join(', ')}</div>
      )}
      <details style={{ marginTop: 6 }}>
        <summary className="summary-label" style={{ cursor: 'pointer' }}>
          Details
        </summary>
        <div style={{ marginTop: 8 }}>
          <span className="summary-label">Objective</span>
          <p>{activity.objective}</p>

          {activity.recommendedActions.length > 0 && (
            <>
              <span className="summary-label">Recommended Actions</span>
              <ul className="bullet-list">
                {activity.recommendedActions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </>
          )}

          {activity.keywordDirections.length > 0 && (
            <>
              <span className="summary-label">Keyword Directions</span>
              <div className="tag-list">
                {activity.keywordDirections.map((k, i) => (
                  <span className="tag" key={i}>
                    {k}
                  </span>
                ))}
              </div>
            </>
          )}

          {activity.contentFormat && (
            <>
              <span className="summary-label">Content Format</span>
              <p>{labelize(activity.contentFormat)}</p>
            </>
          )}

          {activity.conversionDirection && (
            <>
              <span className="summary-label">Conversion Direction</span>
              <p>{labelize(activity.conversionDirection)}</p>
            </>
          )}

          {(activity.messagingPillarIds.length > 0 || activity.contentPillarIds.length > 0) && (
            <>
              <span className="summary-label">Related Pillars</span>
              <p className="entity-card-meta">
                {[...activity.messagingPillarIds, ...activity.contentPillarIds].join(', ') || '-'}
              </p>
            </>
          )}

          {dependencyTitles.length > 0 && (
            <>
              <span className="summary-label">Depends On</span>
              <ul className="bullet-list">
                {dependencyTitles.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </>
          )}

          {activity.successSignals.length > 0 && (
            <>
              <span className="summary-label">Success Signals</span>
              <div className="tag-list">
                {activity.successSignals.map((s, i) => (
                  <span className="tag" key={i}>
                    {s}
                  </span>
                ))}
              </div>
            </>
          )}

          {activity.reasons.length > 0 && (
            <>
              <span className="summary-label">Reasons</span>
              <ul className="bullet-list">
                {activity.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </>
          )}

          {activity.warnings.length > 0 && (
            <div className="content-warning" style={{ marginTop: 8 }}>
              {activity.warnings.join(' ')}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

// 15J — regenerating never overwrites history: it always creates version+1
// and the previous version stays available below under History.
const REGENERATE_CONFIRM_MESSAGE = 'Regenerating will create a new version (the current version stays available under History) and may incur additional cost. Continue?';

// 16H — Auto-Improve is one explicit, paid AI call that creates a new
// version; it never runs automatically and never guarantees a higher
// Quality Score.
const IMPROVE_CONFIRM_MESSAGE = 'AI improvement creates a new version and may incur provider usage cost. Continue?';

const IMPROVEMENT_FOCUS_OPTIONS: { value: ContentImprovementFocus; label: string }[] = [
  { value: 'all', label: 'Overall' },
  { value: 'facts', label: 'Facts' },
  { value: 'seo', label: 'SEO' },
  { value: 'readability', label: 'Readability' },
  { value: 'brand_voice', label: 'Brand Voice' },
  { value: 'originality', label: 'Originality' },
];

// 15J — shared, kind-agnostic version history widget. Applied to every
// generated-content panel (Blog, LinkedIn, X, Facebook, Instagram,
// Newsletter, Video Script). Viewing an older version only affects this
// widget's own local state — it never replaces the live `draft` shown by
// the panel above it, so regenerating always creates latest+1 and never
// branches from whatever version happens to be open here.
function groundingBadgeClass(status: ContentGroundingSummary['status']): string {
  if (status === 'grounded') return 'quality-good';
  if (status === 'partially_grounded') return 'quality-limited';
  return 'quality-empty';
}

function groundingBadgeLabel(status: ContentGroundingSummary['status']): string {
  if (status === 'grounded') return 'Grounded';
  if (status === 'partially_grounded') return 'Partial';
  return 'Needs Review';
}

function GroundingBadge({ grounding }: { grounding: ContentGroundingSummary | undefined }) {
  if (!grounding) return null;
  return (
    <span className={`quality-badge ${groundingBadgeClass(grounding.status)}`}>
      Grounding: {grounding.score} — {groundingBadgeLabel(grounding.status)}
    </span>
  );
}

function factValidationBadgeClass(status: ContentFactValidationSummary['status']): string {
  if (status === 'validated') return 'quality-good';
  if (status === 'needs_review') return 'quality-limited';
  return 'quality-empty';
}

function factValidationBadgeLabel(status: ContentFactValidationSummary['status']): string {
  if (status === 'validated') return 'Validated';
  if (status === 'needs_review') return 'Review';
  return 'Failed';
}

function FactValidationBadge({ factValidation }: { factValidation: ContentFactValidationSummary | undefined }) {
  if (!factValidation) return null;
  return (
    <span className={`quality-badge ${factValidationBadgeClass(factValidation.status)}`}>
      Fact Validation: {factValidation.score} — {factValidationBadgeLabel(factValidation.status)}
    </span>
  );
}

function seoReviewBadgeClass(status: ContentSeoReviewSummary['status']): string {
  if (status === 'optimized') return 'quality-good';
  if (status === 'needs_improvement') return 'quality-limited';
  return 'quality-empty';
}

function seoReviewBadgeLabel(status: ContentSeoReviewSummary['status']): string {
  if (status === 'optimized') return 'Optimized';
  if (status === 'needs_improvement') return 'Improve';
  return 'Poor';
}

function SeoReviewBadge({ seoReview }: { seoReview: ContentSeoReviewSummary | undefined }) {
  if (!seoReview) return null;
  return (
    <span className={`quality-badge ${seoReviewBadgeClass(seoReview.status)}`}>
      SEO: {seoReview.score} — {seoReviewBadgeLabel(seoReview.status)}
    </span>
  );
}

function readabilityBadgeClass(status: ContentReadabilitySummary['status']): string {
  if (status === 'readable') return 'quality-good';
  if (status === 'needs_improvement') return 'quality-limited';
  return 'quality-empty';
}

function readabilityBadgeLabel(status: ContentReadabilitySummary['status']): string {
  if (status === 'readable') return 'Readable';
  if (status === 'needs_improvement') return 'Improve';
  return 'Difficult';
}

function ReadabilityBadge({ readability }: { readability: ContentReadabilitySummary | undefined }) {
  if (!readability) return null;
  return (
    <span className={`quality-badge ${readabilityBadgeClass(readability.status)}`}>
      Readability: {readability.score} — {readabilityBadgeLabel(readability.status)}
    </span>
  );
}

function brandVoiceBadgeClass(status: ContentBrandVoiceSummary['status']): string {
  if (status === 'aligned') return 'quality-good';
  if (status === 'needs_adjustment') return 'quality-limited';
  return 'quality-empty';
}

function brandVoiceBadgeLabel(status: ContentBrandVoiceSummary['status']): string {
  if (status === 'aligned') return 'Aligned';
  if (status === 'needs_adjustment') return 'Adjust';
  return 'Misaligned';
}

function BrandVoiceBadge({ brandVoice }: { brandVoice: ContentBrandVoiceSummary | undefined }) {
  if (!brandVoice) return null;
  return (
    <span className={`quality-badge ${brandVoiceBadgeClass(brandVoice.status)}`}>
      Brand Voice: {brandVoice.score} — {brandVoiceBadgeLabel(brandVoice.status)}
    </span>
  );
}

function originalityBadgeClass(status: ContentOriginalitySummary['status']): string {
  if (status === 'original') return 'quality-good';
  if (status === 'needs_review') return 'quality-limited';
  return 'quality-empty';
}

function originalityBadgeLabel(status: ContentOriginalitySummary['status']): string {
  if (status === 'original') return 'Original';
  if (status === 'needs_review') return 'Review';
  return 'Repetitive';
}

function OriginalityBadge({ originality }: { originality: ContentOriginalitySummary | undefined }) {
  if (!originality) return null;
  return (
    <span className={`quality-badge ${originalityBadgeClass(originality.status)}`}>
      Originality: {originality.score} — {originalityBadgeLabel(originality.status)}
    </span>
  );
}

function overallQualityBadgeClass(status: ContentQualitySummary['status']): string {
  if (status === 'excellent' || status === 'good') return 'quality-good';
  if (status === 'needs_improvement') return 'quality-limited';
  return 'quality-empty';
}

function overallQualityStatusLabel(status: ContentQualitySummary['status']): string {
  if (status === 'excellent') return 'Excellent';
  if (status === 'good') return 'Good';
  if (status === 'needs_improvement') return 'Needs Improvement';
  return 'Poor';
}

// Primary Sprint 16 summary (spec section 23) — shown larger and first,
// ahead of the individual 16A-16F badges.
function QualityScoreBadge({ quality }: { quality: ContentQualitySummary | undefined }) {
  if (!quality) return null;
  return (
    <span className={`quality-badge ${overallQualityBadgeClass(quality.status)}`} style={{ fontSize: '1.05em', fontWeight: 600 }}>
      Quality Score: {quality.score} — {overallQualityStatusLabel(quality.status)}
      {quality.blockerCount > 0 ? ` (${quality.blockerCount} blocker${quality.blockerCount === 1 ? '' : 's'})` : ''}
    </span>
  );
}

// Exact labels follow current generation semantics (spec section 31): v1
// with no reason is "Generated", a later version with no reason is
// "Regenerated", and an AI-improved version names its source version.
function generationReasonLabel(v: { version: number; generationReason?: ContentVersionSummary['generationReason']; improvedFromVersion?: number }): string {
  if (v.generationReason === 'auto_improved') return `Auto-improved from v${v.improvedFromVersion ?? '?'}`;
  if (v.version <= 1) return 'Generated';
  return 'Regenerated';
}

function ContentVersionHistory({ basePath, artifactId, latestVersion: latestVersionProp }: { basePath: string; artifactId: string | undefined; latestVersion: number | undefined }) {
  // Shadows the `latestVersion` prop so a successful Improve (which creates
  // a new version the parent doesn't know about yet) can update "latest"
  // locally without waiting for the parent to refetch.
  const [latestVersion, setLatestVersion] = useState(latestVersionProp);
  useEffect(() => {
    setLatestVersion(latestVersionProp);
  }, [latestVersionProp]);

  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<ContentVersionSummary[] | null>(null);
  const [listBusy, setListBusy] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ContentVersionDetail | null>(null);
  const [selectedBusy, setSelectedBusy] = useState(false);
  const [selectedError, setSelectedError] = useState<string | null>(null);
  const [latestGrounding, setLatestGrounding] = useState<ContentGroundingSummary | undefined>(undefined);
  const [groundingDetail, setGroundingDetail] = useState<ContentGroundingResult | null>(null);
  const [groundingOpen, setGroundingOpen] = useState(false);
  const [groundingBusy, setGroundingBusy] = useState(false);
  const [groundingError, setGroundingError] = useState<string | null>(null);
  const [latestFactValidation, setLatestFactValidation] = useState<ContentFactValidationSummary | undefined>(undefined);
  const [factValidationDetail, setFactValidationDetail] = useState<ContentFactValidationResult | null>(null);
  const [factValidationOpen, setFactValidationOpen] = useState(false);
  const [factValidationBusy, setFactValidationBusy] = useState(false);
  const [factValidationError, setFactValidationError] = useState<string | null>(null);
  const [latestSeoReview, setLatestSeoReview] = useState<ContentSeoReviewSummary | undefined>(undefined);
  const [seoReviewDetail, setSeoReviewDetail] = useState<ContentSeoReviewResult | null>(null);
  const [seoReviewOpen, setSeoReviewOpen] = useState(false);
  const [seoReviewBusy, setSeoReviewBusy] = useState(false);
  const [seoReviewError, setSeoReviewError] = useState<string | null>(null);
  const [latestReadability, setLatestReadability] = useState<ContentReadabilitySummary | undefined>(undefined);
  const [readabilityDetail, setReadabilityDetail] = useState<ContentReadabilityResult | null>(null);
  const [readabilityOpen, setReadabilityOpen] = useState(false);
  const [readabilityBusy, setReadabilityBusy] = useState(false);
  const [readabilityError, setReadabilityError] = useState<string | null>(null);
  const [latestBrandVoice, setLatestBrandVoice] = useState<ContentBrandVoiceSummary | undefined>(undefined);
  const [brandVoiceDetail, setBrandVoiceDetail] = useState<ContentBrandVoiceResult | null>(null);
  const [brandVoiceOpen, setBrandVoiceOpen] = useState(false);
  const [brandVoiceBusy, setBrandVoiceBusy] = useState(false);
  const [brandVoiceError, setBrandVoiceError] = useState<string | null>(null);
  const [latestOriginality, setLatestOriginality] = useState<ContentOriginalitySummary | undefined>(undefined);
  const [originalityDetail, setOriginalityDetail] = useState<ContentOriginalityResult | null>(null);
  const [originalityOpen, setOriginalityOpen] = useState(false);
  const [originalityBusy, setOriginalityBusy] = useState(false);
  const [originalityError, setOriginalityError] = useState<string | null>(null);
  const [latestQuality, setLatestQuality] = useState<ContentQualitySummary | undefined>(undefined);
  const [qualityDetail, setQualityDetail] = useState<ContentQualityResult | null>(null);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [qualityBusy, setQualityBusy] = useState(false);
  const [qualityError, setQualityError] = useState<string | null>(null);
  const [improveFocus, setImproveFocus] = useState<ContentImprovementFocus>('all');
  const [improveBusy, setImproveBusy] = useState(false);
  const [improveError, setImproveError] = useState<string | null>(null);
  const [improveComparison, setImproveComparison] = useState<{ fromVersion: number; fromScore?: number; toVersion: number; toScore?: number } | null>(null);

  useEffect(() => {
    if (!artifactId || !latestVersion) return;
    apiRequest<ContentGroundingResult | null>(`${basePath}/content-generation/artifacts/${artifactId}/versions/${latestVersion}/grounding`)
      .then((result) => setLatestGrounding(result ?? undefined))
      .catch(() => setLatestGrounding(undefined));
    apiRequest<ContentFactValidationResult | null>(`${basePath}/content-generation/artifacts/${artifactId}/versions/${latestVersion}/fact-validation`)
      .then((result) => setLatestFactValidation(result ?? undefined))
      .catch(() => setLatestFactValidation(undefined));
    apiRequest<ContentSeoReviewResult | null>(`${basePath}/content-generation/artifacts/${artifactId}/versions/${latestVersion}/seo-review`)
      .then((result) => setLatestSeoReview(result ?? undefined))
      .catch(() => setLatestSeoReview(undefined));
    apiRequest<ContentReadabilityResult | null>(`${basePath}/content-generation/artifacts/${artifactId}/versions/${latestVersion}/readability`)
      .then((result) => setLatestReadability(result ?? undefined))
      .catch(() => setLatestReadability(undefined));
    apiRequest<ContentBrandVoiceResult | null>(`${basePath}/content-generation/artifacts/${artifactId}/versions/${latestVersion}/brand-voice`)
      .then((result) => setLatestBrandVoice(result ?? undefined))
      .catch(() => setLatestBrandVoice(undefined));
    apiRequest<ContentOriginalityResult | null>(`${basePath}/content-generation/artifacts/${artifactId}/versions/${latestVersion}/originality`)
      .then((result) => setLatestOriginality(result ?? undefined))
      .catch(() => setLatestOriginality(undefined));
    apiRequest<ContentQualityResult | null>(`${basePath}/content-generation/artifacts/${artifactId}/versions/${latestVersion}/quality`)
      .then((result) => setLatestQuality(result ?? undefined))
      .catch(() => setLatestQuality(undefined));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifactId, latestVersion]);

  async function loadGrounding(version: number) {
    if (!artifactId) return;
    setGroundingBusy(true);
    setGroundingError(null);
    try {
      const result = await apiRequest<ContentGroundingResult | null>(`${basePath}/content-generation/artifacts/${artifactId}/versions/${version}/grounding`);
      setGroundingDetail(result);
    } catch (err) {
      setGroundingError(err instanceof ApiError ? err.message : 'Failed to load grounding');
    } finally {
      setGroundingBusy(false);
    }
  }

  async function toggleGrounding(version: number) {
    if (groundingOpen) {
      setGroundingOpen(false);
      return;
    }
    setGroundingOpen(true);
    await loadGrounding(version);
  }

  async function recheckGrounding(version: number) {
    if (!artifactId) return;
    setGroundingBusy(true);
    setGroundingError(null);
    try {
      const result = await apiRequest<ContentGroundingResult>(`${basePath}/content-generation/artifacts/${artifactId}/versions/${version}/grounding`, { method: 'POST' });
      setGroundingDetail(result);
      setGroundingOpen(true);
      if (selected && selected.version === version) {
        setSelected({ ...selected, grounding: { status: result.status, score: result.score, unsupportedClaimCount: result.unsupportedClaimCount, uncertainClaimCount: result.uncertainClaimCount } });
      }
      if (version === latestVersion) {
        setLatestGrounding({ status: result.status, score: result.score, unsupportedClaimCount: result.unsupportedClaimCount, uncertainClaimCount: result.uncertainClaimCount });
      }
    } catch (err) {
      setGroundingError(err instanceof ApiError ? err.message : 'Failed to recheck grounding');
    } finally {
      setGroundingBusy(false);
    }
  }

  async function loadFactValidation(version: number) {
    if (!artifactId) return;
    setFactValidationBusy(true);
    setFactValidationError(null);
    try {
      const result = await apiRequest<ContentFactValidationResult | null>(`${basePath}/content-generation/artifacts/${artifactId}/versions/${version}/fact-validation`);
      setFactValidationDetail(result);
    } catch (err) {
      setFactValidationError(err instanceof ApiError ? err.message : 'Failed to load fact validation');
    } finally {
      setFactValidationBusy(false);
    }
  }

  async function toggleFactValidation(version: number) {
    if (factValidationOpen) {
      setFactValidationOpen(false);
      return;
    }
    setFactValidationOpen(true);
    await loadFactValidation(version);
  }

  async function recheckFactValidation(version: number) {
    if (!artifactId) return;
    setFactValidationBusy(true);
    setFactValidationError(null);
    try {
      const result = await apiRequest<ContentFactValidationResult>(`${basePath}/content-generation/artifacts/${artifactId}/versions/${version}/fact-validation`, { method: 'POST' });
      setFactValidationDetail(result);
      setFactValidationOpen(true);
      const summary = { status: result.status, score: result.score, reviewClaimCount: result.reviewClaimCount, failedClaimCount: result.failedClaimCount };
      if (selected && selected.version === version) {
        setSelected({ ...selected, factValidation: summary });
      }
      if (version === latestVersion) {
        setLatestFactValidation(summary);
      }
    } catch (err) {
      setFactValidationError(err instanceof ApiError ? err.message : 'Failed to recheck fact validation');
    } finally {
      setFactValidationBusy(false);
    }
  }

  async function loadSeoReview(version: number) {
    if (!artifactId) return;
    setSeoReviewBusy(true);
    setSeoReviewError(null);
    try {
      const result = await apiRequest<ContentSeoReviewResult | null>(`${basePath}/content-generation/artifacts/${artifactId}/versions/${version}/seo-review`);
      setSeoReviewDetail(result);
    } catch (err) {
      setSeoReviewError(err instanceof ApiError ? err.message : 'Failed to load SEO review');
    } finally {
      setSeoReviewBusy(false);
    }
  }

  async function toggleSeoReview(version: number) {
    if (seoReviewOpen) {
      setSeoReviewOpen(false);
      return;
    }
    setSeoReviewOpen(true);
    await loadSeoReview(version);
  }

  async function recheckSeoReview(version: number) {
    if (!artifactId) return;
    setSeoReviewBusy(true);
    setSeoReviewError(null);
    try {
      const result = await apiRequest<ContentSeoReviewResult>(`${basePath}/content-generation/artifacts/${artifactId}/versions/${version}/seo-review`, { method: 'POST' });
      setSeoReviewDetail(result);
      setSeoReviewOpen(true);
      const summary = { status: result.status, score: result.score, warningCount: result.warningCount, failedCount: result.failedCount };
      if (selected && selected.version === version) {
        setSelected({ ...selected, seoReview: summary });
      }
      if (version === latestVersion) {
        setLatestSeoReview(summary);
      }
    } catch (err) {
      setSeoReviewError(err instanceof ApiError ? err.message : 'Failed to recheck SEO review');
    } finally {
      setSeoReviewBusy(false);
    }
  }

  async function loadReadability(version: number) {
    if (!artifactId) return;
    setReadabilityBusy(true);
    setReadabilityError(null);
    try {
      const result = await apiRequest<ContentReadabilityResult | null>(`${basePath}/content-generation/artifacts/${artifactId}/versions/${version}/readability`);
      setReadabilityDetail(result);
    } catch (err) {
      setReadabilityError(err instanceof ApiError ? err.message : 'Failed to load readability');
    } finally {
      setReadabilityBusy(false);
    }
  }

  async function toggleReadability(version: number) {
    if (readabilityOpen) {
      setReadabilityOpen(false);
      return;
    }
    setReadabilityOpen(true);
    await loadReadability(version);
  }

  async function recheckReadability(version: number) {
    if (!artifactId) return;
    setReadabilityBusy(true);
    setReadabilityError(null);
    try {
      const result = await apiRequest<ContentReadabilityResult>(`${basePath}/content-generation/artifacts/${artifactId}/versions/${version}/readability`, { method: 'POST' });
      setReadabilityDetail(result);
      setReadabilityOpen(true);
      const summary = { status: result.status, score: result.score, warningCount: result.warningCount, failedCount: result.failedCount };
      if (selected && selected.version === version) {
        setSelected({ ...selected, readability: summary });
      }
      if (version === latestVersion) {
        setLatestReadability(summary);
      }
    } catch (err) {
      setReadabilityError(err instanceof ApiError ? err.message : 'Failed to recheck readability');
    } finally {
      setReadabilityBusy(false);
    }
  }

  async function loadBrandVoice(version: number) {
    if (!artifactId) return;
    setBrandVoiceBusy(true);
    setBrandVoiceError(null);
    try {
      const result = await apiRequest<ContentBrandVoiceResult | null>(`${basePath}/content-generation/artifacts/${artifactId}/versions/${version}/brand-voice`);
      setBrandVoiceDetail(result);
    } catch (err) {
      setBrandVoiceError(err instanceof ApiError ? err.message : 'Failed to load brand voice');
    } finally {
      setBrandVoiceBusy(false);
    }
  }

  async function toggleBrandVoice(version: number) {
    if (brandVoiceOpen) {
      setBrandVoiceOpen(false);
      return;
    }
    setBrandVoiceOpen(true);
    await loadBrandVoice(version);
  }

  async function recheckBrandVoice(version: number) {
    if (!artifactId) return;
    setBrandVoiceBusy(true);
    setBrandVoiceError(null);
    try {
      const result = await apiRequest<ContentBrandVoiceResult>(`${basePath}/content-generation/artifacts/${artifactId}/versions/${version}/brand-voice`, { method: 'POST' });
      setBrandVoiceDetail(result);
      setBrandVoiceOpen(true);
      const summary = { status: result.status, score: result.score, warningCount: result.warningCount, failedCount: result.failedCount };
      if (selected && selected.version === version) {
        setSelected({ ...selected, brandVoice: summary });
      }
      if (version === latestVersion) {
        setLatestBrandVoice(summary);
      }
    } catch (err) {
      setBrandVoiceError(err instanceof ApiError ? err.message : 'Failed to recheck brand voice');
    } finally {
      setBrandVoiceBusy(false);
    }
  }

  async function loadOriginality(version: number) {
    if (!artifactId) return;
    setOriginalityBusy(true);
    setOriginalityError(null);
    try {
      const result = await apiRequest<ContentOriginalityResult | null>(`${basePath}/content-generation/artifacts/${artifactId}/versions/${version}/originality`);
      setOriginalityDetail(result);
    } catch (err) {
      setOriginalityError(err instanceof ApiError ? err.message : 'Failed to load originality');
    } finally {
      setOriginalityBusy(false);
    }
  }

  async function toggleOriginality(version: number) {
    if (originalityOpen) {
      setOriginalityOpen(false);
      return;
    }
    setOriginalityOpen(true);
    await loadOriginality(version);
  }

  async function recheckOriginality(version: number) {
    if (!artifactId) return;
    setOriginalityBusy(true);
    setOriginalityError(null);
    try {
      const result = await apiRequest<ContentOriginalityResult>(`${basePath}/content-generation/artifacts/${artifactId}/versions/${version}/originality`, { method: 'POST' });
      setOriginalityDetail(result);
      setOriginalityOpen(true);
      const summary = { status: result.status, score: result.score, duplicateSentenceCount: result.duplicateSentenceCount, crossContentMatchCount: result.crossContentMatchCount };
      if (selected && selected.version === version) {
        setSelected({ ...selected, originality: summary });
      }
      if (version === latestVersion) {
        setLatestOriginality(summary);
      }
    } catch (err) {
      setOriginalityError(err instanceof ApiError ? err.message : 'Failed to recheck originality');
    } finally {
      setOriginalityBusy(false);
    }
  }

  async function loadQuality(version: number) {
    if (!artifactId) return;
    setQualityBusy(true);
    setQualityError(null);
    try {
      const result = await apiRequest<ContentQualityResult | null>(`${basePath}/content-generation/artifacts/${artifactId}/versions/${version}/quality`);
      setQualityDetail(result);
    } catch (err) {
      setQualityError(err instanceof ApiError ? err.message : 'Failed to load quality score');
    } finally {
      setQualityBusy(false);
    }
  }

  async function toggleQuality(version: number) {
    if (qualityOpen) {
      setQualityOpen(false);
      return;
    }
    setQualityOpen(true);
    await loadQuality(version);
  }

  async function recalculateQuality(version: number) {
    if (!artifactId) return;
    setQualityBusy(true);
    setQualityError(null);
    try {
      const result = await apiRequest<ContentQualityResult>(`${basePath}/content-generation/artifacts/${artifactId}/versions/${version}/quality`, { method: 'POST' });
      setQualityDetail(result);
      setQualityOpen(true);
      const summary = { status: result.status, score: result.score, blockerCount: result.blockers.length };
      if (selected && selected.version === version) {
        setSelected({ ...selected, quality: summary });
      }
      if (version === latestVersion) {
        setLatestQuality(summary);
      }
    } catch (err) {
      setQualityError(err instanceof ApiError ? err.message : 'Failed to recalculate quality score');
    } finally {
      setQualityBusy(false);
    }
  }

  // 16H — one explicit, paid AI call that creates a new version from the
  // currently selected version. Never guarantees a higher Quality Score.
  async function improveSelectedVersion(sourceVersion: ContentVersionDetail) {
    if (!artifactId) return;
    const confirmed = window.confirm(IMPROVE_CONFIRM_MESSAGE);
    if (!confirmed) return;
    setImproveBusy(true);
    setImproveError(null);
    setImproveComparison(null);
    try {
      const result = await apiRequest<ContentImprovementResult>(`${basePath}/content-generation/artifacts/${artifactId}/versions/${sourceVersion.version}/improve`, {
        method: 'POST',
        body: { focus: improveFocus },
      });
      setImproveComparison({ fromVersion: sourceVersion.version, fromScore: sourceVersion.quality?.score, toVersion: result.version, toScore: result.quality?.score });
      if (result.version > (latestVersion ?? 0)) {
        setLatestVersion(result.version);
        setLatestGrounding(result.grounding);
        setLatestFactValidation(result.factValidation);
        setLatestSeoReview(result.seoReview);
        setLatestReadability(result.readability);
        setLatestBrandVoice(result.brandVoice);
        setLatestOriginality(result.originality);
        setLatestQuality(result.quality);
      }
      if (open) {
        try {
          const refreshed = await apiRequest<ContentVersionSummary[]>(`${basePath}/content-generation/artifacts/${artifactId}/versions`);
          setVersions(refreshed);
        } catch {
          // Non-fatal — the new version was still created and selected below.
        }
      }
      await viewVersion(result.version);
    } catch (err) {
      setImproveError(err instanceof ApiError ? err.message : 'Failed to improve content with AI');
    } finally {
      setImproveBusy(false);
    }
  }

  async function toggleOpen() {
    if (!artifactId) return;
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setSelected(null);
    setListBusy(true);
    setListError(null);
    try {
      const result = await apiRequest<ContentVersionSummary[]>(`${basePath}/content-generation/artifacts/${artifactId}/versions`);
      setVersions(result);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Failed to load version history');
    } finally {
      setListBusy(false);
    }
  }

  async function viewVersion(version: number) {
    if (!artifactId) return;
    setSelectedBusy(true);
    setSelectedError(null);
    setGroundingOpen(false);
    setGroundingDetail(null);
    setGroundingError(null);
    setFactValidationOpen(false);
    setFactValidationDetail(null);
    setFactValidationError(null);
    setSeoReviewOpen(false);
    setSeoReviewDetail(null);
    setSeoReviewError(null);
    setReadabilityOpen(false);
    setReadabilityDetail(null);
    setReadabilityError(null);
    setBrandVoiceOpen(false);
    setBrandVoiceDetail(null);
    setBrandVoiceError(null);
    setOriginalityOpen(false);
    setOriginalityDetail(null);
    setOriginalityError(null);
    setQualityOpen(false);
    setQualityDetail(null);
    setQualityError(null);
    try {
      const detail = await apiRequest<ContentVersionDetail>(`${basePath}/content-generation/artifacts/${artifactId}/versions/${version}`);
      setSelected(detail);
    } catch (err) {
      setSelectedError(err instanceof ApiError ? err.message : 'Failed to load version');
    } finally {
      setSelectedBusy(false);
    }
  }

  function copyVersion(detail: ContentVersionDetail) {
    const parts: string[] = [];
    if (detail.payload.title) parts.push(detail.payload.title);
    if (detail.payload.subjectLine) parts.push(`Subject: ${detail.payload.subjectLine}`);
    if (detail.payload.hook) parts.push(`Hook: ${detail.payload.hook}`);
    if (detail.payload.content) parts.push(detail.payload.content);
    if (detail.payload.posts) parts.push(detail.payload.posts.join('\n\n'));
    if (detail.payload.scenes) parts.push(detail.payload.scenes.map((s) => s.narration).join('\n\n'));
    void navigator.clipboard.writeText(parts.join('\n\n'));
  }

  if (!artifactId || !latestVersion) return null;

  return (
    <div style={{ marginTop: 8 }}>
      <div className="tag-list">
        <span className="tag">v{latestVersion}</span>
        <QualityScoreBadge quality={latestQuality} />
        <GroundingBadge grounding={latestGrounding} />
        <FactValidationBadge factValidation={latestFactValidation} />
        <SeoReviewBadge seoReview={latestSeoReview} />
        <ReadabilityBadge readability={latestReadability} />
        <BrandVoiceBadge brandVoice={latestBrandVoice} />
        <OriginalityBadge originality={latestOriginality} />
        <button className="btn btn-secondary" onClick={toggleOpen}>
          {open ? 'Hide History' : 'History'}
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 6 }}>
          {listBusy && <Loading />}
          <ErrorMessage message={listError} />
          {versions && versions.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {versions.map((v) => (
                <li key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                  <span className="tag">v{v.version}</span>
                  <QualityScoreBadge quality={v.quality} />
                  <GroundingBadge grounding={v.grounding} />
                  <FactValidationBadge factValidation={v.factValidation} />
                  <SeoReviewBadge seoReview={v.seoReview} />
                  <ReadabilityBadge readability={v.readability} />
                  <BrandVoiceBadge brandVoice={v.brandVoice} />
                  <OriginalityBadge originality={v.originality} />
                  <span className="entity-card-meta">{generationReasonLabel(v)}</span>
                  <span className="entity-card-meta">{new Date(v.generatedAt).toLocaleString()}</span>
                  {v.wordCount !== undefined && <span className="entity-card-meta">{v.wordCount} words</span>}
                  {v.version === latestVersion && <span className="entity-card-meta">(latest)</span>}
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setImproveComparison(null);
                      setImproveError(null);
                      void viewVersion(v.version);
                    }}
                    disabled={selectedBusy}
                  >
                    View
                  </button>
                </li>
              ))}
            </ul>
          )}
          <ErrorMessage message={selectedError} />
          {selected && (
            <div style={{ marginTop: 8, padding: 10, border: '1px solid var(--border-color, #ddd)', borderRadius: 6 }}>
              <div className="tag-list">
                <span className="tag">Viewing v{selected.version}</span>
                <span className="entity-card-meta">{generationReasonLabel(selected)}</span>
                <QualityScoreBadge quality={selected.quality} />
                <GroundingBadge grounding={selected.grounding} />
                <FactValidationBadge factValidation={selected.factValidation} />
                <SeoReviewBadge seoReview={selected.seoReview} />
                <ReadabilityBadge readability={selected.readability} />
                <BrandVoiceBadge brandVoice={selected.brandVoice} />
                <OriginalityBadge originality={selected.originality} />
                <button className="btn btn-secondary" onClick={() => toggleQuality(selected.version)}>
                  {qualityOpen ? 'Hide Quality' : 'View Quality'}
                </button>
                <button className="btn btn-secondary" onClick={() => recalculateQuality(selected.version)} disabled={qualityBusy}>
                  {qualityBusy ? 'Recalculating...' : 'Recalculate Quality'}
                </button>
                <select
                  value={improveFocus}
                  onChange={(e) => setImproveFocus(e.target.value as ContentImprovementFocus)}
                  disabled={improveBusy}
                  aria-label="Improve focus"
                >
                  {IMPROVEMENT_FOCUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      Improve: {opt.label}
                    </option>
                  ))}
                </select>
                <button className="btn btn-secondary" onClick={() => improveSelectedVersion(selected)} disabled={improveBusy}>
                  {improveBusy ? 'Improving...' : 'Improve with AI'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setImproveComparison(null);
                    setImproveError(null);
                    setSelected(null);
                  }}
                >
                  View Latest
                </button>
                <button className="btn btn-secondary" onClick={() => copyVersion(selected)}>
                  Copy
                </button>
                <button className="btn btn-secondary" onClick={() => toggleGrounding(selected.version)}>
                  {groundingOpen ? 'Hide Grounding' : 'View Grounding'}
                </button>
                <button className="btn btn-secondary" onClick={() => recheckGrounding(selected.version)} disabled={groundingBusy}>
                  {groundingBusy ? 'Rechecking...' : 'Recheck Grounding'}
                </button>
                <button className="btn btn-secondary" onClick={() => toggleFactValidation(selected.version)}>
                  {factValidationOpen ? 'Hide Fact Validation' : 'View Fact Validation'}
                </button>
                <button className="btn btn-secondary" onClick={() => recheckFactValidation(selected.version)} disabled={factValidationBusy}>
                  {factValidationBusy ? 'Rechecking...' : 'Recheck Facts'}
                </button>
                <button className="btn btn-secondary" onClick={() => toggleSeoReview(selected.version)}>
                  {seoReviewOpen ? 'Hide SEO Review' : 'View SEO Review'}
                </button>
                <button className="btn btn-secondary" onClick={() => recheckSeoReview(selected.version)} disabled={seoReviewBusy}>
                  {seoReviewBusy ? 'Rechecking...' : 'Recheck SEO'}
                </button>
                <button className="btn btn-secondary" onClick={() => toggleReadability(selected.version)}>
                  {readabilityOpen ? 'Hide Readability' : 'View Readability'}
                </button>
                <button className="btn btn-secondary" onClick={() => recheckReadability(selected.version)} disabled={readabilityBusy}>
                  {readabilityBusy ? 'Rechecking...' : 'Recheck Readability'}
                </button>
                <button className="btn btn-secondary" onClick={() => toggleBrandVoice(selected.version)}>
                  {brandVoiceOpen ? 'Hide Brand Voice' : 'View Brand Voice'}
                </button>
                <button className="btn btn-secondary" onClick={() => recheckBrandVoice(selected.version)} disabled={brandVoiceBusy}>
                  {brandVoiceBusy ? 'Rechecking...' : 'Recheck Brand Voice'}
                </button>
                <button className="btn btn-secondary" onClick={() => toggleOriginality(selected.version)}>
                  {originalityOpen ? 'Hide Originality' : 'View Originality'}
                </button>
                <button className="btn btn-secondary" onClick={() => recheckOriginality(selected.version)} disabled={originalityBusy}>
                  {originalityBusy ? 'Rechecking...' : 'Recheck Originality'}
                </button>
              </div>
              {improveBusy && <Loading />}
              <ErrorMessage message={improveError} />
              {improveComparison && (
                <p className="entity-card-meta" style={{ marginTop: 6 }}>
                  Quality: v{improveComparison.fromVersion} {improveComparison.fromScore ?? '—'}
                  {' → '}
                  v{improveComparison.toVersion} {improveComparison.toScore ?? '—'}
                  {improveComparison.fromScore !== undefined && improveComparison.toScore !== undefined && improveComparison.toScore < improveComparison.fromScore
                    ? ' (decreased)'
                    : ''}
                </p>
              )}
              {qualityOpen && (
                <div style={{ marginTop: 8, padding: 8, background: 'var(--surface-muted, #f5f5f5)', borderRadius: 6, border: '1px solid var(--border-color, #ddd)' }}>
                  {qualityBusy && <Loading />}
                  <ErrorMessage message={qualityError} />
                  {!qualityBusy && !qualityDetail && !qualityError && <p className="entity-card-meta">No quality score yet.</p>}
                  {qualityDetail && (
                    <>
                      <div className="tag-list">
                        <span className="tag" style={{ fontWeight: 600 }}>
                          Overall: {qualityDetail.score} — {overallQualityStatusLabel(qualityDetail.status)}
                        </span>
                      </div>
                      <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
                        {qualityDetail.dimensions.map((d) => (
                          <li key={d.type} style={{ padding: '4px 0', borderTop: '1px solid var(--border-color, #ddd)', opacity: d.applicable ? 1 : 0.5 }}>
                            <span className="tag" style={{ marginRight: 6 }}>{labelize(d.type)}</span>
                            {d.applicable ? (
                              <span className="entity-card-meta">{d.score} × {d.weight}% = {d.weightedScore}</span>
                            ) : (
                              <span className="entity-card-meta">not applicable</span>
                            )}
                          </li>
                        ))}
                      </ul>
                      {qualityDetail.blockers.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          {qualityDetail.blockers.map((b, i) => (
                            <div key={i} className="content-warning" style={{ marginTop: 4, color: b.severity === 'high' ? 'var(--error, #b00020)' : undefined }}>
                              Quality blocker: {b.reason}
                            </div>
                          ))}
                        </div>
                      )}
                      {qualityDetail.strengths.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <strong className="entity-card-meta">Strengths</strong>
                          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                            {qualityDetail.strengths.map((s, i) => (
                              <li key={i} className="entity-card-meta">{s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {qualityDetail.weaknesses.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <strong className="entity-card-meta">Weaknesses</strong>
                          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                            {qualityDetail.weaknesses.map((w, i) => (
                              <li key={i} className="entity-card-meta">{w}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {qualityDetail.warnings.length > 0 && (
                        <div className="content-warning" style={{ marginTop: 8 }}>{qualityDetail.warnings.join(' ')}</div>
                      )}
                    </>
                  )}
                </div>
              )}
              {groundingOpen && (
                <div style={{ marginTop: 8, padding: 8, background: 'var(--surface-muted, #f5f5f5)', borderRadius: 6 }}>
                  {groundingBusy && <Loading />}
                  <ErrorMessage message={groundingError} />
                  {!groundingBusy && !groundingDetail && !groundingError && <p className="entity-card-meta">No grounding result yet.</p>}
                  {groundingDetail && (
                    <>
                      <div className="tag-list">
                        <span className="tag">Score {groundingDetail.score}</span>
                        <span className="tag">Supported {groundingDetail.supportedClaimCount}</span>
                        <span className="tag">Unsupported {groundingDetail.unsupportedClaimCount}</span>
                        <span className="tag">Uncertain {groundingDetail.uncertainClaimCount}</span>
                      </div>
                      {groundingDetail.warnings.length > 0 && (
                        <div className="content-warning" style={{ marginTop: 6 }}>{groundingDetail.warnings.join(' ')}</div>
                      )}
                      {groundingDetail.claims.length > 0 && (
                        <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
                          {groundingDetail.claims
                            .filter((c) => c.classification !== 'non_factual')
                            .map((c) => (
                              <li
                                key={c.id}
                                style={{
                                  padding: '6px 0',
                                  borderTop: '1px solid var(--border-color, #ddd)',
                                  color: c.classification === 'unsupported' ? 'var(--error, #b00020)' : undefined,
                                }}
                              >
                                <span className="tag" style={{ marginRight: 6 }}>{c.classification}</span>
                                {c.text}
                                <div className="entity-card-meta">{c.reason}</div>
                                {c.evidenceRefs.length > 0 && <div className="entity-card-meta">Evidence: {c.evidenceRefs.join('; ')}</div>}
                              </li>
                            ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              )}
              {factValidationOpen && (
                <div style={{ marginTop: 8, padding: 8, background: 'var(--surface-muted, #f5f5f5)', borderRadius: 6 }}>
                  {factValidationBusy && <Loading />}
                  <ErrorMessage message={factValidationError} />
                  {!factValidationBusy && !factValidationDetail && !factValidationError && <p className="entity-card-meta">No fact validation result yet.</p>}
                  {factValidationDetail && (
                    <>
                      <div className="tag-list">
                        <span className="tag">Score {factValidationDetail.score}</span>
                        <span className="tag">Validated {factValidationDetail.validatedClaimCount}</span>
                        <span className="tag">Review {factValidationDetail.reviewClaimCount}</span>
                        <span className="tag">Failed {factValidationDetail.failedClaimCount}</span>
                      </div>
                      {factValidationDetail.warnings.length > 0 && (
                        <div className="content-warning" style={{ marginTop: 6 }}>{factValidationDetail.warnings.join(' ')}</div>
                      )}
                      {factValidationDetail.claims.length > 0 && (
                        <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
                          {factValidationDetail.claims
                            .filter((c) => c.classification !== 'non_factual')
                            .map((c) => {
                              const highRiskInvalid = c.classification === 'invalid' && c.severity === 'high';
                              return (
                                <li
                                  key={c.id}
                                  style={{
                                    padding: '6px 0',
                                    borderTop: '1px solid var(--border-color, #ddd)',
                                    color: c.classification === 'invalid' ? 'var(--error, #b00020)' : undefined,
                                    background: highRiskInvalid ? 'var(--error-bg, #fdecea)' : undefined,
                                  }}
                                >
                                  {highRiskInvalid && (
                                    <div style={{ fontWeight: 600, color: 'var(--error, #b00020)' }}>High-risk unsupported factual claim</div>
                                  )}
                                  <span className="tag" style={{ marginRight: 6 }}>{c.classification}</span>
                                  <span className="tag" style={{ marginRight: 6 }}>{c.factType}</span>
                                  <span className="tag" style={{ marginRight: 6 }}>{c.severity}</span>
                                  {c.text}
                                  <div className="entity-card-meta">{c.reason}</div>
                                  {c.evidenceRefs.length > 0 && <div className="entity-card-meta">Evidence: {c.evidenceRefs.join('; ')}</div>}
                                </li>
                              );
                            })}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              )}
              {seoReviewOpen && (
                <div style={{ marginTop: 8, padding: 8, background: 'var(--surface-muted, #f5f5f5)', borderRadius: 6 }}>
                  {seoReviewBusy && <Loading />}
                  <ErrorMessage message={seoReviewError} />
                  {!seoReviewBusy && !seoReviewDetail && !seoReviewError && <p className="entity-card-meta">No SEO review result yet.</p>}
                  {seoReviewDetail && (
                    <>
                      <div className="tag-list">
                        <span className="tag">Score {seoReviewDetail.score}</span>
                        <span className="tag">Passed {seoReviewDetail.passedCount}</span>
                        <span className="tag">Warning {seoReviewDetail.warningCount}</span>
                        <span className="tag">Failed {seoReviewDetail.failedCount}</span>
                      </div>
                      {seoReviewDetail.warnings.length > 0 && (
                        <div className="content-warning" style={{ marginTop: 6 }}>{seoReviewDetail.warnings.join(' ')}</div>
                      )}
                      {seoReviewDetail.checks.length > 0 && (
                        <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
                          {seoReviewDetail.checks
                            .filter((c) => c.classification !== 'not_applicable')
                            .map((c) => (
                              <li
                                key={c.id}
                                style={{
                                  padding: '6px 0',
                                  borderTop: '1px solid var(--border-color, #ddd)',
                                  color: c.classification === 'failed' ? 'var(--error, #b00020)' : undefined,
                                }}
                              >
                                <span className="tag" style={{ marginRight: 6 }}>{c.classification}</span>
                                <span className="tag" style={{ marginRight: 6 }}>{c.type}</span>
                                <div className="entity-card-meta">{c.reason}</div>
                                {c.evidence && c.evidence.length > 0 && <div className="entity-card-meta">Evidence: {c.evidence.join('; ')}</div>}
                              </li>
                            ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              )}
              {readabilityOpen && (
                <div style={{ marginTop: 8, padding: 8, background: 'var(--surface-muted, #f5f5f5)', borderRadius: 6 }}>
                  {readabilityBusy && <Loading />}
                  <ErrorMessage message={readabilityError} />
                  {!readabilityBusy && !readabilityDetail && !readabilityError && <p className="entity-card-meta">No readability result yet.</p>}
                  {readabilityDetail && (
                    <>
                      <div className="tag-list">
                        <span className="tag">Score {readabilityDetail.score}</span>
                        <span className="tag">Passed {readabilityDetail.passedCount}</span>
                        <span className="tag">Warning {readabilityDetail.warningCount}</span>
                        <span className="tag">Failed {readabilityDetail.failedCount}</span>
                        <span className="tag">{readabilityDetail.metrics.sentenceCount} sentences</span>
                        <span className="tag">{readabilityDetail.metrics.paragraphCount} paragraphs</span>
                        <span className="tag">Avg {readabilityDetail.metrics.averageSentenceWords} words/sentence</span>
                      </div>
                      {readabilityDetail.warnings.length > 0 && (
                        <div className="content-warning" style={{ marginTop: 6 }}>{readabilityDetail.warnings.join(' ')}</div>
                      )}
                      {readabilityDetail.checks.length > 0 && (
                        <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
                          {readabilityDetail.checks
                            .filter((c) => c.classification !== 'not_applicable')
                            .map((c) => (
                              <li
                                key={c.id}
                                style={{
                                  padding: '6px 0',
                                  borderTop: '1px solid var(--border-color, #ddd)',
                                  color: c.classification === 'failed' ? 'var(--error, #b00020)' : undefined,
                                }}
                              >
                                <span className="tag" style={{ marginRight: 6 }}>{c.classification}</span>
                                <span className="tag" style={{ marginRight: 6 }}>{c.type}</span>
                                <div className="entity-card-meta">{c.reason}</div>
                                {c.evidence && c.evidence.length > 0 && <div className="entity-card-meta">Evidence: {c.evidence.join('; ')}</div>}
                              </li>
                            ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              )}
              {brandVoiceOpen && (
                <div style={{ marginTop: 8, padding: 8, background: 'var(--surface-muted, #f5f5f5)', borderRadius: 6 }}>
                  {brandVoiceBusy && <Loading />}
                  <ErrorMessage message={brandVoiceError} />
                  {!brandVoiceBusy && !brandVoiceDetail && !brandVoiceError && <p className="entity-card-meta">No brand voice result yet.</p>}
                  {brandVoiceDetail && (
                    <>
                      <div className="tag-list">
                        <span className="tag">Score {brandVoiceDetail.score}</span>
                        <span className="tag">Passed {brandVoiceDetail.passedCount}</span>
                        <span className="tag">Warning {brandVoiceDetail.warningCount}</span>
                        <span className="tag">Failed {brandVoiceDetail.failedCount}</span>
                      </div>
                      {brandVoiceDetail.warnings.length > 0 && (
                        <div className="content-warning" style={{ marginTop: 6 }}>{brandVoiceDetail.warnings.join(' ')}</div>
                      )}
                      {brandVoiceDetail.checks.length > 0 && (
                        <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
                          {brandVoiceDetail.checks
                            .filter((c) => c.classification !== 'not_applicable')
                            .map((c) => (
                              <li
                                key={c.id}
                                style={{
                                  padding: '6px 0',
                                  borderTop: '1px solid var(--border-color, #ddd)',
                                  color: c.classification === 'failed' ? 'var(--error, #b00020)' : undefined,
                                }}
                              >
                                <span className="tag" style={{ marginRight: 6 }}>{c.classification}</span>
                                <span className="tag" style={{ marginRight: 6 }}>{c.type}</span>
                                <div className="entity-card-meta">{c.reason}</div>
                                {c.evidence && c.evidence.length > 0 && <div className="entity-card-meta">Evidence: {c.evidence.join('; ')}</div>}
                              </li>
                            ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              )}
              {originalityOpen && (
                <div style={{ marginTop: 8, padding: 8, background: 'var(--surface-muted, #f5f5f5)', borderRadius: 6 }}>
                  {originalityBusy && <Loading />}
                  <ErrorMessage message={originalityError} />
                  <p className="entity-card-meta">Compared only with generated content stored in GIP — not the public internet.</p>
                  {!originalityBusy && !originalityDetail && !originalityError && <p className="entity-card-meta">No originality result yet.</p>}
                  {originalityDetail && (
                    <>
                      <div className="tag-list">
                        <span className="tag">Score {originalityDetail.score}</span>
                        <span className="tag">Passed {originalityDetail.passedCount}</span>
                        <span className="tag">Warning {originalityDetail.warningCount}</span>
                        <span className="tag">Failed {originalityDetail.failedCount}</span>
                        <span className="tag">Duplicate sentences {originalityDetail.duplicateSentenceCount}</span>
                        <span className="tag">Duplicate paragraphs {originalityDetail.duplicateParagraphCount}</span>
                        <span className="tag">Cross-content matches {originalityDetail.crossContentMatchCount}</span>
                      </div>
                      {originalityDetail.warnings.length > 0 && (
                        <div className="content-warning" style={{ marginTop: 6 }}>{originalityDetail.warnings.join(' ')}</div>
                      )}
                      {originalityDetail.checks.length > 0 && (
                        <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
                          {originalityDetail.checks
                            .filter((c) => c.classification !== 'not_applicable')
                            .map((c) => (
                              <li
                                key={c.id}
                                style={{
                                  padding: '6px 0',
                                  borderTop: '1px solid var(--border-color, #ddd)',
                                  color: c.classification === 'failed' ? 'var(--error, #b00020)' : undefined,
                                }}
                              >
                                <span className="tag" style={{ marginRight: 6 }}>{c.classification}</span>
                                <span className="tag" style={{ marginRight: 6 }}>{c.type}</span>
                                <div className="entity-card-meta">{c.reason}</div>
                                {(c.matchedArtifactId || c.matchedVersionId) && (
                                  <div className="entity-card-meta">
                                    Matched artifact: {c.matchedArtifactId ?? '—'}{c.matchedVersionId ? ` (version id ${c.matchedVersionId})` : ''}
                                  </div>
                                )}
                                {c.evidence && c.evidence.length > 0 && <div className="entity-card-meta">Evidence: {c.evidence.join('; ')}</div>}
                              </li>
                            ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              )}
              {selected.payload.title && <p style={{ marginTop: 6 }}><strong>{selected.payload.title}</strong></p>}
              {selected.payload.subjectLine && <p>Subject: {selected.payload.subjectLine}</p>}
              {selected.payload.hook && <p>Hook: {selected.payload.hook}</p>}
              {selected.payload.content && (
                <pre
                  style={{
                    marginTop: 6,
                    padding: 10,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxHeight: 260,
                    overflowY: 'auto',
                    background: 'var(--surface-muted, #f5f5f5)',
                    borderRadius: 6,
                  }}
                >
                  {selected.payload.content}
                </pre>
              )}
              {selected.payload.posts && (
                <ol style={{ marginTop: 6 }}>
                  {selected.payload.posts.map((p, i) => (
                    <li key={i} style={{ whiteSpace: 'pre-wrap', marginBottom: 6 }}>
                      {p}
                    </li>
                  ))}
                </ol>
              )}
              {selected.payload.scenes && (
                <ol style={{ marginTop: 6 }}>
                  {selected.payload.scenes.map((s) => (
                    <li key={s.order} style={{ marginBottom: 6 }}>
                      {s.heading ? `${s.heading}: ` : ''}
                      {s.narration}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Shared by every newsletter source location (Blog Calendar, Content
// Pillar) — state stays lifted to the parent, keyed by `${sourceType}:${sourceId}`,
// so newsletter drafts never collide with each other or with any other
// platform's generation state.
function NewsletterGenerationPanel({
  basePath,
  draft,
  busy,
  error,
  options,
  onOptionsChange,
  onGenerate,
  onCopySubject,
  onCopyBody,
  onCopyFull,
}: {
  basePath: string;
  draft: NewsletterDraftResult | undefined;
  busy: boolean;
  error: string | null;
  options: NewsletterGenerationOptions;
  onOptionsChange: (patch: Partial<NewsletterGenerationOptions>) => void;
  onGenerate: () => void;
  onCopySubject: (subject: string) => void;
  onCopyBody: (content: string) => void;
  onCopyFull: () => void;
}) {
  return (
    <div style={{ marginTop: 10 }}>
      <ErrorMessage message={error} />
      {!draft && <p className="entity-card-meta">AI generation uses your configured provider and may incur usage cost.</p>}

      <div className="form-inline">
        <div className="field" style={{ marginBottom: 0 }}>
          <select value={options.tone} onChange={(e) => onOptionsChange({ tone: e.target.value as NewsletterGenerationOptions['tone'] })}>
            <option value="professional">Professional</option>
            <option value="conversational">Conversational</option>
            <option value="educational">Educational</option>
            <option value="thought_leadership">Thought Leadership</option>
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <select value={options.length} onChange={(e) => onOptionsChange({ length: e.target.value as NewsletterGenerationOptions['length'] })}>
            <option value="short">Short</option>
            <option value="medium">Medium</option>
            <option value="long">Long</option>
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <select value={options.outputFormat} onChange={(e) => onOptionsChange({ outputFormat: e.target.value as NewsletterGenerationOptions['outputFormat'] })}>
            <option value="markdown">Markdown</option>
            <option value="plain_text">Plain Text</option>
          </select>
        </div>
        <label className="entity-card-meta" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={!!options.includeSubjectLine} onChange={(e) => onOptionsChange({ includeSubjectLine: e.target.checked })} />
          Include subject
        </label>
        <label className="entity-card-meta" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={!!options.includePreheader} onChange={(e) => onOptionsChange({ includePreheader: e.target.checked })} />
          Include preheader
        </label>
        <label className="entity-card-meta" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={!!options.includeCTA} onChange={(e) => onOptionsChange({ includeCTA: e.target.checked })} />
          Include CTA
        </label>
      </div>

      <button className="btn btn-secondary" onClick={onGenerate} disabled={busy}>
        {busy ? 'Generating newsletter...' : draft ? 'Regenerate Newsletter' : 'Generate Newsletter'}
      </button>

      {draft && (
        <div style={{ marginTop: 10 }}>
          <div className="tag-list">
            <span className="tag">{draft.wordCount} words</span>
            <span className="tag">{draft.characterCount} chars</span>
            <span className="tag">{labelize(draft.tone)}</span>
            <span className="tag">{labelize(draft.length)}</span>
            <span className="tag">{draft.provider} / {draft.model}</span>
            {draft.usage.totalTokens !== undefined && <span className="tag">{draft.usage.totalTokens} tokens</span>}
            {draft.cost && <span className="tag">${draft.cost.estimated.toFixed(4)} {draft.cost.currency}</span>}
            <span className="tag">Prompt {draft.promptVersion}</span>
          </div>
          <div className="entity-card-meta">Generated {new Date(draft.generatedAt).toLocaleString()}</div>
          {draft.warnings.length > 0 && <div className="content-warning" style={{ marginTop: 6 }}>{draft.warnings.join(' ')}</div>}

          {draft.subjectLine && (
            <>
              <span className="summary-label" style={{ marginTop: 8, display: 'block' }}>
                Subject
              </span>
              <p>{draft.subjectLine}</p>
              <button className="btn btn-secondary" onClick={() => onCopySubject(draft.subjectLine!)}>
                Copy Subject
              </button>
            </>
          )}
          {draft.preheader && (
            <>
              <span className="summary-label" style={{ marginTop: 8, display: 'block' }}>
                Preheader
              </span>
              <p>{draft.preheader}</p>
            </>
          )}
          <span className="summary-label" style={{ marginTop: 8, display: 'block' }}>
            Body
          </span>
          <pre
            style={{
              marginTop: 4,
              padding: 10,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 320,
              overflowY: 'auto',
              background: 'var(--surface-muted, #f5f5f5)',
              borderRadius: 6,
            }}
          >
            {draft.content}
          </pre>
          <div className="tag-list" style={{ marginTop: 6 }}>
            <button className="btn btn-secondary" onClick={() => onCopyBody(draft.content)}>
              Copy Body
            </button>
            <button className="btn btn-secondary" onClick={onCopyFull}>
              Copy Full Newsletter
            </button>
          </div>
          <ContentVersionHistory basePath={basePath} artifactId={draft.artifactId} latestVersion={draft.version} />
        </div>
      )}
    </div>
  );
}

// 15J — hydration mapping. The campaign-wide artifacts fetch returns the
// generic ContentVersionDetail shape; these map it back into each kind's
// own specific DraftResult type so drafts survive a page refresh without
// changing anything about how the per-kind panels already render them.
function mapVersionToBlogDraft(sourceId: string, v: ContentVersionDetail): BlogDraftResult {
  return {
    id: v.id,
    kind: 'blog',
    blogCalendarItemId: sourceId,
    title: v.payload.title ?? '',
    content: v.payload.content ?? '',
    format: (v.payload.format as BlogDraftResult['format']) ?? 'markdown',
    wordCount: v.payload.wordCount ?? 0,
    provider: v.generationMetadata.provider,
    model: v.generationMetadata.model,
    usage: v.generationMetadata.usage ?? {},
    cost: v.generationMetadata.cost,
    promptVersion: v.generationMetadata.promptVersion,
    sourceContext: v.generationMetadata.sourceContext ?? {},
    warnings: v.generationMetadata.warnings,
    generatedAt: v.generatedAt,
    artifactId: v.artifactId,
    versionId: v.id,
    version: v.version,
  };
}

function mapVersionToLinkedInDraft(sourceId: string, v: ContentVersionDetail): LinkedInDraftResult {
  return {
    id: v.id,
    kind: 'linkedin',
    socialCalendarItemId: sourceId,
    content: v.payload.content ?? '',
    characterCount: v.payload.characterCount ?? 0,
    wordCount: v.payload.wordCount ?? 0,
    tone: v.generationOptions?.tone ?? '',
    length: v.generationOptions?.length ?? '',
    provider: v.generationMetadata.provider,
    model: v.generationMetadata.model,
    usage: v.generationMetadata.usage ?? {},
    cost: v.generationMetadata.cost,
    promptVersion: v.generationMetadata.promptVersion,
    sourceContext: v.generationMetadata.sourceContext ?? {},
    warnings: v.generationMetadata.warnings,
    generatedAt: v.generatedAt,
    artifactId: v.artifactId,
    versionId: v.id,
    version: v.version,
  };
}

function mapVersionToXDraft(sourceId: string, v: ContentVersionDetail): XDraftResult {
  return {
    id: v.id,
    kind: 'x',
    socialCalendarItemId: sourceId,
    mode: (v.payload.mode as XDraftResult['mode']) ?? 'single_post',
    content: v.payload.content,
    posts: v.payload.posts,
    characterCount: v.payload.characterCount,
    postCharacterCounts: v.payload.postCharacterCounts,
    wordCount: v.payload.wordCount ?? 0,
    tone: v.generationOptions?.tone ?? '',
    provider: v.generationMetadata.provider,
    model: v.generationMetadata.model,
    usage: v.generationMetadata.usage ?? {},
    cost: v.generationMetadata.cost,
    promptVersion: v.generationMetadata.promptVersion,
    sourceContext: v.generationMetadata.sourceContext ?? {},
    warnings: v.generationMetadata.warnings,
    generatedAt: v.generatedAt,
    artifactId: v.artifactId,
    versionId: v.id,
    version: v.version,
  };
}

function mapVersionToFacebookDraft(sourceId: string, v: ContentVersionDetail): FacebookDraftResult {
  return {
    id: v.id,
    kind: 'facebook',
    socialCalendarItemId: sourceId,
    content: v.payload.content ?? '',
    characterCount: v.payload.characterCount ?? 0,
    wordCount: v.payload.wordCount ?? 0,
    tone: v.generationOptions?.tone ?? '',
    length: v.generationOptions?.length ?? '',
    provider: v.generationMetadata.provider,
    model: v.generationMetadata.model,
    usage: v.generationMetadata.usage ?? {},
    cost: v.generationMetadata.cost,
    promptVersion: v.generationMetadata.promptVersion,
    sourceContext: v.generationMetadata.sourceContext ?? {},
    warnings: v.generationMetadata.warnings,
    generatedAt: v.generatedAt,
    artifactId: v.artifactId,
    versionId: v.id,
    version: v.version,
  };
}

function mapVersionToInstagramCaption(sourceId: string, v: ContentVersionDetail): InstagramCaptionResult {
  return {
    id: v.id,
    kind: 'instagram',
    socialCalendarItemId: sourceId,
    content: v.payload.content ?? '',
    characterCount: v.payload.characterCount ?? 0,
    wordCount: v.payload.wordCount ?? 0,
    tone: v.generationOptions?.tone ?? '',
    length: v.generationOptions?.length ?? '',
    hashtagCount: v.payload.hashtagCount ?? 0,
    emojiCount: v.payload.emojiCount ?? 0,
    provider: v.generationMetadata.provider,
    model: v.generationMetadata.model,
    usage: v.generationMetadata.usage ?? {},
    cost: v.generationMetadata.cost,
    promptVersion: v.generationMetadata.promptVersion,
    sourceContext: v.generationMetadata.sourceContext ?? {},
    warnings: v.generationMetadata.warnings,
    generatedAt: v.generatedAt,
    artifactId: v.artifactId,
    versionId: v.id,
    version: v.version,
  };
}

function mapVersionToNewsletterDraft(sourceType: NewsletterSourceType, sourceId: string, v: ContentVersionDetail): NewsletterDraftResult {
  return {
    id: v.id,
    kind: 'newsletter',
    sourceType,
    sourceId,
    subjectLine: v.payload.subjectLine,
    preheader: v.payload.preheader,
    content: v.payload.content ?? '',
    format: (v.payload.format as NewsletterDraftResult['format']) ?? 'markdown',
    wordCount: v.payload.wordCount ?? 0,
    characterCount: v.payload.characterCount ?? 0,
    tone: v.generationOptions?.tone ?? '',
    length: v.generationOptions?.length ?? '',
    provider: v.generationMetadata.provider,
    model: v.generationMetadata.model,
    usage: v.generationMetadata.usage ?? {},
    cost: v.generationMetadata.cost,
    promptVersion: v.generationMetadata.promptVersion,
    sourceContext: v.generationMetadata.sourceContext ?? {},
    warnings: v.generationMetadata.warnings,
    generatedAt: v.generatedAt,
    artifactId: v.artifactId,
    versionId: v.id,
    version: v.version,
  };
}

function mapVersionToVideoScript(sourceId: string, v: ContentVersionDetail): VideoScriptDraftResult {
  return {
    id: v.id,
    kind: 'video_script',
    videoCalendarItemId: sourceId,
    title: v.payload.title ?? '',
    hook: v.payload.hook,
    script: v.payload.content ?? '',
    scenes: v.payload.scenes,
    estimatedWordCount: v.payload.estimatedWordCount ?? 0,
    estimatedDurationSeconds: v.payload.estimatedDurationSeconds ?? 0,
    tone: v.generationOptions?.tone ?? '',
    duration: v.generationOptions?.duration ?? '',
    format: (v.payload.format as VideoScriptDraftResult['format']) ?? 'markdown',
    provider: v.generationMetadata.provider,
    model: v.generationMetadata.model,
    usage: v.generationMetadata.usage ?? {},
    cost: v.generationMetadata.cost,
    promptVersion: v.generationMetadata.promptVersion,
    sourceContext: v.generationMetadata.sourceContext ?? {},
    warnings: v.generationMetadata.warnings,
    generatedAt: v.generatedAt,
    artifactId: v.artifactId,
    versionId: v.id,
    version: v.version,
  };
}

export default function CampaignDetailPage() {
  const { organizationId, productId, campaignId } = useParams<{ organizationId: string; productId: string; campaignId: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editingOverview, setEditingOverview] = useState(false);
  const [overviewForm, setOverviewForm] = useState({ name: '', description: '', type: '', status: '', startDate: '', endDate: '' });
  const [savingOverview, setSavingOverview] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const [goalBusy, setGoalBusy] = useState<'deriving' | 'saving' | null>(null);
  const [goalError, setGoalError] = useState<string | null>(null);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalForm, setGoalForm] = useState({ type: 'awareness', title: '', description: '', successSignals: '' });

  const [mappingBusy, setMappingBusy] = useState<'deriving' | 'saving' | null>(null);
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [showMappingForm, setShowMappingForm] = useState(false);
  const [mappingForm, setMappingForm] = useState({ audienceSegmentIds: '', channelIds: '', primaryAudienceSegmentId: '', primaryChannel: '' });

  const [planBusy, setPlanBusy] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [calendarView, setCalendarView] = useState<'calendar' | 'list'>('calendar');

  const [reviewBusy, setReviewBusy] = useState<'saving' | 'approving' | 'requesting' | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSavedMessage, setReviewSavedMessage] = useState<string | null>(null);
  const [sectionDrafts, setSectionDrafts] = useState<Record<CampaignReviewSection, { status: CampaignSectionReviewStatus; note: string }>>(
    () => Object.fromEntries(CAMPAIGN_REVIEW_SECTION_LIST.map((s) => [s.key, { status: 'pending', note: '' }])) as Record<CampaignReviewSection, { status: CampaignSectionReviewStatus; note: string }>,
  );
  const [overallNoteDraft, setOverallNoteDraft] = useState('');

  const [contentIdeas, setContentIdeas] = useState<ContentIdeaResult | null>(null);
  const [contentIdeasBusy, setContentIdeasBusy] = useState(false);
  const [contentIdeasError, setContentIdeasError] = useState<string | null>(null);
  const [ideaChannelFilter, setIdeaChannelFilter] = useState('');
  const [ideaFunnelStageFilter, setIdeaFunnelStageFilter] = useState('');
  const [ideaTypeFilter, setIdeaTypeFilter] = useState('');
  const [showAllIdeas, setShowAllIdeas] = useState(false);

  const [topics, setTopics] = useState<TopicPrioritizationResult | null>(null);
  const [topicsBusy, setTopicsBusy] = useState(false);
  const [topicsError, setTopicsError] = useState<string | null>(null);
  const [topicTierFilter, setTopicTierFilter] = useState('');
  const [topicChannelFilter, setTopicChannelFilter] = useState('');
  const [topicFunnelStageFilter, setTopicFunnelStageFilter] = useState('');

  const [pillarPlan, setPillarPlan] = useState<ContentPillarPlanResult | null>(null);
  const [pillarPlanBusy, setPillarPlanBusy] = useState(false);
  const [pillarPlanError, setPillarPlanError] = useState<string | null>(null);

  const [blogCalendar, setBlogCalendar] = useState<BlogCalendarResult | null>(null);
  const [blogCalendarBusy, setBlogCalendarBusy] = useState(false);
  const [blogCalendarError, setBlogCalendarError] = useState<string | null>(null);
  const [blogDrafts, setBlogDrafts] = useState<Record<string, BlogDraftResult>>({});
  const [blogDraftBusyIds, setBlogDraftBusyIds] = useState<Record<string, boolean>>({});
  const [blogDraftErrors, setBlogDraftErrors] = useState<Record<string, string | null>>({});

  const [socialCalendar, setSocialCalendar] = useState<SocialCalendarResult | null>(null);
  const [socialCalendarBusy, setSocialCalendarBusy] = useState(false);
  const [socialCalendarError, setSocialCalendarError] = useState<string | null>(null);
  const [socialPlatformFilter, setSocialPlatformFilter] = useState('');
  const [socialTypeFilter, setSocialTypeFilter] = useState('');
  const [socialFunnelStageFilter, setSocialFunnelStageFilter] = useState('');
  const [linkedInDrafts, setLinkedInDrafts] = useState<Record<string, LinkedInDraftResult>>({});
  const [linkedInBusyIds, setLinkedInBusyIds] = useState<Record<string, boolean>>({});
  const [linkedInErrors, setLinkedInErrors] = useState<Record<string, string | null>>({});
  const [linkedInOptionsById, setLinkedInOptionsById] = useState<Record<string, LinkedInGenerationOptions>>({});
  const [xDrafts, setXDrafts] = useState<Record<string, XDraftResult>>({});
  const [xBusyIds, setXBusyIds] = useState<Record<string, boolean>>({});
  const [xErrors, setXErrors] = useState<Record<string, string | null>>({});
  const [xOptionsById, setXOptionsById] = useState<Record<string, XGenerationOptions>>({});
  const [facebookDrafts, setFacebookDrafts] = useState<Record<string, FacebookDraftResult>>({});
  const [facebookBusyIds, setFacebookBusyIds] = useState<Record<string, boolean>>({});
  const [facebookErrors, setFacebookErrors] = useState<Record<string, string | null>>({});
  const [facebookOptionsById, setFacebookOptionsById] = useState<Record<string, FacebookGenerationOptions>>({});
  const [instagramCaptions, setInstagramCaptions] = useState<Record<string, InstagramCaptionResult>>({});
  const [instagramBusyIds, setInstagramBusyIds] = useState<Record<string, boolean>>({});
  const [instagramErrors, setInstagramErrors] = useState<Record<string, string | null>>({});
  const [instagramOptionsById, setInstagramOptionsById] = useState<Record<string, InstagramGenerationOptions>>({});
  const [newsletterDrafts, setNewsletterDrafts] = useState<Record<string, NewsletterDraftResult>>({});
  const [newsletterBusyKeys, setNewsletterBusyKeys] = useState<Record<string, boolean>>({});
  const [newsletterErrors, setNewsletterErrors] = useState<Record<string, string | null>>({});
  const [newsletterOptionsByKey, setNewsletterOptionsByKey] = useState<Record<string, NewsletterGenerationOptions>>({});
  const [videoScripts, setVideoScripts] = useState<Record<string, VideoScriptDraftResult>>({});
  const [videoScriptBusyIds, setVideoScriptBusyIds] = useState<Record<string, boolean>>({});
  const [videoScriptErrors, setVideoScriptErrors] = useState<Record<string, string | null>>({});
  const [videoScriptOptionsById, setVideoScriptOptionsById] = useState<Record<string, VideoScriptGenerationOptions>>({});

  const [videoCalendar, setVideoCalendar] = useState<VideoCalendarResult | null>(null);
  const [videoCalendarBusy, setVideoCalendarBusy] = useState(false);
  const [videoCalendarError, setVideoCalendarError] = useState<string | null>(null);
  const [videoTypeFilter, setVideoTypeFilter] = useState('');
  const [videoFormatFilter, setVideoFormatFilter] = useState('');
  const [videoFunnelStageFilter, setVideoFunnelStageFilter] = useState('');

  const [repurposingPlan, setRepurposingPlan] = useState<RepurposingPlanResult | null>(null);
  const [repurposingBusy, setRepurposingBusy] = useState(false);
  const [repurposingError, setRepurposingError] = useState<string | null>(null);
  const [repurposingSourceFilter, setRepurposingSourceFilter] = useState('');
  const [repurposingTargetFilter, setRepurposingTargetFilter] = useState('');
  const [repurposingFunnelStageFilter, setRepurposingFunnelStageFilter] = useState('');
  const [repurposingView, setRepurposingView] = useState<'chains' | 'items'>('chains');

  const basePath = `/organizations/${organizationId}/products/${productId}/campaigns/${campaignId}`;

  async function loadData() {
    if (!organizationId || !productId || !campaignId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiRequest<Campaign>(basePath);
      setCampaign(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load campaign');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, productId, campaignId]);

  // 15J — one campaign-wide fetch of every persisted artifact + its latest
  // version, so previously generated drafts survive a page refresh without
  // an N+1 request per calendar item. Never rebuilds Growth Strategy; this
  // only reads what content-generation already persisted.
  useEffect(() => {
    if (!organizationId || !productId || !campaignId) return;
    (async () => {
      try {
        const artifacts = await apiRequest<ArtifactWithLatestVersion[]>(`${basePath}/content-generation/artifacts`);
        const blog: Record<string, BlogDraftResult> = {};
        const linkedin: Record<string, LinkedInDraftResult> = {};
        const x: Record<string, XDraftResult> = {};
        const facebook: Record<string, FacebookDraftResult> = {};
        const instagram: Record<string, InstagramCaptionResult> = {};
        const newsletter: Record<string, NewsletterDraftResult> = {};
        const videoScript: Record<string, VideoScriptDraftResult> = {};

        for (const { artifact, latestVersion } of artifacts) {
          if (!latestVersion) continue;
          switch (artifact.kind) {
            case 'blog':
              blog[artifact.sourceId] = mapVersionToBlogDraft(artifact.sourceId, latestVersion);
              break;
            case 'linkedin':
              linkedin[artifact.sourceId] = mapVersionToLinkedInDraft(artifact.sourceId, latestVersion);
              break;
            case 'x':
              x[artifact.sourceId] = mapVersionToXDraft(artifact.sourceId, latestVersion);
              break;
            case 'facebook':
              facebook[artifact.sourceId] = mapVersionToFacebookDraft(artifact.sourceId, latestVersion);
              break;
            case 'instagram':
              instagram[artifact.sourceId] = mapVersionToInstagramCaption(artifact.sourceId, latestVersion);
              break;
            case 'newsletter':
              newsletter[newsletterKey(artifact.sourceType as NewsletterSourceType, artifact.sourceId)] = mapVersionToNewsletterDraft(
                artifact.sourceType as NewsletterSourceType,
                artifact.sourceId,
                latestVersion,
              );
              break;
            case 'video_script':
              videoScript[artifact.sourceId] = mapVersionToVideoScript(artifact.sourceId, latestVersion);
              break;
          }
        }

        if (Object.keys(blog).length > 0) setBlogDrafts((prev) => ({ ...blog, ...prev }));
        if (Object.keys(linkedin).length > 0) setLinkedInDrafts((prev) => ({ ...linkedin, ...prev }));
        if (Object.keys(x).length > 0) setXDrafts((prev) => ({ ...x, ...prev }));
        if (Object.keys(facebook).length > 0) setFacebookDrafts((prev) => ({ ...facebook, ...prev }));
        if (Object.keys(instagram).length > 0) setInstagramCaptions((prev) => ({ ...instagram, ...prev }));
        if (Object.keys(newsletter).length > 0) setNewsletterDrafts((prev) => ({ ...newsletter, ...prev }));
        if (Object.keys(videoScript).length > 0) setVideoScripts((prev) => ({ ...videoScript, ...prev }));
      } catch {
        // Hydration is a best-effort convenience (drafts surviving a page
        // refresh) — a failure here must never block the rest of the page.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, productId, campaignId]);

  // Initialize the review draft from persisted state once per campaign load
  // (not on every subsequent update) so unrelated actions elsewhere on the
  // page never clobber an in-progress, unsaved review edit.
  useEffect(() => {
    if (!campaign) return;
    setSectionDrafts(
      Object.fromEntries(
        CAMPAIGN_REVIEW_SECTION_LIST.map((s) => {
          const existing = campaign.review.sectionReviews.find((sr) => sr.section === s.key);
          return [s.key, { status: existing?.status ?? 'pending', note: existing?.note ?? '' }];
        }),
      ) as Record<CampaignReviewSection, { status: CampaignSectionReviewStatus; note: string }>,
    );
    setOverallNoteDraft(campaign.review.overallNote ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.id]);

  function startEditOverview() {
    if (!campaign) return;
    setOverviewForm({
      name: campaign.name,
      description: campaign.description ?? '',
      type: campaign.type ?? '',
      status: campaign.status,
      startDate: campaign.startDate ? campaign.startDate.slice(0, 10) : '',
      endDate: campaign.endDate ? campaign.endDate.slice(0, 10) : '',
    });
    setOverviewError(null);
    setEditingOverview(true);
  }

  async function handleSaveOverview(e: FormEvent) {
    e.preventDefault();
    setSavingOverview(true);
    setOverviewError(null);
    try {
      const body: Record<string, unknown> = {
        name: overviewForm.name,
        description: overviewForm.description,
        type: overviewForm.type || undefined,
        status: overviewForm.status,
        startDate: overviewForm.startDate ? new Date(overviewForm.startDate).toISOString() : undefined,
        endDate: overviewForm.endDate ? new Date(overviewForm.endDate).toISOString() : undefined,
      };
      const updated = await apiRequest<Campaign>(basePath, { method: 'PATCH', body });
      setCampaign(updated);
      setEditingOverview(false);
    } catch (err) {
      setOverviewError(err instanceof ApiError ? err.message : 'Failed to update campaign');
    } finally {
      setSavingOverview(false);
    }
  }

  async function handleDeriveGoal() {
    setGoalBusy('deriving');
    setGoalError(null);
    try {
      const updated = await apiRequest<Campaign>(`${basePath}/goal/derive`, { method: 'POST', body: {} });
      setCampaign(updated);
      setShowGoalForm(false);
    } catch (err) {
      setGoalError(err instanceof ApiError ? err.message : 'Failed to derive campaign goal');
    } finally {
      setGoalBusy(null);
    }
  }

  function startEditGoal() {
    if (campaign?.goal) {
      setGoalForm({
        type: campaign.goal.type,
        title: campaign.goal.title,
        description: campaign.goal.description,
        successSignals: campaign.goal.successSignals.join(', '),
      });
    }
    setGoalError(null);
    setShowGoalForm(true);
  }

  async function handleSaveGoal(e: FormEvent) {
    e.preventDefault();
    setGoalBusy('saving');
    setGoalError(null);
    try {
      const body = {
        type: goalForm.type,
        title: goalForm.title,
        description: goalForm.description || undefined,
        successSignals: splitCsv(goalForm.successSignals),
      };
      const updated = await apiRequest<Campaign>(`${basePath}/goal`, { method: 'PATCH', body });
      setCampaign(updated);
      setShowGoalForm(false);
    } catch (err) {
      setGoalError(err instanceof ApiError ? err.message : 'Failed to save campaign goal');
    } finally {
      setGoalBusy(null);
    }
  }

  async function handleDeriveMapping() {
    setMappingBusy('deriving');
    setMappingError(null);
    try {
      const updated = await apiRequest<Campaign>(`${basePath}/audience-channel/derive`, { method: 'POST', body: {} });
      setCampaign(updated);
      setShowMappingForm(false);
    } catch (err) {
      setMappingError(err instanceof ApiError ? err.message : 'Failed to derive audience/channel mapping');
    } finally {
      setMappingBusy(null);
    }
  }

  function startEditMapping() {
    if (campaign?.audienceChannelMapping) {
      setMappingForm({
        audienceSegmentIds: campaign.audienceChannelMapping.audiences.map((a) => a.audienceSegmentId).join(', '),
        channelIds: campaign.audienceChannelMapping.channels.map((c) => c.channel).join(', '),
        primaryAudienceSegmentId: campaign.audienceChannelMapping.primaryAudienceSegmentId ?? '',
        primaryChannel: campaign.audienceChannelMapping.primaryChannel ?? '',
      });
    }
    setMappingError(null);
    setShowMappingForm(true);
  }

  async function handleSaveMapping(e: FormEvent) {
    e.preventDefault();
    setMappingBusy('saving');
    setMappingError(null);
    try {
      const body = {
        audienceSegmentIds: splitCsv(mappingForm.audienceSegmentIds),
        channelIds: splitCsv(mappingForm.channelIds),
        primaryAudienceSegmentId: mappingForm.primaryAudienceSegmentId || undefined,
        primaryChannel: mappingForm.primaryChannel || undefined,
      };
      const updated = await apiRequest<Campaign>(`${basePath}/audience-channel`, { method: 'PATCH', body });
      setCampaign(updated);
      setShowMappingForm(false);
    } catch (err) {
      setMappingError(err instanceof ApiError ? err.message : 'Failed to save audience/channel mapping');
    } finally {
      setMappingBusy(null);
    }
  }

  async function handleGeneratePlan() {
    setPlanBusy(true);
    setPlanError(null);
    try {
      const updated = await apiRequest<Campaign>(`${basePath}/plan/generate`, { method: 'POST', body: {} });
      setCampaign(updated);
      setConfirmRegenerate(false);
    } catch (err) {
      setPlanError(err instanceof ApiError ? err.message : 'Failed to generate campaign plan');
    } finally {
      setPlanBusy(false);
    }
  }

  async function handleSaveReview() {
    setReviewBusy('saving');
    setReviewError(null);
    setReviewSavedMessage(null);
    try {
      const body = {
        overallNote: overallNoteDraft || undefined,
        sectionReviews: CAMPAIGN_REVIEW_SECTION_LIST.map((s) => ({
          section: s.key,
          status: sectionDrafts[s.key].status,
          note: sectionDrafts[s.key].note || undefined,
        })),
      };
      const updated = await apiRequest<Campaign>(`${basePath}/review`, { method: 'PATCH', body });
      setCampaign(updated);
      setReviewSavedMessage('Review saved.');
    } catch (err) {
      setReviewError(err instanceof ApiError ? err.message : 'Failed to save review');
    } finally {
      setReviewBusy(null);
    }
  }

  async function handleApproveCampaign() {
    setReviewBusy('approving');
    setReviewError(null);
    setReviewSavedMessage(null);
    try {
      const updated = await apiRequest<Campaign>(`${basePath}/review/approve`, { method: 'POST', body: {} });
      setCampaign(updated);
    } catch (err) {
      setReviewError(err instanceof ApiError ? err.message : 'Failed to approve campaign');
    } finally {
      setReviewBusy(null);
    }
  }

  async function handleRequestChanges() {
    setReviewBusy('requesting');
    setReviewError(null);
    setReviewSavedMessage(null);
    try {
      const updated = await apiRequest<Campaign>(`${basePath}/review/request-changes`, { method: 'POST', body: { note: overallNoteDraft || undefined } });
      setCampaign(updated);
    } catch (err) {
      setReviewError(err instanceof ApiError ? err.message : 'Failed to request changes');
    } finally {
      setReviewBusy(null);
    }
  }

  async function handleGenerateContentIdeas() {
    setContentIdeasBusy(true);
    setContentIdeasError(null);
    try {
      const result = await apiRequest<ContentIdeaResult>(`${basePath}/content-planning/ideas-preview`, { method: 'POST', body: {} });
      setContentIdeas(result);
      setShowAllIdeas(false);
    } catch (err) {
      setContentIdeasError(err instanceof ApiError ? err.message : 'Failed to generate content ideas');
    } finally {
      setContentIdeasBusy(false);
    }
  }

  async function handlePrioritizeTopics() {
    setTopicsBusy(true);
    setTopicsError(null);
    try {
      const result = await apiRequest<TopicPrioritizationResult>(`${basePath}/content-planning/topics-preview`, { method: 'POST', body: {} });
      setTopics(result);
    } catch (err) {
      setTopicsError(err instanceof ApiError ? err.message : 'Failed to prioritize content topics');
    } finally {
      setTopicsBusy(false);
    }
  }

  async function handleBuildContentPillars() {
    setPillarPlanBusy(true);
    setPillarPlanError(null);
    try {
      const result = await apiRequest<ContentPillarPlanResult>(`${basePath}/content-planning/pillars-preview`, { method: 'POST', body: {} });
      setPillarPlan(result);
    } catch (err) {
      setPillarPlanError(err instanceof ApiError ? err.message : 'Failed to build content pillars');
    } finally {
      setPillarPlanBusy(false);
    }
  }

  async function handleBuildBlogCalendar() {
    setBlogCalendarBusy(true);
    setBlogCalendarError(null);
    try {
      const result = await apiRequest<BlogCalendarResult>(`${basePath}/content-planning/blog-calendar-preview`, { method: 'POST', body: {} });
      setBlogCalendar(result);
    } catch (err) {
      setBlogCalendarError(err instanceof ApiError ? err.message : 'Failed to build blog calendar');
    } finally {
      setBlogCalendarBusy(false);
    }
  }

  // One click = one paid AI call. Regeneration requires explicit confirmation.
  async function generateBlogDraft(blogCalendarItemId: string, options?: BlogGenerationOptions): Promise<BlogDraftResult> {
    return apiRequest<BlogDraftResult>(`${basePath}/content-generation/blog/${blogCalendarItemId}`, { method: 'POST', body: options ?? {} });
  }

  async function handleGenerateBlogDraft(blogCalendarItemId: string, isRegenerate: boolean) {
    if (isRegenerate) {
      const confirmed = window.confirm(REGENERATE_CONFIRM_MESSAGE);
      if (!confirmed) return;
    }
    setBlogDraftBusyIds((prev) => ({ ...prev, [blogCalendarItemId]: true }));
    setBlogDraftErrors((prev) => ({ ...prev, [blogCalendarItemId]: null }));
    try {
      const result = await generateBlogDraft(blogCalendarItemId);
      setBlogDrafts((prev) => ({ ...prev, [blogCalendarItemId]: result }));
    } catch (err) {
      setBlogDraftErrors((prev) => ({ ...prev, [blogCalendarItemId]: err instanceof ApiError ? err.message : 'Failed to generate blog draft' }));
    } finally {
      setBlogDraftBusyIds((prev) => ({ ...prev, [blogCalendarItemId]: false }));
    }
  }

  function handleCopyBlogDraft(content: string) {
    void navigator.clipboard.writeText(content);
  }

  function getLinkedInOptions(item: SocialCalendarItem): LinkedInGenerationOptions {
    return linkedInOptionsById[item.id] ?? { tone: 'professional', length: 'medium', includeCTA: !!item.suggestedCTA, includeHashtags: false, maxHashtags: 3 };
  }

  function updateLinkedInOptions(item: SocialCalendarItem, patch: Partial<LinkedInGenerationOptions>) {
    setLinkedInOptionsById((prev) => ({ ...prev, [item.id]: { ...getLinkedInOptions(item), ...patch } }));
  }

  async function generateLinkedInDraft(socialCalendarItemId: string, options?: LinkedInGenerationOptions): Promise<LinkedInDraftResult> {
    return apiRequest<LinkedInDraftResult>(`${basePath}/content-generation/linkedin/${socialCalendarItemId}`, { method: 'POST', body: options ?? {} });
  }

  async function handleGenerateLinkedInDraft(item: SocialCalendarItem, isRegenerate: boolean) {
    if (isRegenerate) {
      const confirmed = window.confirm(REGENERATE_CONFIRM_MESSAGE);
      if (!confirmed) return;
    }
    setLinkedInBusyIds((prev) => ({ ...prev, [item.id]: true }));
    setLinkedInErrors((prev) => ({ ...prev, [item.id]: null }));
    try {
      const result = await generateLinkedInDraft(item.id, getLinkedInOptions(item));
      setLinkedInDrafts((prev) => ({ ...prev, [item.id]: result }));
    } catch (err) {
      setLinkedInErrors((prev) => ({ ...prev, [item.id]: err instanceof ApiError ? err.message : 'Failed to generate LinkedIn draft' }));
    } finally {
      setLinkedInBusyIds((prev) => ({ ...prev, [item.id]: false }));
    }
  }

  function handleCopyLinkedInDraft(content: string) {
    void navigator.clipboard.writeText(content);
  }

  function getXOptions(item: SocialCalendarItem): XGenerationOptions {
    return (
      xOptionsById[item.id] ?? {
        mode: item.recommendedFormat === 'thread_direction' ? 'thread' : 'single_post',
        tone: 'concise',
        includeCTA: !!item.suggestedCTA,
        includeHashtags: false,
        maxHashtags: 2,
        threadMaxPosts: 5,
      }
    );
  }

  function updateXOptions(item: SocialCalendarItem, patch: Partial<XGenerationOptions>) {
    setXOptionsById((prev) => ({ ...prev, [item.id]: { ...getXOptions(item), ...patch } }));
  }

  async function generateXDraft(socialCalendarItemId: string, options?: XGenerationOptions): Promise<XDraftResult> {
    return apiRequest<XDraftResult>(`${basePath}/content-generation/x/${socialCalendarItemId}`, { method: 'POST', body: options ?? {} });
  }

  async function handleGenerateXDraft(item: SocialCalendarItem, isRegenerate: boolean) {
    if (isRegenerate) {
      const confirmed = window.confirm(REGENERATE_CONFIRM_MESSAGE);
      if (!confirmed) return;
    }
    setXBusyIds((prev) => ({ ...prev, [item.id]: true }));
    setXErrors((prev) => ({ ...prev, [item.id]: null }));
    try {
      const result = await generateXDraft(item.id, getXOptions(item));
      setXDrafts((prev) => ({ ...prev, [item.id]: result }));
    } catch (err) {
      setXErrors((prev) => ({ ...prev, [item.id]: err instanceof ApiError ? err.message : 'Failed to generate X draft' }));
    } finally {
      setXBusyIds((prev) => ({ ...prev, [item.id]: false }));
    }
  }

  function handleCopyXDraft(content: string) {
    void navigator.clipboard.writeText(content);
  }

  function handleCopyXThread(posts: string[]) {
    void navigator.clipboard.writeText(posts.join('\n\n'));
  }

  function getFacebookOptions(item: SocialCalendarItem): FacebookGenerationOptions {
    return facebookOptionsById[item.id] ?? { tone: 'conversational', length: 'medium', includeCTA: !!item.suggestedCTA, includeHashtags: false, maxHashtags: 2 };
  }

  function updateFacebookOptions(item: SocialCalendarItem, patch: Partial<FacebookGenerationOptions>) {
    setFacebookOptionsById((prev) => ({ ...prev, [item.id]: { ...getFacebookOptions(item), ...patch } }));
  }

  async function generateFacebookDraft(socialCalendarItemId: string, options?: FacebookGenerationOptions): Promise<FacebookDraftResult> {
    return apiRequest<FacebookDraftResult>(`${basePath}/content-generation/facebook/${socialCalendarItemId}`, { method: 'POST', body: options ?? {} });
  }

  async function handleGenerateFacebookDraft(item: SocialCalendarItem, isRegenerate: boolean) {
    if (isRegenerate) {
      const confirmed = window.confirm(REGENERATE_CONFIRM_MESSAGE);
      if (!confirmed) return;
    }
    setFacebookBusyIds((prev) => ({ ...prev, [item.id]: true }));
    setFacebookErrors((prev) => ({ ...prev, [item.id]: null }));
    try {
      const result = await generateFacebookDraft(item.id, getFacebookOptions(item));
      setFacebookDrafts((prev) => ({ ...prev, [item.id]: result }));
    } catch (err) {
      setFacebookErrors((prev) => ({ ...prev, [item.id]: err instanceof ApiError ? err.message : 'Failed to generate Facebook draft' }));
    } finally {
      setFacebookBusyIds((prev) => ({ ...prev, [item.id]: false }));
    }
  }

  function handleCopyFacebookDraft(content: string) {
    void navigator.clipboard.writeText(content);
  }

  function getInstagramOptions(item: SocialCalendarItem): InstagramGenerationOptions {
    return (
      instagramOptionsById[item.id] ?? {
        tone: 'conversational',
        length: 'medium',
        includeCTA: !!item.suggestedCTA,
        includeHashtags: false,
        maxHashtags: 5,
        includeEmojis: false,
        maxEmojis: 2,
      }
    );
  }

  function updateInstagramOptions(item: SocialCalendarItem, patch: Partial<InstagramGenerationOptions>) {
    setInstagramOptionsById((prev) => ({ ...prev, [item.id]: { ...getInstagramOptions(item), ...patch } }));
  }

  async function generateInstagramCaption(socialCalendarItemId: string, options?: InstagramGenerationOptions): Promise<InstagramCaptionResult> {
    return apiRequest<InstagramCaptionResult>(`${basePath}/content-generation/instagram/${socialCalendarItemId}`, { method: 'POST', body: options ?? {} });
  }

  async function handleGenerateInstagramCaption(item: SocialCalendarItem, isRegenerate: boolean) {
    if (isRegenerate) {
      const confirmed = window.confirm(REGENERATE_CONFIRM_MESSAGE);
      if (!confirmed) return;
    }
    setInstagramBusyIds((prev) => ({ ...prev, [item.id]: true }));
    setInstagramErrors((prev) => ({ ...prev, [item.id]: null }));
    try {
      const result = await generateInstagramCaption(item.id, getInstagramOptions(item));
      setInstagramCaptions((prev) => ({ ...prev, [item.id]: result }));
    } catch (err) {
      setInstagramErrors((prev) => ({ ...prev, [item.id]: err instanceof ApiError ? err.message : 'Failed to generate Instagram caption' }));
    } finally {
      setInstagramBusyIds((prev) => ({ ...prev, [item.id]: false }));
    }
  }

  function handleCopyInstagramCaption(content: string) {
    void navigator.clipboard.writeText(content);
  }

  // Non-text-post formats never mean GIP generated an image/carousel/Reel
  // asset — only ever the accompanying caption copy.
  function instagramFormatNote(recommendedFormat: string): string | null {
    if (recommendedFormat === 'text_post' || recommendedFormat === 'short_post') return null;
    return `Caption for ${labelize(recommendedFormat)}`;
  }

  function newsletterKey(sourceType: NewsletterSourceType, sourceId: string): string {
    return `${sourceType}:${sourceId}`;
  }

  function getNewsletterOptions(key: string): NewsletterGenerationOptions {
    return newsletterOptionsByKey[key] ?? { tone: 'professional', length: 'medium', includeSubjectLine: true, includePreheader: true, includeCTA: undefined, outputFormat: 'markdown' };
  }

  function updateNewsletterOptions(key: string, patch: Partial<NewsletterGenerationOptions>) {
    setNewsletterOptionsByKey((prev) => ({ ...prev, [key]: { ...getNewsletterOptions(key), ...patch } }));
  }

  async function generateNewsletterDraft(sourceType: NewsletterSourceType, sourceId: string, options?: NewsletterGenerationOptions): Promise<NewsletterDraftResult> {
    return apiRequest<NewsletterDraftResult>(`${basePath}/content-generation/newsletter/${sourceType}/${sourceId}`, { method: 'POST', body: options ?? {} });
  }

  async function handleGenerateNewsletterDraft(sourceType: NewsletterSourceType, sourceId: string, isRegenerate: boolean) {
    const key = newsletterKey(sourceType, sourceId);
    if (isRegenerate) {
      const confirmed = window.confirm(REGENERATE_CONFIRM_MESSAGE);
      if (!confirmed) return;
    }
    setNewsletterBusyKeys((prev) => ({ ...prev, [key]: true }));
    setNewsletterErrors((prev) => ({ ...prev, [key]: null }));
    try {
      const result = await generateNewsletterDraft(sourceType, sourceId, getNewsletterOptions(key));
      setNewsletterDrafts((prev) => ({ ...prev, [key]: result }));
    } catch (err) {
      setNewsletterErrors((prev) => ({ ...prev, [key]: err instanceof ApiError ? err.message : 'Failed to generate newsletter draft' }));
    } finally {
      setNewsletterBusyKeys((prev) => ({ ...prev, [key]: false }));
    }
  }

  function handleCopyNewsletterSubject(subject: string) {
    void navigator.clipboard.writeText(subject);
  }

  function handleCopyNewsletterBody(content: string) {
    void navigator.clipboard.writeText(content);
  }

  function handleCopyFullNewsletter(draft: NewsletterDraftResult) {
    const parts: string[] = [];
    if (draft.subjectLine) parts.push(`Subject: ${draft.subjectLine}`);
    if (draft.preheader) parts.push(`Preheader: ${draft.preheader}`);
    parts.push('');
    parts.push(draft.content);
    void navigator.clipboard.writeText(parts.join('\n'));
  }

  function getVideoScriptOptions(itemId: string): VideoScriptGenerationOptions {
    return videoScriptOptionsById[itemId] ?? { tone: 'conversational', duration: 'medium', includeHook: true, includeSceneDirections: true, includeCTA: undefined, outputFormat: 'markdown' };
  }

  function updateVideoScriptOptions(itemId: string, patch: Partial<VideoScriptGenerationOptions>) {
    setVideoScriptOptionsById((prev) => ({ ...prev, [itemId]: { ...getVideoScriptOptions(itemId), ...patch } }));
  }

  async function generateVideoScript(videoCalendarItemId: string, options?: VideoScriptGenerationOptions): Promise<VideoScriptDraftResult> {
    return apiRequest<VideoScriptDraftResult>(`${basePath}/content-generation/video-script/${videoCalendarItemId}`, { method: 'POST', body: options ?? {} });
  }

  async function handleGenerateVideoScript(itemId: string, isRegenerate: boolean) {
    if (isRegenerate) {
      const confirmed = window.confirm(REGENERATE_CONFIRM_MESSAGE);
      if (!confirmed) return;
    }
    setVideoScriptBusyIds((prev) => ({ ...prev, [itemId]: true }));
    setVideoScriptErrors((prev) => ({ ...prev, [itemId]: null }));
    try {
      const result = await generateVideoScript(itemId, getVideoScriptOptions(itemId));
      setVideoScripts((prev) => ({ ...prev, [itemId]: result }));
    } catch (err) {
      setVideoScriptErrors((prev) => ({ ...prev, [itemId]: err instanceof ApiError ? err.message : 'Failed to generate video script' }));
    } finally {
      setVideoScriptBusyIds((prev) => ({ ...prev, [itemId]: false }));
    }
  }

  function narrationOnly(draft: VideoScriptDraftResult): string {
    return draft.scenes && draft.scenes.length > 0 ? draft.scenes.map((s) => s.narration).join('\n\n') : draft.script;
  }

  function handleCopyVideoScript(draft: VideoScriptDraftResult) {
    void navigator.clipboard.writeText(draft.script);
  }

  function handleCopyVideoNarrationOnly(draft: VideoScriptDraftResult) {
    void navigator.clipboard.writeText(narrationOnly(draft));
  }

  async function handleBuildSocialCalendar() {
    setSocialCalendarBusy(true);
    setSocialCalendarError(null);
    try {
      const result = await apiRequest<SocialCalendarResult>(`${basePath}/content-planning/social-calendar-preview`, { method: 'POST', body: {} });
      setSocialCalendar(result);
    } catch (err) {
      setSocialCalendarError(err instanceof ApiError ? err.message : 'Failed to build social calendar');
    } finally {
      setSocialCalendarBusy(false);
    }
  }

  async function handleBuildVideoCalendar() {
    setVideoCalendarBusy(true);
    setVideoCalendarError(null);
    try {
      const result = await apiRequest<VideoCalendarResult>(`${basePath}/content-planning/video-calendar-preview`, { method: 'POST', body: {} });
      setVideoCalendar(result);
    } catch (err) {
      setVideoCalendarError(err instanceof ApiError ? err.message : 'Failed to build video calendar');
    } finally {
      setVideoCalendarBusy(false);
    }
  }

  async function handleBuildRepurposingPlan() {
    setRepurposingBusy(true);
    setRepurposingError(null);
    try {
      const result = await apiRequest<RepurposingPlanResult>(`${basePath}/content-planning/repurposing-preview`, { method: 'POST', body: {} });
      setRepurposingPlan(result);
    } catch (err) {
      setRepurposingError(err instanceof ApiError ? err.message : 'Failed to build cross-channel repurposing plan');
    } finally {
      setRepurposingBusy(false);
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <Loading text="Loading campaign..." />
      </AppLayout>
    );
  }

  if (loadError || !campaign) {
    return (
      <AppLayout>
        <ErrorMessage message={loadError ?? 'Campaign not found'} />
      </AppLayout>
    );
  }

  const mapping = campaign.audienceChannelMapping;
  const hasMapping = !!mapping && (mapping.audiences.length > 0 || mapping.channels.length > 0);
  const missingPrereq = !campaign.goal ? 'Define a campaign goal first.' : !hasMapping ? 'Define an audience/channel mapping first.' : null;
  const plan = campaign.plan;

  const primaryAudienceRec = mapping?.audiences.find((a) => a.audienceSegmentId === mapping.primaryAudienceSegmentId);
  const planWarnings = plan ? dedupe(plan.warnings) : [];
  const planMissingEvidence = plan ? dedupe(plan.missingEvidence) : [];
  const topPriorities = plan ? plan.topPriorityActivityIds.map((id) => plan.activities.find((a) => a.id === id)).filter((a): a is CampaignActivity => !!a) : [];
  const sortedActivities = plan ? [...plan.activities].sort((a, b) => a.day - b.day || b.priorityScore - a.priorityScore) : [];

  const review = campaign.review;
  const isReviewStale =
    review.status === 'approved' &&
    (campaign.planningMetadata.version > (review.reviewedPlanningVersion ?? 0) ||
      (!!plan?.generatedAt && !!review.reviewedPlanGeneratedAt && new Date(plan.generatedAt).getTime() > new Date(review.reviewedPlanGeneratedAt).getTime()));
  const effectiveReviewStatusLabel = isReviewStale ? 'Review Required (Stale)' : labelize(review.status);
  const missingApprovalPrereqs: string[] = [];
  if (!campaign.goal) missingApprovalPrereqs.push('the campaign goal');
  if (!hasMapping) missingApprovalPrereqs.push('the audience/channel mapping');
  if (!plan) missingApprovalPrereqs.push('the 30-day plan');
  const hasUnresolvedSectionChanges = review.sectionReviews.some((s) => s.status === 'changes_requested');
  const canApprove = missingApprovalPrereqs.length === 0 && !hasUnresolvedSectionChanges;

  const ideaChannels = contentIdeas ? dedupe(contentIdeas.ideas.map((i) => i.channel)) : [];
  const ideaFunnelStages = contentIdeas ? dedupe(contentIdeas.ideas.map((i) => i.funnelStage)) : [];
  const ideaTypes = contentIdeas ? dedupe(contentIdeas.ideas.map((i) => i.type)) : [];
  const filteredIdeas = contentIdeas
    ? [...contentIdeas.ideas]
        .filter((i) => !ideaChannelFilter || i.channel === ideaChannelFilter)
        .filter((i) => !ideaFunnelStageFilter || i.funnelStage === ideaFunnelStageFilter)
        .filter((i) => !ideaTypeFilter || i.type === ideaTypeFilter)
        .sort((a, b) => b.priorityScore - a.priorityScore)
    : [];
  const visibleIdeas = showAllIdeas ? filteredIdeas : filteredIdeas.slice(0, 12);
  const ideaMissingEvidence = contentIdeas ? dedupe(contentIdeas.missingEvidence) : [];
  const ideaWarnings = contentIdeas ? dedupe(contentIdeas.warnings) : [];

  const ideaTitleById = new Map((contentIdeas?.ideas ?? []).map((i) => [i.id, i.title]));
  const topicChannels = topics ? dedupe(topics.topics.flatMap((t) => t.channels)) : [];
  const topicFunnelStages = topics ? dedupe(topics.topics.flatMap((t) => t.funnelStages)) : [];
  const filteredTopics = topics
    ? topics.topics
        .filter((t) => !topicTierFilter || t.tier === topicTierFilter)
        .filter((t) => !topicChannelFilter || t.channels.includes(topicChannelFilter))
        .filter((t) => !topicFunnelStageFilter || t.funnelStages.includes(topicFunnelStageFilter))
    : [];
  const TOPIC_TIER_ORDER: ContentTopicTier[] = ['primary', 'secondary', 'experimental', 'deferred'];
  const TOPIC_TIER_VISIBLE_CAP: Record<ContentTopicTier, number> = { primary: Infinity, secondary: 8, experimental: 6, deferred: Infinity };
  const topicMissingEvidence = topics ? dedupe(topics.missingEvidence) : [];
  const topicWarnings = topics ? dedupe(topics.warnings) : [];

  const topicTitleById = new Map((topics?.topics ?? []).map((t) => [t.id, t.title]));
  const PILLAR_TIER_ORDER: CampaignContentPillarTier[] = ['primary', 'supporting', 'experimental'];
  const pillarMissingEvidence = pillarPlan ? dedupe(pillarPlan.missingEvidence) : [];
  const pillarWarnings = pillarPlan ? dedupe(pillarPlan.warnings) : [];

  const pillarTitleById = new Map((pillarPlan?.pillars ?? []).map((p) => [p.id, p.title]));
  const blogCalendarMissingEvidence = blogCalendar ? dedupe(blogCalendar.missingEvidence) : [];
  const blogCalendarWarnings = blogCalendar ? dedupe(blogCalendar.warnings) : [];
  const blogFunnelStages = blogCalendar ? dedupe(blogCalendar.items.map((i) => i.funnelStage)) : [];

  const blogTitleById = new Map((blogCalendar?.items ?? []).map((i) => [i.id, i.title]));
  const socialCalendarMissingEvidence = socialCalendar ? dedupe(socialCalendar.missingEvidence) : [];
  const socialCalendarWarnings = socialCalendar ? dedupe(socialCalendar.warnings) : [];
  const socialPlatforms = socialCalendar ? dedupe(socialCalendar.items.map((i) => i.platform)) : [];
  const socialTypes = socialCalendar ? dedupe(socialCalendar.items.map((i) => i.type)) : [];
  const socialFunnelStages = socialCalendar ? dedupe(socialCalendar.items.map((i) => i.funnelStage)) : [];
  const filteredSocialWeeks = socialCalendar
    ? socialCalendar.weeks
        .map((week) => ({
          ...week,
          itemIds: week.itemIds.filter((id) => {
            const item = socialCalendar.items.find((i) => i.id === id);
            if (!item) return false;
            if (socialPlatformFilter && item.platform !== socialPlatformFilter) return false;
            if (socialTypeFilter && item.type !== socialTypeFilter) return false;
            if (socialFunnelStageFilter && item.funnelStage !== socialFunnelStageFilter) return false;
            return true;
          }),
        }))
        .filter((week) => week.itemIds.length > 0)
    : [];

  const socialTitleById = new Map((socialCalendar?.items ?? []).map((i) => [i.id, i.title]));
  const videoCalendarMissingEvidence = videoCalendar ? dedupe(videoCalendar.missingEvidence) : [];
  const videoCalendarWarnings = videoCalendar ? dedupe(videoCalendar.warnings) : [];
  const videoTypes = videoCalendar ? dedupe(videoCalendar.items.map((i) => i.type)) : [];
  const videoFormats = videoCalendar ? dedupe(videoCalendar.items.map((i) => i.formatDirection)) : [];
  const videoFunnelStages = videoCalendar ? dedupe(videoCalendar.items.map((i) => i.funnelStage)) : [];
  const filteredVideoWeeks = videoCalendar
    ? videoCalendar.weeks
        .map((week) => ({
          ...week,
          itemIds: week.itemIds.filter((id) => {
            const item = videoCalendar.items.find((i) => i.id === id);
            if (!item) return false;
            if (videoTypeFilter && item.type !== videoTypeFilter) return false;
            if (videoFormatFilter && item.formatDirection !== videoFormatFilter) return false;
            if (videoFunnelStageFilter && item.funnelStage !== videoFunnelStageFilter) return false;
            return true;
          }),
        }))
        .filter((week) => week.itemIds.length > 0)
    : [];

  const repurposingMissingEvidence = repurposingPlan ? dedupe(repurposingPlan.missingEvidence) : [];
  const repurposingWarnings = repurposingPlan ? dedupe(repurposingPlan.warnings) : [];
  const repurposingSourceTypes = repurposingPlan ? dedupe(repurposingPlan.items.map((i) => i.sourceType)) : [];
  const repurposingTargetTypes = repurposingPlan ? dedupe(repurposingPlan.items.map((i) => i.targetType)) : [];
  const repurposingFunnelStages = repurposingPlan ? dedupe(repurposingPlan.items.map((i) => i.funnelStage)) : [];
  const filteredRepurposingItems = repurposingPlan
    ? repurposingPlan.items
        .filter((i) => !repurposingSourceFilter || i.sourceType === repurposingSourceFilter)
        .filter((i) => !repurposingTargetFilter || i.targetType === repurposingTargetFilter)
        .filter((i) => !repurposingFunnelStageFilter || i.funnelStage === repurposingFunnelStageFilter)
    : [];
  const filteredRepurposingItemIds = new Set(filteredRepurposingItems.map((i) => i.id));
  const filteredRepurposingChains = repurposingPlan
    ? repurposingPlan.chains
        .map((chain) => ({ ...chain, repurposingItemIds: chain.repurposingItemIds.filter((id) => filteredRepurposingItemIds.has(id)) }))
        .filter((chain) => chain.repurposingItemIds.length > 0)
    : [];

  return (
    <AppLayout>
      <PageHeader
        backTo={{ to: `/organizations/${organizationId}/products/${productId}/campaigns`, label: 'Campaigns' }}
        title={campaign.name}
        actions={<span className={`quality-badge ${statusQualityClass(campaign.status)}`}>{labelize(campaign.status)}</span>}
      />

      {/* A. Campaign Overview */}
      <Card className="analysis-card">
        <div className="analysis-header">
          <div>
            <h2 className="card-title">Overview</h2>
            <p className="card-subtitle">Campaign metadata and planning status.</p>
          </div>
          {!editingOverview && (
            <button className="btn btn-secondary" onClick={startEditOverview}>
              Edit
            </button>
          )}
        </div>

        {editingOverview ? (
          <form onSubmit={handleSaveOverview} className="form form-grid-2">
            <div className="field">
              <label htmlFor="ov-name">Name</label>
              <input id="ov-name" required value={overviewForm.name} onChange={(e) => setOverviewForm({ ...overviewForm, name: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="ov-type">Type</label>
              <select id="ov-type" value={overviewForm.type} onChange={(e) => setOverviewForm({ ...overviewForm, type: e.target.value })}>
                <option value="">-</option>
                {CAMPAIGN_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {labelize(t)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field field-full">
              <label htmlFor="ov-description">Description</label>
              <textarea id="ov-description" value={overviewForm.description} onChange={(e) => setOverviewForm({ ...overviewForm, description: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="ov-status">Status</label>
              <select id="ov-status" value={overviewForm.status} onChange={(e) => setOverviewForm({ ...overviewForm, status: e.target.value })}>
                {CAMPAIGN_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {labelize(s)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ov-start">Start Date</label>
              <input id="ov-start" type="date" value={overviewForm.startDate} onChange={(e) => setOverviewForm({ ...overviewForm, startDate: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="ov-end">End Date</label>
              <input id="ov-end" type="date" value={overviewForm.endDate} onChange={(e) => setOverviewForm({ ...overviewForm, endDate: e.target.value })} />
            </div>
            <ErrorMessage message={overviewError} />
            <div className="form-inline">
              <button type="submit" className="btn btn-primary" disabled={savingOverview}>
                {savingOverview ? 'Updating campaign...' : 'Save'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setEditingOverview(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="summary-grid">
            <div>
              <span className="summary-label">Description</span>
              <p>{campaign.description || 'No description provided.'}</p>
            </div>
            <div>
              <span className="summary-label">Type</span>
              <p>{campaign.type ? labelize(campaign.type) : '-'}</p>
            </div>
            <div>
              <span className="summary-label">Planning Version</span>
              <p>v{campaign.planningMetadata.version}</p>
            </div>
            <div>
              <span className="summary-label">Planning Source</span>
              <p>{labelize(campaign.planningMetadata.source)}</p>
            </div>
            <div>
              <span className="summary-label">Dates</span>
              <p>
                {campaign.startDate ? new Date(campaign.startDate).toLocaleDateString() : '-'} &rarr;{' '}
                {campaign.endDate ? new Date(campaign.endDate).toLocaleDateString() : '-'}
              </p>
            </div>
            <div>
              <span className="summary-label">Strategy Reference</span>
              <p>
                {campaign.strategyReference?.reviewedStrategyGeneratedAt
                  ? `Linked to strategy reviewed ${new Date(campaign.strategyReference.reviewedStrategyGeneratedAt).toLocaleString()}`
                  : 'Not yet linked to an approved strategy.'}
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* B. Campaign Goal */}
      <Card className="analysis-card">
        <div className="analysis-header">
          <div>
            <h2 className="card-title">Campaign Goal</h2>
            <p className="card-subtitle">The objective this campaign is built around.</p>
          </div>
          <div className="form-inline" style={{ margin: 0 }}>
            <button className="btn btn-primary" onClick={handleDeriveGoal} disabled={goalBusy !== null}>
              {goalBusy === 'deriving' ? 'Deriving goal...' : 'Derive from Approved Strategy'}
            </button>
            <button className="btn btn-secondary" onClick={startEditGoal} disabled={goalBusy !== null}>
              {campaign.goal ? 'Edit Manually' : 'Define Manually'}
            </button>
          </div>
        </div>

        <ErrorMessage message={goalError} />

        {showGoalForm && (
          <form onSubmit={handleSaveGoal} className="form form-grid-2">
            <div className="field">
              <label htmlFor="goal-type">Type</label>
              <select id="goal-type" value={goalForm.type} onChange={(e) => setGoalForm({ ...goalForm, type: e.target.value })}>
                {CAMPAIGN_GOAL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {labelize(t)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="goal-title">Title</label>
              <input id="goal-title" required value={goalForm.title} onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })} />
            </div>
            <div className="field field-full">
              <label htmlFor="goal-description">Description</label>
              <textarea id="goal-description" value={goalForm.description} onChange={(e) => setGoalForm({ ...goalForm, description: e.target.value })} />
            </div>
            <div className="field field-full">
              <label htmlFor="goal-signals">Success Signals (comma-separated)</label>
              <input id="goal-signals" value={goalForm.successSignals} onChange={(e) => setGoalForm({ ...goalForm, successSignals: e.target.value })} />
            </div>
            <div className="form-inline">
              <button type="submit" className="btn btn-primary" disabled={goalBusy !== null}>
                {goalBusy === 'saving' ? 'Saving goal...' : 'Save Goal'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowGoalForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {!campaign.goal && !showGoalForm && <p className="muted">No campaign goal has been defined yet.</p>}

        {campaign.goal && !showGoalForm && (
          <div className="summary-grid">
            <div>
              <span className="summary-label">Title</span>
              <p>{campaign.goal.title}</p>
            </div>
            <div>
              <span className="summary-label">Type</span>
              <p>{labelize(campaign.goal.type)}</p>
            </div>
            <div>
              <span className="summary-label">Source</span>
              <p>{labelize(campaign.goal.source)}</p>
            </div>
            {campaign.goal.description && (
              <div className="field-full" style={{ gridColumn: '1 / -1' }}>
                <span className="summary-label">Description</span>
                <p>{campaign.goal.description}</p>
              </div>
            )}
            {campaign.goal.priorityScore !== undefined && (
              <div>
                <span className="summary-label">Priority</span>
                <p>{campaign.goal.priorityScore}</p>
              </div>
            )}
            {campaign.goal.confidenceScore !== undefined && (
              <div>
                <span className="summary-label">Confidence</span>
                <p>{campaign.goal.confidenceScore}</p>
              </div>
            )}
            {campaign.goal.successSignals.length > 0 && (
              <div style={{ gridColumn: '1 / -1' }}>
                <span className="summary-label">Success Signals</span>
                <div className="tag-list">
                  {campaign.goal.successSignals.map((s, i) => (
                    <span className="tag" key={i}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {campaign.goal.warnings.length > 0 && (
              <div className="content-warning" style={{ gridColumn: '1 / -1' }}>
                {dedupe(campaign.goal.warnings).join(' ')}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* C. Audience & Channels */}
      <Card className="analysis-card">
        <div className="analysis-header">
          <div>
            <h2 className="card-title">Audience &amp; Channel Mapping</h2>
            <p className="card-subtitle">Which segments and channels this campaign targets.</p>
          </div>
          <div className="form-inline" style={{ margin: 0 }}>
            <button className="btn btn-primary" onClick={handleDeriveMapping} disabled={mappingBusy !== null}>
              {mappingBusy === 'deriving' ? 'Deriving audience/channel mapping...' : 'Derive from Approved Strategy'}
            </button>
            <button className="btn btn-secondary" onClick={startEditMapping} disabled={mappingBusy !== null}>
              {hasMapping ? 'Edit Manually' : 'Define Manually'}
            </button>
          </div>
        </div>

        <ErrorMessage message={mappingError} />

        {showMappingForm && (
          <form onSubmit={handleSaveMapping} className="form form-grid-2">
            <div className="field field-full">
              <label htmlFor="map-audiences">Audience Segment IDs (comma-separated)</label>
              <input id="map-audiences" value={mappingForm.audienceSegmentIds} onChange={(e) => setMappingForm({ ...mappingForm, audienceSegmentIds: e.target.value })} />
            </div>
            <div className="field field-full">
              <label htmlFor="map-channels">Channel IDs (comma-separated)</label>
              <input id="map-channels" value={mappingForm.channelIds} onChange={(e) => setMappingForm({ ...mappingForm, channelIds: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="map-primary-audience">Primary Audience Segment ID</label>
              <input id="map-primary-audience" value={mappingForm.primaryAudienceSegmentId} onChange={(e) => setMappingForm({ ...mappingForm, primaryAudienceSegmentId: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="map-primary-channel">Primary Channel</label>
              <input id="map-primary-channel" value={mappingForm.primaryChannel} onChange={(e) => setMappingForm({ ...mappingForm, primaryChannel: e.target.value })} />
            </div>
            <div className="form-inline">
              <button type="submit" className="btn btn-primary" disabled={mappingBusy !== null}>
                {mappingBusy === 'saving' ? 'Saving mapping...' : 'Save Mapping'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowMappingForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {!hasMapping && !showMappingForm && <p className="muted">No audience/channel mapping has been defined yet.</p>}

        {hasMapping && !showMappingForm && (
          <div className="summary-grid">
            <div>
              <span className="summary-label">Primary Audience</span>
              <p>{primaryAudienceRec?.label ?? mapping?.primaryAudienceSegmentId ?? '-'}</p>
            </div>
            <div>
              <span className="summary-label">Primary Channel</span>
              <p>{mapping?.primaryChannel ? labelize(mapping.primaryChannel) : '-'}</p>
            </div>
            <div>
              <span className="summary-label">Confidence</span>
              <p>{mapping?.confidenceScore ?? 0}</p>
            </div>
            <div>
              <span className="summary-label">Source</span>
              <p>{mapping ? labelize(mapping.source) : '-'}</p>
            </div>
            {mapping && mapping.audiences.length > 0 && (
              <div style={{ gridColumn: '1 / -1' }}>
                <span className="summary-label">Selected Audiences</span>
                <div className="tag-list">
                  {mapping.audiences.map((a) => (
                    <span className="tag" key={a.audienceSegmentId}>
                      {a.label ?? a.audienceSegmentId}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {mapping && mapping.channels.length > 0 && (
              <div style={{ gridColumn: '1 / -1' }}>
                <span className="summary-label">Selected Channels</span>
                <div className="tag-list">
                  {mapping.channels.map((c) => (
                    <span className="tag" key={c.channel}>
                      {labelize(c.channel)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {mapping && dedupe([...mapping.audiences.flatMap((a) => a.reasons), ...mapping.channels.flatMap((c) => c.reasons)]).length > 0 && (
              <details style={{ gridColumn: '1 / -1', marginTop: 8 }}>
                <summary className="summary-label" style={{ cursor: 'pointer' }}>
                  Reasons
                </summary>
                <ul className="bullet-list">
                  {dedupe([...mapping.audiences.flatMap((a) => a.reasons), ...mapping.channels.flatMap((c) => c.reasons)]).map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </details>
            )}
            {mapping && dedupe([...mapping.missingEvidence, ...mapping.warnings]).length > 0 && (
              <div className="content-warning" style={{ gridColumn: '1 / -1' }}>
                {dedupe([...mapping.missingEvidence, ...mapping.warnings]).join(' ')}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* D + E. 30-Day Campaign Calendar + Plan Summary */}
      <Card className="analysis-card">
        <div className="analysis-header">
          <div>
            <h2 className="card-title">30-Day Campaign Calendar</h2>
            <p className="card-subtitle">Generated, evidence-based activity sequence for this campaign.</p>
          </div>
          {plan && (
            <div className="form-inline" style={{ margin: 0 }}>
              <button className="btn btn-ghost" onClick={() => setCalendarView(calendarView === 'calendar' ? 'list' : 'calendar')}>
                {calendarView === 'calendar' ? 'List View' : 'Calendar View'}
              </button>
            </div>
          )}
        </div>

        <ErrorMessage message={planError} />

        {!plan && missingPrereq && <p className="muted">{missingPrereq}</p>}

        {!plan && !missingPrereq && (
          <>
            <p className="muted">No 30-day campaign plan has been generated yet.</p>
            <button className="btn btn-primary" onClick={handleGeneratePlan} disabled={planBusy}>
              {planBusy ? 'Generating campaign plan...' : 'Generate 30-Day Campaign Plan'}
            </button>
          </>
        )}

        {plan && (
          <>
            <div className="summary-grid" style={{ marginBottom: 16 }}>
              <div>
                <span className="summary-label">Plan Confidence</span>
                <p>{plan.confidenceScore}</p>
              </div>
              <div>
                <span className="summary-label">Activities</span>
                <p>{plan.activities.length}</p>
              </div>
              <div>
                <span className="summary-label">Generated</span>
                <p>{plan.generatedAt ? new Date(plan.generatedAt).toLocaleString() : '-'}</p>
              </div>
            </div>

            {(planMissingEvidence.length > 0 || planWarnings.length > 0) && (
              <div className="content-warning" style={{ marginBottom: 16 }}>
                {[...planMissingEvidence, ...planWarnings].join(' ')}
              </div>
            )}

            {topPriorities.length > 0 && (
              <div className="section" style={{ marginTop: 0 }}>
                <h3 className="section-title">Top Campaign Priorities</h3>
                <div className="priority-list">
                  {topPriorities.map((a) => (
                    <div className="priority-item" key={a.id}>
                      <div className="entity-card-meta">Day {a.day}</div>
                      <div style={{ fontWeight: 600 }}>{a.title}</div>
                      <div className="tag-list" style={{ marginTop: 4 }}>
                        <span className="tag">{labelize(a.channel)}</span>
                        <span className={`quality-badge ${qualityBadgeClass(scoreQuality(a.priorityScore))}`}>Priority {a.priorityScore}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {calendarView === 'calendar' ? (
              plan.weeks.map((week) => {
                const activitiesByDay = new Map<number, CampaignActivity[]>();
                for (const activity of plan.activities) {
                  if (!week.days.includes(activity.day)) continue;
                  const list = activitiesByDay.get(activity.day) ?? [];
                  list.push(activity);
                  activitiesByDay.set(activity.day, list);
                }
                return (
                  <div className="calendar-week" key={week.week}>
                    <div className="calendar-week-header">
                      <div>
                        <strong>
                          Week {week.week} &mdash; {week.theme}
                        </strong>
                        <div className="entity-card-meta">{week.objective}</div>
                      </div>
                      <div className="entity-card-meta">
                        {week.activityIds.length} {week.activityIds.length === 1 ? 'activity' : 'activities'} &middot; Confidence {week.confidenceScore}
                      </div>
                    </div>
                    <div className="calendar-days">
                      {week.days.map((day) => {
                        const dayActivities = activitiesByDay.get(day) ?? [];
                        const actualDate = actualDateForDay(campaign.startDate, day);
                        return (
                          <div className="calendar-day" key={day}>
                            <div className="calendar-day-number">
                              Day {day}
                              {actualDate ? ` · ${actualDate}` : ''}
                            </div>
                            {dayActivities.length === 0 ? (
                              <div className="calendar-day-empty">No planned activity</div>
                            ) : (
                              dayActivities.map((activity) => <ActivityCard key={activity.id} activity={activity} mapping={mapping} allActivities={plan.activities} />)
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="section" style={{ marginTop: 0 }}>
                {sortedActivities.map((activity) => (
                  <div key={activity.id} style={{ marginBottom: 10 }}>
                    <div className="entity-card-meta">Day {activity.day}</div>
                    <ActivityCard activity={activity} mapping={mapping} allActivities={plan.activities} />
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              {confirmRegenerate ? (
                <div>
                  <div className="content-warning" style={{ marginBottom: 8 }}>
                    Regenerating replaces the current plan and resets generated activity statuses to Planned. Regenerating the plan will make the current campaign approval stale.
                  </div>
                  <div className="form-inline">
                    <button className="btn btn-primary" onClick={handleGeneratePlan} disabled={planBusy}>
                      {planBusy ? 'Generating campaign plan...' : 'Confirm Regenerate'}
                    </button>
                    <button className="btn btn-ghost" onClick={() => setConfirmRegenerate(false)} disabled={planBusy}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button className="btn btn-secondary" onClick={() => setConfirmRegenerate(true)}>
                  Regenerate Plan
                </button>
              )}
            </div>
          </>
        )}
      </Card>

      {/* Campaign Review & Approval */}
      <Card className="analysis-card">
        <div className="analysis-header">
          <div>
            <h2 className="card-title">Campaign Review &amp; Approval</h2>
            <p className="card-subtitle">Explicit review before this campaign can move toward publishing/scheduling.</p>
          </div>
          <span className={`quality-badge ${isReviewStale ? 'quality-limited' : statusQualityClass(review.status as CampaignStatus)}`}>{effectiveReviewStatusLabel}</span>
        </div>

        <ErrorMessage message={reviewError} />
        {reviewSavedMessage && <p className="muted">{reviewSavedMessage}</p>}

        {isReviewStale && <div className="content-warning" style={{ marginBottom: 12 }}>Campaign changed after the last approval. Review is required again.</div>}

        <div className="summary-grid" style={{ marginBottom: 16 }}>
          <div>
            <span className="summary-label">Approved At</span>
            <p>{review.approvedAt ? new Date(review.approvedAt).toLocaleString() : '-'}</p>
          </div>
          <div>
            <span className="summary-label">Changes Requested At</span>
            <p>{review.changesRequestedAt ? new Date(review.changesRequestedAt).toLocaleString() : '-'}</p>
          </div>
          <div>
            <span className="summary-label">Reviewed Planning Version</span>
            <p>{review.reviewedPlanningVersion ?? '-'}</p>
          </div>
          <div>
            <span className="summary-label">Current Planning Version</span>
            <p>{campaign.planningMetadata.version}</p>
          </div>
        </div>

        <div className="section" style={{ marginTop: 0 }}>
          <h3 className="section-title">Section Reviews</h3>
          {CAMPAIGN_REVIEW_SECTION_LIST.map((s) => (
            <div key={s.key} className="form-inline" style={{ alignItems: 'flex-start', marginBottom: 10 }}>
              <div style={{ minWidth: 160, fontWeight: 600 }}>{s.label}</div>
              <div className="field" style={{ marginBottom: 0 }}>
                <select
                  value={sectionDrafts[s.key].status}
                  onChange={(e) =>
                    setSectionDrafts({ ...sectionDrafts, [s.key]: { ...sectionDrafts[s.key], status: e.target.value as CampaignSectionReviewStatus } })
                  }
                >
                  {CAMPAIGN_SECTION_REVIEW_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {labelize(status)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field field-full" style={{ marginBottom: 0, flex: 1 }}>
                <input
                  placeholder="Optional note"
                  value={sectionDrafts[s.key].note}
                  onChange={(e) => setSectionDrafts({ ...sectionDrafts, [s.key]: { ...sectionDrafts[s.key], note: e.target.value } })}
                />
              </div>
            </div>
          ))}
          <div className="field field-full">
            <label htmlFor="review-overall-note">Overall Note</label>
            <textarea id="review-overall-note" value={overallNoteDraft} onChange={(e) => setOverallNoteDraft(e.target.value)} />
          </div>
        </div>

        {missingApprovalPrereqs.length > 0 && (
          <p className="muted">Complete {missingApprovalPrereqs.join(', ')} before approval.</p>
        )}
        {missingApprovalPrereqs.length === 0 && hasUnresolvedSectionChanges && <p className="muted">Resolve requested changes before approving this campaign.</p>}

        <div className="form-inline">
          <button className="btn btn-secondary" onClick={handleSaveReview} disabled={reviewBusy !== null}>
            {reviewBusy === 'saving' ? 'Saving review...' : 'Save Review'}
          </button>
          <button className="btn btn-primary" onClick={handleApproveCampaign} disabled={reviewBusy !== null || !canApprove}>
            {reviewBusy === 'approving' ? 'Approving campaign...' : 'Approve Campaign'}
          </button>
          <button className="btn btn-ghost" onClick={handleRequestChanges} disabled={reviewBusy !== null}>
            {reviewBusy === 'requesting' ? 'Requesting changes...' : 'Request Changes'}
          </button>
        </div>
      </Card>

      {/* Content Planning */}
      <Card className="analysis-card">
        <div className="analysis-header">
          <div>
            <h2 className="card-title">Content Planning</h2>
            <p className="card-subtitle">Strategic content directions derived from the approved strategy and this campaign's plan.</p>
          </div>
        </div>

        <div className="section" style={{ marginTop: 0 }}>
          <h3 className="section-title">Content Ideas</h3>

          <ErrorMessage message={contentIdeasError} />

          {!contentIdeas && !contentIdeasBusy && <p className="muted">No content ideas have been generated for this campaign yet.</p>}

          <button className="btn btn-primary" onClick={handleGenerateContentIdeas} disabled={contentIdeasBusy}>
            {contentIdeasBusy ? 'Generating content ideas...' : contentIdeas ? 'Regenerate Content Ideas' : 'Generate Content Ideas'}
          </button>

          {contentIdeas && (
            <div style={{ marginTop: 16 }}>
              <div className="summary-grid" style={{ marginBottom: 16 }}>
                <div>
                  <span className="summary-label">Idea Count</span>
                  <p>{contentIdeas.ideas.length}</p>
                </div>
                <div>
                  <span className="summary-label">Primary Ideas</span>
                  <p>{contentIdeas.primaryIdeaIds.length}</p>
                </div>
                <div>
                  <span className="summary-label">Overall Confidence</span>
                  <p>{contentIdeas.confidenceScore}</p>
                </div>
                <div>
                  <span className="summary-label">Channels Represented</span>
                  <p>{ideaChannels.length ? ideaChannels.map((c) => labelize(c)).join(', ') : '-'}</p>
                </div>
                <div>
                  <span className="summary-label">Funnel Stages Represented</span>
                  <p>{ideaFunnelStages.length ? ideaFunnelStages.map((s) => labelize(s)).join(', ') : '-'}</p>
                </div>
              </div>

              {(ideaMissingEvidence.length > 0 || ideaWarnings.length > 0) && (
                <div className="content-warning" style={{ marginBottom: 16 }}>
                  {[...ideaMissingEvidence, ...ideaWarnings].join(' ')}
                </div>
              )}

              {contentIdeas.ideas.length === 0 ? (
                <p className="muted">No reliable content ideas were detected from the current approved strategy and campaign plan.</p>
              ) : (
                <>
                  <div className="form-inline">
                    <div className="field" style={{ marginBottom: 0 }}>
                      <select value={ideaChannelFilter} onChange={(e) => setIdeaChannelFilter(e.target.value)}>
                        <option value="">All channels</option>
                        {ideaChannels.map((c) => (
                          <option key={c} value={c}>
                            {labelize(c)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <select value={ideaFunnelStageFilter} onChange={(e) => setIdeaFunnelStageFilter(e.target.value)}>
                        <option value="">All funnel stages</option>
                        {ideaFunnelStages.map((s) => (
                          <option key={s} value={s}>
                            {labelize(s)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <select value={ideaTypeFilter} onChange={(e) => setIdeaTypeFilter(e.target.value)}>
                        <option value="">All idea types</option>
                        {ideaTypes.map((t) => (
                          <option key={t} value={t}>
                            {labelize(t)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid-cards" style={{ marginTop: 12 }}>
                    {visibleIdeas.map((idea) => {
                      const isPrimary = contentIdeas.primaryIdeaIds.includes(idea.id);
                      return (
                        <Card key={idea.id} className="entity-card">
                          <div className="entity-card-header">
                            <h3>{idea.title}</h3>
                            {isPrimary && <span className="tag">Primary</span>}
                          </div>
                          <div className="tag-list">
                            <span className="tag">{labelize(idea.type)}</span>
                            <span className="tag">{labelize(idea.channel)}</span>
                            <span className="tag">{labelize(idea.funnelStage)}</span>
                            <span className={`quality-badge ${qualityBadgeClass(scoreQuality(idea.priorityScore))}`}>Priority {idea.priorityScore}</span>
                          </div>
                          <p className="entity-card-meta">{idea.angle}</p>
                          {idea.audienceSegmentIds.length > 0 && (
                            <div className="entity-card-meta">Audience: {idea.audienceSegmentIds.map((id) => audienceLabel(mapping, id)).join(', ')}</div>
                          )}
                          <details style={{ marginTop: 6 }}>
                            <summary className="summary-label" style={{ cursor: 'pointer' }}>
                              Details
                            </summary>
                            <div style={{ marginTop: 8 }}>
                              <span className="summary-label">Objective</span>
                              <p>{idea.objective}</p>
                              <span className="summary-label">Format Direction</span>
                              <p>{labelize(idea.formatDirection)}</p>
                              {idea.suggestedCTA && (
                                <>
                                  <span className="summary-label">Suggested CTA</span>
                                  <p>{idea.suggestedCTA}</p>
                                </>
                              )}
                              {idea.keywords.length > 0 && (
                                <>
                                  <span className="summary-label">Keyword Directions</span>
                                  <div className="tag-list">
                                    {idea.keywords.map((k, i) => (
                                      <span className="tag" key={i}>
                                        {k}
                                      </span>
                                    ))}
                                  </div>
                                </>
                              )}
                              {(idea.messagingPillarIds.length > 0 || idea.contentPillarIds.length > 0) && (
                                <>
                                  <span className="summary-label">Related Pillars</span>
                                  <p className="entity-card-meta">{[...idea.messagingPillarIds, ...idea.contentPillarIds].join(', ') || '-'}</p>
                                </>
                              )}
                              <span className="summary-label">Confidence</span>
                              <p>{idea.confidenceScore}</p>
                              {idea.reasons.length > 0 && (
                                <>
                                  <span className="summary-label">Reasons</span>
                                  <ul className="bullet-list">
                                    {idea.reasons.map((r, i) => (
                                      <li key={i}>{r}</li>
                                    ))}
                                  </ul>
                                </>
                              )}
                              {idea.warnings.length > 0 && <div className="content-warning" style={{ marginTop: 8 }}>{idea.warnings.join(' ')}</div>}
                            </div>
                          </details>
                        </Card>
                      );
                    })}
                  </div>

                  {filteredIdeas.length > 12 && (
                    <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => setShowAllIdeas(!showAllIdeas)}>
                      {showAllIdeas ? 'Show fewer ideas' : `Show all ${filteredIdeas.length} ideas`}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="section">
          <h3 className="section-title">Topic Prioritization</h3>

          <ErrorMessage message={topicsError} />

          {!topics && !topicsBusy && <p className="muted">No topics have been prioritized yet.</p>}

          <button className="btn btn-primary" onClick={handlePrioritizeTopics} disabled={topicsBusy}>
            {topicsBusy ? 'Prioritizing topics...' : topics ? 'Reprioritize Topics' : 'Prioritize Topics'}
          </button>

          {topics && (
            <div style={{ marginTop: 16 }}>
              <div className="summary-grid" style={{ marginBottom: 16 }}>
                <div>
                  <span className="summary-label">Total Topics</span>
                  <p>{topics.topics.length}</p>
                </div>
                <div>
                  <span className="summary-label">Primary</span>
                  <p>{topics.topics.filter((t) => t.tier === 'primary').length}</p>
                </div>
                <div>
                  <span className="summary-label">Secondary</span>
                  <p>{topics.topics.filter((t) => t.tier === 'secondary').length}</p>
                </div>
                <div>
                  <span className="summary-label">Experimental</span>
                  <p>{topics.topics.filter((t) => t.tier === 'experimental').length}</p>
                </div>
                <div>
                  <span className="summary-label">Overall Confidence</span>
                  <p>{topics.confidenceScore}</p>
                </div>
              </div>

              {(topicMissingEvidence.length > 0 || topicWarnings.length > 0) && (
                <div className="content-warning" style={{ marginBottom: 16 }}>
                  {[...topicMissingEvidence, ...topicWarnings].join(' ')}
                </div>
              )}

              {topics.topics.length === 0 ? (
                <p className="muted">No reliable content topics were detected from the approved campaign and strategy evidence.</p>
              ) : (
                <>
                  <div className="form-inline">
                    <div className="field" style={{ marginBottom: 0 }}>
                      <select value={topicTierFilter} onChange={(e) => setTopicTierFilter(e.target.value)}>
                        <option value="">All tiers</option>
                        {TOPIC_TIER_ORDER.map((t) => (
                          <option key={t} value={t}>
                            {labelize(t)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <select value={topicChannelFilter} onChange={(e) => setTopicChannelFilter(e.target.value)}>
                        <option value="">All channels</option>
                        {topicChannels.map((c) => (
                          <option key={c} value={c}>
                            {labelize(c)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <select value={topicFunnelStageFilter} onChange={(e) => setTopicFunnelStageFilter(e.target.value)}>
                        <option value="">All funnel stages</option>
                        {topicFunnelStages.map((s) => (
                          <option key={s} value={s}>
                            {labelize(s)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {TOPIC_TIER_ORDER.filter((tier) => filteredTopics.some((t) => t.tier === tier)).map((tier) => {
                    const tierTopics = filteredTopics.filter((t) => t.tier === tier).sort((a, b) => b.priorityScore - a.priorityScore);
                    const cap = TOPIC_TIER_VISIBLE_CAP[tier];
                    const visibleTierTopics = tierTopics.slice(0, cap === Infinity ? tierTopics.length : cap);
                    const overflowCount = tierTopics.length - visibleTierTopics.length;
                    return (
                      <div key={tier} style={{ marginTop: 16 }}>
                        <h4 style={{ marginBottom: 8 }}>
                          {labelize(tier)} ({tierTopics.length})
                        </h4>
                        <div className="grid-cards">
                          {visibleTierTopics.map((topic) => (
                            <Card key={topic.id} className="entity-card">
                              <div className="entity-card-header">
                                <h3>{topic.title}</h3>
                                {tier === 'primary' && <span className="tag">Primary</span>}
                              </div>
                              <div className="tag-list">
                                <span className={`quality-badge ${qualityBadgeClass(scoreQuality(topic.priorityScore))}`}>Priority {topic.priorityScore}</span>
                                <span className="tag">Confidence {topic.confidenceScore}</span>
                                <span className="tag">{topic.relatedIdeaIds.length} supporting idea{topic.relatedIdeaIds.length === 1 ? '' : 's'}</span>
                              </div>
                              {topic.channels.length > 0 && <div className="entity-card-meta">Channels: {topic.channels.map((c) => labelize(c)).join(', ')}</div>}
                              {topic.funnelStages.length > 0 && <div className="entity-card-meta">Funnel: {topic.funnelStages.map((s) => labelize(s)).join(', ')}</div>}
                              {topic.audienceSegmentIds.length > 0 && (
                                <div className="entity-card-meta">Audience: {topic.audienceSegmentIds.map((id) => audienceLabel(mapping, id)).join(', ')}</div>
                              )}
                              <details style={{ marginTop: 6 }}>
                                <summary className="summary-label" style={{ cursor: 'pointer' }}>
                                  Details
                                </summary>
                                <div style={{ marginTop: 8 }}>
                                  {topic.keywords.length > 0 && (
                                    <>
                                      <span className="summary-label">Keywords</span>
                                      <div className="tag-list">
                                        {topic.keywords.map((k, i) => (
                                          <span className="tag" key={i}>
                                            {k}
                                          </span>
                                        ))}
                                      </div>
                                    </>
                                  )}
                                  {topic.intentTypes.length > 0 && (
                                    <>
                                      <span className="summary-label">Intent Types</span>
                                      <div className="tag-list">
                                        {topic.intentTypes.map((t, i) => (
                                          <span className="tag" key={i}>
                                            {labelize(t)}
                                          </span>
                                        ))}
                                      </div>
                                    </>
                                  )}
                                  <span className="summary-label">Supporting Ideas</span>
                                  <ul className="bullet-list">
                                    {topic.relatedIdeaIds.map((id) => (
                                      <li key={id}>{ideaTitleById.get(id) ?? id}</li>
                                    ))}
                                  </ul>
                                  {topic.reasons.length > 0 && (
                                    <>
                                      <span className="summary-label">Reasons</span>
                                      <ul className="bullet-list">
                                        {topic.reasons.map((r, i) => (
                                          <li key={i}>{r}</li>
                                        ))}
                                      </ul>
                                    </>
                                  )}
                                  {topic.weaknesses.length > 0 && (
                                    <>
                                      <span className="summary-label">Weaknesses</span>
                                      <ul className="bullet-list">
                                        {topic.weaknesses.map((w, i) => (
                                          <li key={i}>{w}</li>
                                        ))}
                                      </ul>
                                    </>
                                  )}
                                  {topic.warnings.length > 0 && <div className="content-warning" style={{ marginTop: 8 }}>{topic.warnings.join(' ')}</div>}
                                </div>
                              </details>
                            </Card>
                          ))}
                        </div>
                        {overflowCount > 0 && <p className="muted" style={{ marginTop: 8 }}>{overflowCount} more {labelize(tier).toLowerCase()} topic{overflowCount === 1 ? '' : 's'} not shown.</p>}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>

        <div className="section">
          <h3 className="section-title">Content Pillars</h3>

          <ErrorMessage message={pillarPlanError} />

          {!pillarPlan && !pillarPlanBusy && <p className="muted">No campaign content pillars have been built yet.</p>}

          <button className="btn btn-primary" onClick={handleBuildContentPillars} disabled={pillarPlanBusy}>
            {pillarPlanBusy ? 'Building content pillars...' : pillarPlan ? 'Rebuild Content Pillars' : 'Build Content Pillars'}
          </button>

          {pillarPlan && (
            <div style={{ marginTop: 16 }}>
              <div className="summary-grid" style={{ marginBottom: 16 }}>
                <div>
                  <span className="summary-label">Total Pillars</span>
                  <p>{pillarPlan.pillars.length}</p>
                </div>
                <div>
                  <span className="summary-label">Primary</span>
                  <p>{pillarPlan.pillars.filter((p) => p.tier === 'primary').length}</p>
                </div>
                <div>
                  <span className="summary-label">Supporting</span>
                  <p>{pillarPlan.pillars.filter((p) => p.tier === 'supporting').length}</p>
                </div>
                <div>
                  <span className="summary-label">Experimental</span>
                  <p>{pillarPlan.pillars.filter((p) => p.tier === 'experimental').length}</p>
                </div>
                <div>
                  <span className="summary-label">Overall Confidence</span>
                  <p>{pillarPlan.confidenceScore}</p>
                </div>
              </div>

              {(pillarMissingEvidence.length > 0 || pillarWarnings.length > 0) && (
                <div className="content-warning" style={{ marginBottom: 16 }}>
                  {[...pillarMissingEvidence, ...pillarWarnings].join(' ')}
                </div>
              )}

              {pillarPlan.pillars.length === 0 ? (
                <p className="muted">No reliable content pillars were detected from the approved campaign and strategy evidence.</p>
              ) : (
                PILLAR_TIER_ORDER.filter((tier) => pillarPlan.pillars.some((p) => p.tier === tier)).map((tier) => {
                  const tierPillars = pillarPlan.pillars.filter((p) => p.tier === tier).sort((a, b) => b.priorityScore - a.priorityScore);
                  return (
                    <div key={tier} style={{ marginTop: 16 }}>
                      <h4 style={{ marginBottom: 8 }}>
                        {labelize(tier)} ({tierPillars.length})
                      </h4>
                      <div className="grid-cards">
                        {tierPillars.map((pillar) => (
                          <Card key={pillar.id} className="entity-card">
                            <div className="entity-card-header">
                              <h3>{pillar.title}</h3>
                              {tier === 'primary' && <span className="tag">Primary</span>}
                            </div>
                            <div className="tag-list">
                              <span className="tag">{labelize(pillar.theme)}</span>
                              <span className={`quality-badge ${qualityBadgeClass(scoreQuality(pillar.priorityScore))}`}>Priority {pillar.priorityScore}</span>
                              <span className="tag">Confidence {pillar.confidenceScore}</span>
                              <span className="tag">
                                {pillar.topicIds.length} topic{pillar.topicIds.length === 1 ? '' : 's'}
                              </span>
                            </div>
                            <p className="entity-card-meta">{pillar.purpose}</p>
                            {pillar.channels.length > 0 && <div className="entity-card-meta">Channels: {pillar.channels.map((c) => labelize(c)).join(', ')}</div>}
                            {pillar.funnelStages.length > 0 && <div className="entity-card-meta">Funnel: {pillar.funnelStages.map((s) => labelize(s)).join(', ')}</div>}
                            {pillar.audienceSegmentIds.length > 0 && (
                              <div className="entity-card-meta">Audience: {pillar.audienceSegmentIds.map((id) => audienceLabel(mapping, id)).join(', ')}</div>
                            )}
                            <details style={{ marginTop: 6 }}>
                              <summary className="summary-label" style={{ cursor: 'pointer' }}>
                                Details
                              </summary>
                              <div style={{ marginTop: 8 }}>
                                {pillar.keywords.length > 0 && (
                                  <>
                                    <span className="summary-label">Keywords</span>
                                    <div className="tag-list">
                                      {pillar.keywords.map((k, i) => (
                                        <span className="tag" key={i}>
                                          {k}
                                        </span>
                                      ))}
                                    </div>
                                  </>
                                )}
                                {pillar.intentTypes.length > 0 && (
                                  <>
                                    <span className="summary-label">Intent Types</span>
                                    <div className="tag-list">
                                      {pillar.intentTypes.map((t, i) => (
                                        <span className="tag" key={i}>
                                          {labelize(t)}
                                        </span>
                                      ))}
                                    </div>
                                  </>
                                )}
                                <span className="summary-label">Member Topics</span>
                                <ul className="bullet-list">
                                  {pillar.topicIds.map((id) => (
                                    <li key={id}>{topicTitleById.get(id) ?? id}</li>
                                  ))}
                                </ul>
                                {pillar.reasons.length > 0 && (
                                  <>
                                    <span className="summary-label">Reasons</span>
                                    <ul className="bullet-list">
                                      {pillar.reasons.map((r, i) => (
                                        <li key={i}>{r}</li>
                                      ))}
                                    </ul>
                                  </>
                                )}
                                {pillar.weaknesses.length > 0 && (
                                  <>
                                    <span className="summary-label">Weaknesses</span>
                                    <ul className="bullet-list">
                                      {pillar.weaknesses.map((w, i) => (
                                        <li key={i}>{w}</li>
                                      ))}
                                    </ul>
                                  </>
                                )}
                                {pillar.warnings.length > 0 && <div className="content-warning" style={{ marginTop: 8 }}>{pillar.warnings.join(' ')}</div>}
                              </div>
                            </details>

                            <NewsletterGenerationPanel
                              basePath={basePath}
                              draft={newsletterDrafts[newsletterKey('content_pillar', pillar.id)]}
                              busy={!!newsletterBusyKeys[newsletterKey('content_pillar', pillar.id)]}
                              error={newsletterErrors[newsletterKey('content_pillar', pillar.id)] ?? null}
                              options={getNewsletterOptions(newsletterKey('content_pillar', pillar.id))}
                              onOptionsChange={(patch) => updateNewsletterOptions(newsletterKey('content_pillar', pillar.id), patch)}
                              onGenerate={() => handleGenerateNewsletterDraft('content_pillar', pillar.id, !!newsletterDrafts[newsletterKey('content_pillar', pillar.id)])}
                              onCopySubject={handleCopyNewsletterSubject}
                              onCopyBody={handleCopyNewsletterBody}
                              onCopyFull={() => handleCopyFullNewsletter(newsletterDrafts[newsletterKey('content_pillar', pillar.id)])}
                            />
                          </Card>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div className="section">
          <h3 className="section-title">Blog Calendar</h3>

          <ErrorMessage message={blogCalendarError} />

          {!blogCalendar && !blogCalendarBusy && <p className="muted">No blog calendar has been built yet.</p>}

          <button className="btn btn-primary" onClick={handleBuildBlogCalendar} disabled={blogCalendarBusy}>
            {blogCalendarBusy ? 'Building blog calendar...' : blogCalendar ? 'Rebuild Blog Calendar' : 'Build Blog Calendar'}
          </button>

          {blogCalendar && (
            <div style={{ marginTop: 16 }}>
              <div className="summary-grid" style={{ marginBottom: 16 }}>
                <div>
                  <span className="summary-label">Total Blog Items</span>
                  <p>{blogCalendar.items.length}</p>
                </div>
                <div>
                  <span className="summary-label">Overall Confidence</span>
                  <p>{blogCalendar.confidenceScore}</p>
                </div>
                <div>
                  <span className="summary-label">Top Priority Items</span>
                  <p>{blogCalendar.topPriorityItemIds.length}</p>
                </div>
                <div>
                  <span className="summary-label">Weeks Represented</span>
                  <p>{blogCalendar.weeks.map((w) => `Week ${w.week}`).join(', ') || '-'}</p>
                </div>
                <div>
                  <span className="summary-label">Funnel Stages Represented</span>
                  <p>{blogFunnelStages.length ? blogFunnelStages.map((s) => labelize(s)).join(', ') : '-'}</p>
                </div>
              </div>

              {(blogCalendarMissingEvidence.length > 0 || blogCalendarWarnings.length > 0) && (
                <div className="content-warning" style={{ marginBottom: 16 }}>
                  {[...blogCalendarMissingEvidence, ...blogCalendarWarnings].join(' ')}
                </div>
              )}

              {blogCalendar.items.length === 0 ? (
                <p className="muted">No reliable blog calendar was detected for the current campaign channels and content strategy.</p>
              ) : (
                blogCalendar.weeks.map((week) => {
                  const weekItems = week.itemIds.map((id) => blogCalendar.items.find((i) => i.id === id)).filter((i): i is NonNullable<typeof i> => !!i);
                  return (
                    <div className="calendar-week" key={week.week}>
                      <div className="calendar-week-header">
                        <div>
                          <strong>
                            Week {week.week} &mdash; {week.theme}
                          </strong>
                        </div>
                        <div className="entity-card-meta">
                          {weekItems.length} item{weekItems.length === 1 ? '' : 's'} &middot; Confidence {week.confidenceScore}
                        </div>
                      </div>
                      <div className="calendar-days">
                        {weekItems.map((item) => {
                          const actualDate = actualDateForDay(campaign.startDate, item.day);
                          const dependencyTitles = item.dependencies.map((depId) => blogCalendar.items.find((i) => i.id === depId)?.title ?? depId);
                          return (
                            <div className="calendar-day" key={item.id}>
                              <div className="calendar-day-number">
                                Day {item.day}
                                {actualDate ? ` · ${actualDate}` : ''}
                              </div>
                              <div className="activity-card">
                                <div className="activity-card-title">{item.title}</div>
                                <div className="tag-list">
                                  <span className="tag">{labelize(item.type)}</span>
                                  <span className="tag">{labelize(item.funnelStage)}</span>
                                  <span className={`quality-badge ${qualityBadgeClass(scoreQuality(item.priorityScore))}`}>Priority {item.priorityScore}</span>
                                </div>
                                <div className="entity-card-meta">Pillar: {pillarTitleById.get(item.pillarId) ?? item.pillarId}</div>
                                {item.audienceSegmentIds.length > 0 && (
                                  <div className="entity-card-meta">Audience: {item.audienceSegmentIds.map((id) => audienceLabel(mapping, id)).join(', ')}</div>
                                )}
                                {item.primaryKeyword && <div className="entity-card-meta">Primary keyword: {item.primaryKeyword}</div>}
                                {item.suggestedCTA && <div className="entity-card-meta">CTA: {item.suggestedCTA}</div>}
                                <details style={{ marginTop: 6 }}>
                                  <summary className="summary-label" style={{ cursor: 'pointer' }}>
                                    Details
                                  </summary>
                                  <div style={{ marginTop: 8 }}>
                                    <span className="summary-label">Angle</span>
                                    <p>{item.angle}</p>
                                    {item.supportingKeywords.length > 0 && (
                                      <>
                                        <span className="summary-label">Supporting Keywords</span>
                                        <div className="tag-list">
                                          {item.supportingKeywords.map((k, i) => (
                                            <span className="tag" key={i}>
                                              {k}
                                            </span>
                                          ))}
                                        </div>
                                      </>
                                    )}
                                    {item.intentTypes.length > 0 && (
                                      <>
                                        <span className="summary-label">Intent Types</span>
                                        <div className="tag-list">
                                          {item.intentTypes.map((t, i) => (
                                            <span className="tag" key={i}>
                                              {labelize(t)}
                                            </span>
                                          ))}
                                        </div>
                                      </>
                                    )}
                                    {dependencyTitles.length > 0 && (
                                      <>
                                        <span className="summary-label">Depends On</span>
                                        <ul className="bullet-list">
                                          {dependencyTitles.map((t, i) => (
                                            <li key={i}>{t}</li>
                                          ))}
                                        </ul>
                                      </>
                                    )}
                                    {item.relatedCampaignActivityIds.length > 0 && (
                                      <>
                                        <span className="summary-label">Related Campaign Activities</span>
                                        <p className="entity-card-meta">{item.relatedCampaignActivityIds.join(', ')}</p>
                                      </>
                                    )}
                                    {item.successSignals.length > 0 && (
                                      <>
                                        <span className="summary-label">Success Signals</span>
                                        <div className="tag-list">
                                          {item.successSignals.map((s, i) => (
                                            <span className="tag" key={i}>
                                              {s}
                                            </span>
                                          ))}
                                        </div>
                                      </>
                                    )}
                                    {item.reasons.length > 0 && (
                                      <>
                                        <span className="summary-label">Reasons</span>
                                        <ul className="bullet-list">
                                          {item.reasons.map((r, i) => (
                                            <li key={i}>{r}</li>
                                          ))}
                                        </ul>
                                      </>
                                    )}
                                    {item.warnings.length > 0 && <div className="content-warning" style={{ marginTop: 8 }}>{item.warnings.join(' ')}</div>}
                                  </div>
                                </details>

                                <div style={{ marginTop: 10 }}>
                                  <ErrorMessage message={blogDraftErrors[item.id] ?? null} />
                                  {!blogDrafts[item.id] && <p className="entity-card-meta">AI generation uses your configured provider and may incur usage cost.</p>}
                                  <button
                                    className="btn btn-secondary"
                                    onClick={() => handleGenerateBlogDraft(item.id, !!blogDrafts[item.id])}
                                    disabled={!!blogDraftBusyIds[item.id]}
                                  >
                                    {blogDraftBusyIds[item.id] ? 'Generating draft...' : blogDrafts[item.id] ? 'Regenerate Draft' : 'Generate Draft'}
                                  </button>

                                  {blogDrafts[item.id] && (
                                    <div style={{ marginTop: 10 }}>
                                      <div className="tag-list">
                                        <span className="tag">{blogDrafts[item.id].wordCount} words</span>
                                        <span className="tag">{blogDrafts[item.id].provider} / {blogDrafts[item.id].model}</span>
                                        {blogDrafts[item.id].usage.totalTokens !== undefined && <span className="tag">{blogDrafts[item.id].usage.totalTokens} tokens</span>}
                                        {blogDrafts[item.id].cost && <span className="tag">${blogDrafts[item.id].cost!.estimated.toFixed(4)} {blogDrafts[item.id].cost!.currency}</span>}
                                        <span className="tag">Prompt {blogDrafts[item.id].promptVersion}</span>
                                      </div>
                                      <div className="entity-card-meta">Generated {new Date(blogDrafts[item.id].generatedAt).toLocaleString()}</div>
                                      {blogDrafts[item.id].warnings.length > 0 && (
                                        <div className="content-warning" style={{ marginTop: 6 }}>{blogDrafts[item.id].warnings.join(' ')}</div>
                                      )}
                                      <pre
                                        style={{
                                          marginTop: 8,
                                          padding: 10,
                                          whiteSpace: 'pre-wrap',
                                          wordBreak: 'break-word',
                                          maxHeight: 320,
                                          overflowY: 'auto',
                                          background: 'var(--surface-muted, #f5f5f5)',
                                          borderRadius: 6,
                                        }}
                                      >
                                        {blogDrafts[item.id].content}
                                      </pre>
                                      <button className="btn btn-secondary" style={{ marginTop: 6 }} onClick={() => handleCopyBlogDraft(blogDrafts[item.id].content)}>
                                        Copy Draft
                                      </button>
                                      <ContentVersionHistory basePath={basePath} artifactId={blogDrafts[item.id].artifactId} latestVersion={blogDrafts[item.id].version} />
                                    </div>
                                  )}
                                </div>

                                <NewsletterGenerationPanel
                                  basePath={basePath}
                                  draft={newsletterDrafts[newsletterKey('blog_calendar_item', item.id)]}
                                  busy={!!newsletterBusyKeys[newsletterKey('blog_calendar_item', item.id)]}
                                  error={newsletterErrors[newsletterKey('blog_calendar_item', item.id)] ?? null}
                                  options={getNewsletterOptions(newsletterKey('blog_calendar_item', item.id))}
                                  onOptionsChange={(patch) => updateNewsletterOptions(newsletterKey('blog_calendar_item', item.id), patch)}
                                  onGenerate={() => handleGenerateNewsletterDraft('blog_calendar_item', item.id, !!newsletterDrafts[newsletterKey('blog_calendar_item', item.id)])}
                                  onCopySubject={handleCopyNewsletterSubject}
                                  onCopyBody={handleCopyNewsletterBody}
                                  onCopyFull={() => handleCopyFullNewsletter(newsletterDrafts[newsletterKey('blog_calendar_item', item.id)])}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div className="section">
          <h3 className="section-title">Social Calendar</h3>

          <ErrorMessage message={socialCalendarError} />

          {!socialCalendar && !socialCalendarBusy && <p className="muted">No social calendar has been built yet.</p>}

          <button className="btn btn-primary" onClick={handleBuildSocialCalendar} disabled={socialCalendarBusy}>
            {socialCalendarBusy ? 'Building social calendar...' : socialCalendar ? 'Rebuild Social Calendar' : 'Build Social Calendar'}
          </button>

          {socialCalendar && (
            <div style={{ marginTop: 16 }}>
              <div className="summary-grid" style={{ marginBottom: 16 }}>
                <div>
                  <span className="summary-label">Total Items</span>
                  <p>{socialCalendar.items.length}</p>
                </div>
                <div>
                  <span className="summary-label">Overall Confidence</span>
                  <p>{socialCalendar.confidenceScore}</p>
                </div>
                <div>
                  <span className="summary-label">Top Priority Items</span>
                  <p>{socialCalendar.topPriorityItemIds.length}</p>
                </div>
                <div>
                  <span className="summary-label">Weeks Represented</span>
                  <p>{socialCalendar.weeks.map((w) => `Week ${w.week}`).join(', ') || '-'}</p>
                </div>
                <div>
                  <span className="summary-label">Platforms Represented</span>
                  <p>{socialPlatforms.length ? socialPlatforms.map((p) => labelize(p)).join(', ') : '-'}</p>
                </div>
                <div>
                  <span className="summary-label">Funnel Stages Represented</span>
                  <p>{socialFunnelStages.length ? socialFunnelStages.map((s) => labelize(s)).join(', ') : '-'}</p>
                </div>
              </div>

              {(socialCalendarMissingEvidence.length > 0 || socialCalendarWarnings.length > 0) && (
                <div className="content-warning" style={{ marginBottom: 16 }}>
                  {[...socialCalendarMissingEvidence, ...socialCalendarWarnings].join(' ')}
                </div>
              )}

              {socialCalendar.items.length === 0 ? (
                <p className="muted">No reliable social content directions were detected from the approved campaign and strategy evidence.</p>
              ) : (
                <>
                  <div className="form-inline">
                    <div className="field" style={{ marginBottom: 0 }}>
                      <select value={socialPlatformFilter} onChange={(e) => setSocialPlatformFilter(e.target.value)}>
                        <option value="">All platforms</option>
                        {socialPlatforms.map((p) => (
                          <option key={p} value={p}>
                            {labelize(p)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <select value={socialTypeFilter} onChange={(e) => setSocialTypeFilter(e.target.value)}>
                        <option value="">All content types</option>
                        {socialTypes.map((t) => (
                          <option key={t} value={t}>
                            {labelize(t)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <select value={socialFunnelStageFilter} onChange={(e) => setSocialFunnelStageFilter(e.target.value)}>
                        <option value="">All funnel stages</option>
                        {socialFunnelStages.map((s) => (
                          <option key={s} value={s}>
                            {labelize(s)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {filteredSocialWeeks.map((week) => {
                    const weekItems = week.itemIds.map((id) => socialCalendar.items.find((i) => i.id === id)).filter((i): i is NonNullable<typeof i> => !!i);
                    return (
                      <div className="calendar-week" key={week.week}>
                        <div className="calendar-week-header">
                          <div>
                            <strong>
                              Week {week.week} &mdash; {week.theme}
                            </strong>
                          </div>
                          <div className="entity-card-meta">
                            {weekItems.length} item{weekItems.length === 1 ? '' : 's'} &middot; Confidence {week.confidenceScore}
                          </div>
                        </div>
                        <div className="calendar-days">
                          {weekItems.map((item) => {
                            const actualDate = actualDateForDay(campaign.startDate, item.day);
                            return (
                              <div className="calendar-day" key={item.id}>
                                <div className="calendar-day-number">
                                  Day {item.day}
                                  {actualDate ? ` · ${actualDate}` : ''}
                                </div>
                                <div className="activity-card">
                                  <div className="activity-card-title">{item.title}</div>
                                  <div className="tag-list">
                                    <span className="tag">{labelize(item.type)}</span>
                                    <span className="tag">{labelize(item.platform)}</span>
                                    <span className="tag">{labelize(item.recommendedFormat)}</span>
                                    <span className={`quality-badge ${qualityBadgeClass(scoreQuality(item.priorityScore))}`}>Priority {item.priorityScore}</span>
                                  </div>
                                  {item.sourceBlogItemId && (
                                    <div className="entity-card-meta">Repurposed from Blog Calendar: {blogTitleById.get(item.sourceBlogItemId) ?? item.sourceBlogItemId}</div>
                                  )}
                                  {item.audienceSegmentIds.length > 0 && (
                                    <div className="entity-card-meta">Audience: {item.audienceSegmentIds.map((id) => audienceLabel(mapping, id)).join(', ')}</div>
                                  )}
                                  {item.suggestedCTA && <div className="entity-card-meta">CTA: {item.suggestedCTA}</div>}
                                  <details style={{ marginTop: 6 }}>
                                    <summary className="summary-label" style={{ cursor: 'pointer' }}>
                                      Details
                                    </summary>
                                    <div style={{ marginTop: 8 }}>
                                      <span className="summary-label">Angle</span>
                                      <p>{item.angle}</p>
                                      {item.messagingPillarIds.length > 0 && (
                                        <>
                                          <span className="summary-label">Messaging Pillars</span>
                                          <p className="entity-card-meta">{item.messagingPillarIds.join(', ')}</p>
                                        </>
                                      )}
                                      {item.keywords.length > 0 && (
                                        <>
                                          <span className="summary-label">Keywords</span>
                                          <div className="tag-list">
                                            {item.keywords.map((k, i) => (
                                              <span className="tag" key={i}>
                                                {k}
                                              </span>
                                            ))}
                                          </div>
                                        </>
                                      )}
                                      {item.relatedCampaignActivityIds.length > 0 && (
                                        <>
                                          <span className="summary-label">Related Campaign Activities</span>
                                          <p className="entity-card-meta">{item.relatedCampaignActivityIds.join(', ')}</p>
                                        </>
                                      )}
                                      {item.dependencies.length > 0 && (
                                        <>
                                          <span className="summary-label">Dependencies</span>
                                          <p className="entity-card-meta">{item.dependencies.join(', ')}</p>
                                        </>
                                      )}
                                      {item.successSignals.length > 0 && (
                                        <>
                                          <span className="summary-label">Success Signals</span>
                                          <div className="tag-list">
                                            {item.successSignals.map((s, i) => (
                                              <span className="tag" key={i}>
                                                {s}
                                              </span>
                                            ))}
                                          </div>
                                        </>
                                      )}
                                      {item.reasons.length > 0 && (
                                        <>
                                          <span className="summary-label">Reasons</span>
                                          <ul className="bullet-list">
                                            {item.reasons.map((r, i) => (
                                              <li key={i}>{r}</li>
                                            ))}
                                          </ul>
                                        </>
                                      )}
                                      {item.warnings.length > 0 && <div className="content-warning" style={{ marginTop: 8 }}>{item.warnings.join(' ')}</div>}
                                    </div>
                                  </details>

                                  {(() => {
                                    const isLinkedInEligible = item.platform !== 'facebook' && item.platform !== 'instagram' && item.platform !== 'x';
                                    if (!isLinkedInEligible) return null;
                                    const linkedInOptions = getLinkedInOptions(item);
                                    const draft = linkedInDrafts[item.id];
                                    return (
                                      <div style={{ marginTop: 10 }}>
                                        {item.platform === 'generic_social' && (
                                          <p className="entity-card-meta">LinkedIn is being chosen as the generation target; this social item was planned generically.</p>
                                        )}
                                        <ErrorMessage message={linkedInErrors[item.id] ?? null} />
                                        {!draft && <p className="entity-card-meta">AI generation uses your configured provider and may incur usage cost.</p>}

                                        <div className="form-inline">
                                          <div className="field" style={{ marginBottom: 0 }}>
                                            <select value={linkedInOptions.tone} onChange={(e) => updateLinkedInOptions(item, { tone: e.target.value as LinkedInGenerationOptions['tone'] })}>
                                              <option value="professional">Professional</option>
                                              <option value="conversational">Conversational</option>
                                              <option value="thought_leadership">Thought Leadership</option>
                                            </select>
                                          </div>
                                          <div className="field" style={{ marginBottom: 0 }}>
                                            <select value={linkedInOptions.length} onChange={(e) => updateLinkedInOptions(item, { length: e.target.value as LinkedInGenerationOptions['length'] })}>
                                              <option value="short">Short</option>
                                              <option value="medium">Medium</option>
                                              <option value="long">Long</option>
                                            </select>
                                          </div>
                                          <label className="entity-card-meta" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <input type="checkbox" checked={!!linkedInOptions.includeCTA} onChange={(e) => updateLinkedInOptions(item, { includeCTA: e.target.checked })} />
                                            Include CTA
                                          </label>
                                          <label className="entity-card-meta" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <input type="checkbox" checked={!!linkedInOptions.includeHashtags} onChange={(e) => updateLinkedInOptions(item, { includeHashtags: e.target.checked })} />
                                            Include hashtags
                                          </label>
                                          {linkedInOptions.includeHashtags && (
                                            <div className="field" style={{ marginBottom: 0 }}>
                                              <select value={linkedInOptions.maxHashtags} onChange={(e) => updateLinkedInOptions(item, { maxHashtags: Number(e.target.value) })}>
                                                {[1, 2, 3, 4, 5].map((n) => (
                                                  <option key={n} value={n}>
                                                    Max {n} hashtag{n === 1 ? '' : 's'}
                                                  </option>
                                                ))}
                                              </select>
                                            </div>
                                          )}
                                        </div>

                                        <button className="btn btn-secondary" onClick={() => handleGenerateLinkedInDraft(item, !!draft)} disabled={!!linkedInBusyIds[item.id]}>
                                          {linkedInBusyIds[item.id] ? 'Generating draft...' : draft ? 'Regenerate LinkedIn Draft' : 'Generate LinkedIn'}
                                        </button>

                                        {draft && (
                                          <div style={{ marginTop: 10 }}>
                                            <div className="tag-list">
                                              <span className="tag">{draft.characterCount} chars</span>
                                              <span className="tag">{draft.wordCount} words</span>
                                              <span className="tag">{labelize(draft.tone)}</span>
                                              <span className="tag">{labelize(draft.length)}</span>
                                              <span className="tag">{draft.provider} / {draft.model}</span>
                                              {draft.usage.totalTokens !== undefined && <span className="tag">{draft.usage.totalTokens} tokens</span>}
                                              {draft.cost && <span className="tag">${draft.cost.estimated.toFixed(4)} {draft.cost.currency}</span>}
                                              <span className="tag">Prompt {draft.promptVersion}</span>
                                            </div>
                                            <div className="entity-card-meta">Generated {new Date(draft.generatedAt).toLocaleString()}</div>
                                            {draft.warnings.length > 0 && <div className="content-warning" style={{ marginTop: 6 }}>{draft.warnings.join(' ')}</div>}
                                            <pre
                                              style={{
                                                marginTop: 8,
                                                padding: 10,
                                                whiteSpace: 'pre-wrap',
                                                wordBreak: 'break-word',
                                                maxHeight: 320,
                                                overflowY: 'auto',
                                                background: 'var(--surface-muted, #f5f5f5)',
                                                borderRadius: 6,
                                              }}
                                            >
                                              {draft.content}
                                            </pre>
                                            <button className="btn btn-secondary" style={{ marginTop: 6 }} onClick={() => handleCopyLinkedInDraft(draft.content)}>
                                              Copy Post
                                            </button>
                                            <ContentVersionHistory basePath={basePath} artifactId={draft.artifactId} latestVersion={draft.version} />
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}

                                  {(() => {
                                    const isXEligible = item.platform !== 'facebook' && item.platform !== 'instagram' && item.platform !== 'linkedin';
                                    if (!isXEligible) return null;
                                    const xOptions = getXOptions(item);
                                    const draft = xDrafts[item.id];
                                    return (
                                      <div style={{ marginTop: 10 }}>
                                        {item.platform === 'generic_social' && (
                                          <p className="entity-card-meta">X is being chosen as the generation target; this social item was planned generically.</p>
                                        )}
                                        <ErrorMessage message={xErrors[item.id] ?? null} />
                                        {!draft && <p className="entity-card-meta">AI generation uses your configured provider and may incur usage cost.</p>}

                                        <div className="form-inline">
                                          <div className="field" style={{ marginBottom: 0 }}>
                                            <select value={xOptions.mode} onChange={(e) => updateXOptions(item, { mode: e.target.value as XGenerationOptions['mode'] })}>
                                              <option value="single_post">Single</option>
                                              <option value="thread">Thread</option>
                                            </select>
                                          </div>
                                          <div className="field" style={{ marginBottom: 0 }}>
                                            <select value={xOptions.tone} onChange={(e) => updateXOptions(item, { tone: e.target.value as XGenerationOptions['tone'] })}>
                                              <option value="concise">Concise</option>
                                              <option value="professional">Professional</option>
                                              <option value="conversational">Conversational</option>
                                              <option value="thought_leadership">Thought Leadership</option>
                                            </select>
                                          </div>
                                          <label className="entity-card-meta" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <input type="checkbox" checked={!!xOptions.includeCTA} onChange={(e) => updateXOptions(item, { includeCTA: e.target.checked })} />
                                            Include CTA
                                          </label>
                                          <label className="entity-card-meta" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <input type="checkbox" checked={!!xOptions.includeHashtags} onChange={(e) => updateXOptions(item, { includeHashtags: e.target.checked })} />
                                            Include hashtags
                                          </label>
                                          {xOptions.includeHashtags && (
                                            <div className="field" style={{ marginBottom: 0 }}>
                                              <select value={xOptions.maxHashtags} onChange={(e) => updateXOptions(item, { maxHashtags: Number(e.target.value) })}>
                                                {[1, 2, 3, 4].map((n) => (
                                                  <option key={n} value={n}>
                                                    Max {n} hashtag{n === 1 ? '' : 's'}
                                                  </option>
                                                ))}
                                              </select>
                                            </div>
                                          )}
                                          {xOptions.mode === 'thread' && (
                                            <div className="field" style={{ marginBottom: 0 }}>
                                              <select value={xOptions.threadMaxPosts} onChange={(e) => updateXOptions(item, { threadMaxPosts: Number(e.target.value) })}>
                                                {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                                                  <option key={n} value={n}>
                                                    Max {n} posts
                                                  </option>
                                                ))}
                                              </select>
                                            </div>
                                          )}
                                        </div>

                                        <button className="btn btn-secondary" onClick={() => handleGenerateXDraft(item, !!draft)} disabled={!!xBusyIds[item.id]}>
                                          {xBusyIds[item.id] ? 'Generating draft...' : draft ? 'Regenerate X Draft' : 'Generate X'}
                                        </button>

                                        {draft && (
                                          <div style={{ marginTop: 10 }}>
                                            <div className="tag-list">
                                              <span className="tag">{labelize(draft.mode)}</span>
                                              <span className="tag">{draft.wordCount} words</span>
                                              <span className="tag">{labelize(draft.tone)}</span>
                                              <span className="tag">{draft.provider} / {draft.model}</span>
                                              {draft.usage.totalTokens !== undefined && <span className="tag">{draft.usage.totalTokens} tokens</span>}
                                              {draft.cost && <span className="tag">${draft.cost.estimated.toFixed(4)} {draft.cost.currency}</span>}
                                              <span className="tag">Prompt {draft.promptVersion}</span>
                                            </div>
                                            <div className="entity-card-meta">Generated {new Date(draft.generatedAt).toLocaleString()}</div>
                                            {draft.warnings.length > 0 && <div className="content-warning" style={{ marginTop: 6 }}>{draft.warnings.join(' ')}</div>}

                                            {draft.mode === 'single_post' ? (
                                              <>
                                                <div className="entity-card-meta">{draft.characterCount} characters</div>
                                                <pre
                                                  style={{
                                                    marginTop: 8,
                                                    padding: 10,
                                                    whiteSpace: 'pre-wrap',
                                                    wordBreak: 'break-word',
                                                    maxHeight: 320,
                                                    overflowY: 'auto',
                                                    background: 'var(--surface-muted, #f5f5f5)',
                                                    borderRadius: 6,
                                                  }}
                                                >
                                                  {draft.content}
                                                </pre>
                                                <button className="btn btn-secondary" style={{ marginTop: 6 }} onClick={() => handleCopyXDraft(draft.content ?? '')}>
                                                  Copy Post
                                                </button>
                                              </>
                                            ) : (
                                              <>
                                                {(draft.posts ?? []).map((post, i) => (
                                                  <div key={i} style={{ marginTop: 8 }}>
                                                    <span className="summary-label">Post {i + 1}</span>
                                                    <pre
                                                      style={{
                                                        marginTop: 4,
                                                        padding: 10,
                                                        whiteSpace: 'pre-wrap',
                                                        wordBreak: 'break-word',
                                                        background: 'var(--surface-muted, #f5f5f5)',
                                                        borderRadius: 6,
                                                      }}
                                                    >
                                                      {post}
                                                    </pre>
                                                    <div className="entity-card-meta">{draft.postCharacterCounts?.[i] ?? post.length} characters</div>
                                                  </div>
                                                ))}
                                                <button className="btn btn-secondary" style={{ marginTop: 6 }} onClick={() => handleCopyXThread(draft.posts ?? [])}>
                                                  Copy Full Thread
                                                </button>
                                              </>
                                            )}
                                            <ContentVersionHistory basePath={basePath} artifactId={draft.artifactId} latestVersion={draft.version} />
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}

                                  {(() => {
                                    const isFacebookEligible = item.platform !== 'linkedin' && item.platform !== 'instagram' && item.platform !== 'x';
                                    if (!isFacebookEligible) return null;
                                    const fbOptions = getFacebookOptions(item);
                                    const draft = facebookDrafts[item.id];
                                    return (
                                      <div style={{ marginTop: 10 }}>
                                        {item.platform === 'generic_social' && (
                                          <p className="entity-card-meta">Facebook is being chosen as the generation target; this social item was planned generically.</p>
                                        )}
                                        <ErrorMessage message={facebookErrors[item.id] ?? null} />
                                        {!draft && <p className="entity-card-meta">AI generation uses your configured provider and may incur usage cost.</p>}

                                        <div className="form-inline">
                                          <div className="field" style={{ marginBottom: 0 }}>
                                            <select value={fbOptions.tone} onChange={(e) => updateFacebookOptions(item, { tone: e.target.value as FacebookGenerationOptions['tone'] })}>
                                              <option value="professional">Professional</option>
                                              <option value="conversational">Conversational</option>
                                              <option value="friendly">Friendly</option>
                                              <option value="educational">Educational</option>
                                              <option value="thought_leadership">Thought Leadership</option>
                                            </select>
                                          </div>
                                          <div className="field" style={{ marginBottom: 0 }}>
                                            <select value={fbOptions.length} onChange={(e) => updateFacebookOptions(item, { length: e.target.value as FacebookGenerationOptions['length'] })}>
                                              <option value="short">Short</option>
                                              <option value="medium">Medium</option>
                                              <option value="long">Long</option>
                                            </select>
                                          </div>
                                          <label className="entity-card-meta" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <input type="checkbox" checked={!!fbOptions.includeCTA} onChange={(e) => updateFacebookOptions(item, { includeCTA: e.target.checked })} />
                                            Include CTA
                                          </label>
                                          <label className="entity-card-meta" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <input type="checkbox" checked={!!fbOptions.includeHashtags} onChange={(e) => updateFacebookOptions(item, { includeHashtags: e.target.checked })} />
                                            Include hashtags
                                          </label>
                                          {fbOptions.includeHashtags && (
                                            <div className="field" style={{ marginBottom: 0 }}>
                                              <select value={fbOptions.maxHashtags} onChange={(e) => updateFacebookOptions(item, { maxHashtags: Number(e.target.value) })}>
                                                {[1, 2, 3, 4, 5].map((n) => (
                                                  <option key={n} value={n}>
                                                    Max {n} hashtag{n === 1 ? '' : 's'}
                                                  </option>
                                                ))}
                                              </select>
                                            </div>
                                          )}
                                        </div>

                                        <button className="btn btn-secondary" onClick={() => handleGenerateFacebookDraft(item, !!draft)} disabled={!!facebookBusyIds[item.id]}>
                                          {facebookBusyIds[item.id] ? 'Generating draft...' : draft ? 'Regenerate Facebook' : 'Generate Facebook'}
                                        </button>

                                        {draft && (
                                          <div style={{ marginTop: 10 }}>
                                            <div className="tag-list">
                                              <span className="tag">{draft.characterCount} chars</span>
                                              <span className="tag">{draft.wordCount} words</span>
                                              <span className="tag">{labelize(draft.tone)}</span>
                                              <span className="tag">{labelize(draft.length)}</span>
                                              <span className="tag">{draft.provider} / {draft.model}</span>
                                              {draft.usage.totalTokens !== undefined && <span className="tag">{draft.usage.totalTokens} tokens</span>}
                                              {draft.cost && <span className="tag">${draft.cost.estimated.toFixed(4)} {draft.cost.currency}</span>}
                                              <span className="tag">Prompt {draft.promptVersion}</span>
                                            </div>
                                            <div className="entity-card-meta">Generated {new Date(draft.generatedAt).toLocaleString()}</div>
                                            {draft.warnings.length > 0 && <div className="content-warning" style={{ marginTop: 6 }}>{draft.warnings.join(' ')}</div>}
                                            <pre
                                              style={{
                                                marginTop: 8,
                                                padding: 10,
                                                whiteSpace: 'pre-wrap',
                                                wordBreak: 'break-word',
                                                maxHeight: 320,
                                                overflowY: 'auto',
                                                background: 'var(--surface-muted, #f5f5f5)',
                                                borderRadius: 6,
                                              }}
                                            >
                                              {draft.content}
                                            </pre>
                                            <button className="btn btn-secondary" style={{ marginTop: 6 }} onClick={() => handleCopyFacebookDraft(draft.content)}>
                                              Copy Post
                                            </button>
                                            <ContentVersionHistory basePath={basePath} artifactId={draft.artifactId} latestVersion={draft.version} />
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}

                                  {(() => {
                                    const isInstagramEligible = item.platform !== 'linkedin' && item.platform !== 'facebook' && item.platform !== 'x';
                                    if (!isInstagramEligible) return null;
                                    const igOptions = getInstagramOptions(item);
                                    const draft = instagramCaptions[item.id];
                                    const formatNote = instagramFormatNote(item.recommendedFormat);
                                    return (
                                      <div style={{ marginTop: 10 }}>
                                        {item.platform === 'generic_social' && (
                                          <p className="entity-card-meta">Instagram is being chosen as the generation target; this social item was planned generically.</p>
                                        )}
                                        {formatNote && <p className="entity-card-meta">{formatNote}</p>}
                                        <ErrorMessage message={instagramErrors[item.id] ?? null} />
                                        {!draft && <p className="entity-card-meta">AI generation uses your configured provider and may incur usage cost.</p>}

                                        <div className="form-inline">
                                          <div className="field" style={{ marginBottom: 0 }}>
                                            <select value={igOptions.tone} onChange={(e) => updateInstagramOptions(item, { tone: e.target.value as InstagramGenerationOptions['tone'] })}>
                                              <option value="conversational">Conversational</option>
                                              <option value="friendly">Friendly</option>
                                              <option value="professional">Professional</option>
                                              <option value="educational">Educational</option>
                                              <option value="inspirational">Inspirational</option>
                                            </select>
                                          </div>
                                          <div className="field" style={{ marginBottom: 0 }}>
                                            <select value={igOptions.length} onChange={(e) => updateInstagramOptions(item, { length: e.target.value as InstagramGenerationOptions['length'] })}>
                                              <option value="short">Short</option>
                                              <option value="medium">Medium</option>
                                              <option value="long">Long</option>
                                            </select>
                                          </div>
                                          <label className="entity-card-meta" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <input type="checkbox" checked={!!igOptions.includeCTA} onChange={(e) => updateInstagramOptions(item, { includeCTA: e.target.checked })} />
                                            Include CTA
                                          </label>
                                          <label className="entity-card-meta" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <input type="checkbox" checked={!!igOptions.includeHashtags} onChange={(e) => updateInstagramOptions(item, { includeHashtags: e.target.checked })} />
                                            Include hashtags
                                          </label>
                                          {igOptions.includeHashtags && (
                                            <div className="field" style={{ marginBottom: 0 }}>
                                              <select value={igOptions.maxHashtags} onChange={(e) => updateInstagramOptions(item, { maxHashtags: Number(e.target.value) })}>
                                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                                                  <option key={n} value={n}>
                                                    Max {n} hashtag{n === 1 ? '' : 's'}
                                                  </option>
                                                ))}
                                              </select>
                                            </div>
                                          )}
                                          <label className="entity-card-meta" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <input type="checkbox" checked={!!igOptions.includeEmojis} onChange={(e) => updateInstagramOptions(item, { includeEmojis: e.target.checked })} />
                                            Include emojis
                                          </label>
                                          {igOptions.includeEmojis && (
                                            <div className="field" style={{ marginBottom: 0 }}>
                                              <select value={igOptions.maxEmojis} onChange={(e) => updateInstagramOptions(item, { maxEmojis: Number(e.target.value) })}>
                                                {[1, 2, 3, 4, 5].map((n) => (
                                                  <option key={n} value={n}>
                                                    Max {n} emoji{n === 1 ? '' : 's'}
                                                  </option>
                                                ))}
                                              </select>
                                            </div>
                                          )}
                                        </div>

                                        <button className="btn btn-secondary" onClick={() => handleGenerateInstagramCaption(item, !!draft)} disabled={!!instagramBusyIds[item.id]}>
                                          {instagramBusyIds[item.id] ? 'Generating caption...' : draft ? 'Regenerate Instagram' : 'Generate Instagram'}
                                        </button>

                                        {draft && (
                                          <div style={{ marginTop: 10 }}>
                                            <div className="tag-list">
                                              <span className="tag">{draft.characterCount} chars</span>
                                              <span className="tag">{draft.wordCount} words</span>
                                              <span className="tag">{draft.hashtagCount} hashtags</span>
                                              <span className="tag">{draft.emojiCount} emojis</span>
                                              <span className="tag">{labelize(draft.tone)}</span>
                                              <span className="tag">{labelize(draft.length)}</span>
                                              <span className="tag">{draft.provider} / {draft.model}</span>
                                              {draft.usage.totalTokens !== undefined && <span className="tag">{draft.usage.totalTokens} tokens</span>}
                                              {draft.cost && <span className="tag">${draft.cost.estimated.toFixed(4)} {draft.cost.currency}</span>}
                                              <span className="tag">Prompt {draft.promptVersion}</span>
                                            </div>
                                            <div className="entity-card-meta">Generated {new Date(draft.generatedAt).toLocaleString()}</div>
                                            {draft.warnings.length > 0 && <div className="content-warning" style={{ marginTop: 6 }}>{draft.warnings.join(' ')}</div>}
                                            <pre
                                              style={{
                                                marginTop: 8,
                                                padding: 10,
                                                whiteSpace: 'pre-wrap',
                                                wordBreak: 'break-word',
                                                maxHeight: 320,
                                                overflowY: 'auto',
                                                background: 'var(--surface-muted, #f5f5f5)',
                                                borderRadius: 6,
                                              }}
                                            >
                                              {draft.content}
                                            </pre>
                                            <button className="btn btn-secondary" style={{ marginTop: 6 }} onClick={() => handleCopyInstagramCaption(draft.content)}>
                                              Copy Caption
                                            </button>
                                            <ContentVersionHistory basePath={basePath} artifactId={draft.artifactId} latestVersion={draft.version} />
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>

        <div className="section">
          <h3 className="section-title">Video Calendar</h3>

          <ErrorMessage message={videoCalendarError} />

          {!videoCalendar && !videoCalendarBusy && <p className="muted">No video calendar has been built yet.</p>}

          <button className="btn btn-primary" onClick={handleBuildVideoCalendar} disabled={videoCalendarBusy}>
            {videoCalendarBusy ? 'Building video calendar...' : videoCalendar ? 'Rebuild Video Calendar' : 'Build Video Calendar'}
          </button>

          {videoCalendar && (
            <div style={{ marginTop: 16 }}>
              <div className="summary-grid" style={{ marginBottom: 16 }}>
                <div>
                  <span className="summary-label">Total Items</span>
                  <p>{videoCalendar.items.length}</p>
                </div>
                <div>
                  <span className="summary-label">Overall Confidence</span>
                  <p>{videoCalendar.confidenceScore}</p>
                </div>
                <div>
                  <span className="summary-label">Top Priority Items</span>
                  <p>{videoCalendar.topPriorityItemIds.length}</p>
                </div>
                <div>
                  <span className="summary-label">Weeks Represented</span>
                  <p>{videoCalendar.weeks.map((w) => `Week ${w.week}`).join(', ') || '-'}</p>
                </div>
                <div>
                  <span className="summary-label">Format Directions Represented</span>
                  <p>{videoFormats.length ? videoFormats.map((f) => labelize(f)).join(', ') : '-'}</p>
                </div>
                <div>
                  <span className="summary-label">Funnel Stages Represented</span>
                  <p>{videoFunnelStages.length ? videoFunnelStages.map((s) => labelize(s)).join(', ') : '-'}</p>
                </div>
              </div>

              {(videoCalendarMissingEvidence.length > 0 || videoCalendarWarnings.length > 0) && (
                <div className="content-warning" style={{ marginBottom: 16 }}>
                  {[...videoCalendarMissingEvidence, ...videoCalendarWarnings].join(' ')}
                </div>
              )}

              {videoCalendar.items.length === 0 ? (
                <p className="muted">No reliable video calendar was detected from the current campaign channels, formats, and content evidence.</p>
              ) : (
                <>
                  <div className="form-inline">
                    <div className="field" style={{ marginBottom: 0 }}>
                      <select value={videoTypeFilter} onChange={(e) => setVideoTypeFilter(e.target.value)}>
                        <option value="">All content types</option>
                        {videoTypes.map((t) => (
                          <option key={t} value={t}>
                            {labelize(t)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <select value={videoFormatFilter} onChange={(e) => setVideoFormatFilter(e.target.value)}>
                        <option value="">All formats</option>
                        {videoFormats.map((f) => (
                          <option key={f} value={f}>
                            {labelize(f)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <select value={videoFunnelStageFilter} onChange={(e) => setVideoFunnelStageFilter(e.target.value)}>
                        <option value="">All funnel stages</option>
                        {videoFunnelStages.map((s) => (
                          <option key={s} value={s}>
                            {labelize(s)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {filteredVideoWeeks.map((week) => {
                    const weekItems = week.itemIds.map((id) => videoCalendar.items.find((i) => i.id === id)).filter((i): i is NonNullable<typeof i> => !!i);
                    return (
                      <div className="calendar-week" key={week.week}>
                        <div className="calendar-week-header">
                          <div>
                            <strong>
                              Week {week.week} &mdash; {week.theme}
                            </strong>
                          </div>
                          <div className="entity-card-meta">
                            {weekItems.length} item{weekItems.length === 1 ? '' : 's'} &middot; Confidence {week.confidenceScore}
                          </div>
                        </div>
                        <div className="calendar-days">
                          {weekItems.map((item) => {
                            const actualDate = actualDateForDay(campaign.startDate, item.day);
                            return (
                              <div className="calendar-day" key={item.id}>
                                <div className="calendar-day-number">
                                  Day {item.day}
                                  {actualDate ? ` · ${actualDate}` : ''}
                                </div>
                                <div className="activity-card">
                                  <div className="activity-card-title">{item.title}</div>
                                  <div className="tag-list">
                                    <span className="tag">{labelize(item.type)}</span>
                                    <span className="tag">{labelize(item.formatDirection)}</span>
                                    <span className={`quality-badge ${qualityBadgeClass(scoreQuality(item.priorityScore))}`}>Priority {item.priorityScore}</span>
                                  </div>
                                  <div className="entity-card-meta">Pillar: {pillarTitleById.get(item.pillarId) ?? item.pillarId}</div>
                                  {item.topicId && <div className="entity-card-meta">Topic: {topicTitleById.get(item.topicId) ?? item.topicId}</div>}
                                  {item.sourceBlogItemId && (
                                    <div className="entity-card-meta">Repurposed from Blog: {blogTitleById.get(item.sourceBlogItemId) ?? item.sourceBlogItemId}</div>
                                  )}
                                  {item.sourceSocialItemId && (
                                    <div className="entity-card-meta">Repurposed from Social: {socialTitleById.get(item.sourceSocialItemId) ?? item.sourceSocialItemId}</div>
                                  )}
                                  {item.audienceSegmentIds.length > 0 && (
                                    <div className="entity-card-meta">Audience: {item.audienceSegmentIds.map((id) => audienceLabel(mapping, id)).join(', ')}</div>
                                  )}
                                  {item.suggestedCTA && <div className="entity-card-meta">CTA: {item.suggestedCTA}</div>}
                                  <details style={{ marginTop: 6 }}>
                                    <summary className="summary-label" style={{ cursor: 'pointer' }}>
                                      Details
                                    </summary>
                                    <div style={{ marginTop: 8 }}>
                                      <span className="summary-label">Angle</span>
                                      <p>{item.angle}</p>
                                      {item.messagingPillarIds.length > 0 && (
                                        <>
                                          <span className="summary-label">Messaging Pillars</span>
                                          <p className="entity-card-meta">{item.messagingPillarIds.join(', ')}</p>
                                        </>
                                      )}
                                      {item.keywords.length > 0 && (
                                        <>
                                          <span className="summary-label">Keywords</span>
                                          <div className="tag-list">
                                            {item.keywords.map((k, i) => (
                                              <span className="tag" key={i}>
                                                {k}
                                              </span>
                                            ))}
                                          </div>
                                        </>
                                      )}
                                      {item.relatedCampaignActivityIds.length > 0 && (
                                        <>
                                          <span className="summary-label">Related Campaign Activities</span>
                                          <p className="entity-card-meta">{item.relatedCampaignActivityIds.join(', ')}</p>
                                        </>
                                      )}
                                      {item.dependencies.length > 0 && (
                                        <>
                                          <span className="summary-label">Dependencies</span>
                                          <p className="entity-card-meta">{item.dependencies.join(', ')}</p>
                                        </>
                                      )}
                                      {item.successSignals.length > 0 && (
                                        <>
                                          <span className="summary-label">Success Signals</span>
                                          <div className="tag-list">
                                            {item.successSignals.map((s, i) => (
                                              <span className="tag" key={i}>
                                                {s}
                                              </span>
                                            ))}
                                          </div>
                                        </>
                                      )}
                                      {item.reasons.length > 0 && (
                                        <>
                                          <span className="summary-label">Reasons</span>
                                          <ul className="bullet-list">
                                            {item.reasons.map((r, i) => (
                                              <li key={i}>{r}</li>
                                            ))}
                                          </ul>
                                        </>
                                      )}
                                      {item.warnings.length > 0 && <div className="content-warning" style={{ marginTop: 8 }}>{item.warnings.join(' ')}</div>}
                                    </div>
                                  </details>

                                  {(() => {
                                    const draft = videoScripts[item.id];
                                    const scriptOptions = getVideoScriptOptions(item.id);
                                    return (
                                      <div style={{ marginTop: 10 }}>
                                        <ErrorMessage message={videoScriptErrors[item.id] ?? null} />
                                        {!draft && <p className="entity-card-meta">AI generation uses your configured provider and may incur usage cost.</p>}

                                        <div className="form-inline">
                                          <div className="field" style={{ marginBottom: 0 }}>
                                            <select value={scriptOptions.tone} onChange={(e) => updateVideoScriptOptions(item.id, { tone: e.target.value as VideoScriptGenerationOptions['tone'] })}>
                                              <option value="professional">Professional</option>
                                              <option value="conversational">Conversational</option>
                                              <option value="educational">Educational</option>
                                              <option value="energetic">Energetic</option>
                                              <option value="thought_leadership">Thought Leadership</option>
                                            </select>
                                          </div>
                                          <div className="field" style={{ marginBottom: 0 }}>
                                            <select value={scriptOptions.duration} onChange={(e) => updateVideoScriptOptions(item.id, { duration: e.target.value as VideoScriptGenerationOptions['duration'] })}>
                                              <option value="short">Short</option>
                                              <option value="medium">Medium</option>
                                              <option value="long">Long</option>
                                            </select>
                                          </div>
                                          <div className="field" style={{ marginBottom: 0 }}>
                                            <select
                                              value={scriptOptions.outputFormat}
                                              onChange={(e) => updateVideoScriptOptions(item.id, { outputFormat: e.target.value as VideoScriptGenerationOptions['outputFormat'] })}
                                            >
                                              <option value="markdown">Markdown</option>
                                              <option value="plain_text">Plain Text</option>
                                            </select>
                                          </div>
                                          <label className="entity-card-meta" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <input type="checkbox" checked={!!scriptOptions.includeHook} onChange={(e) => updateVideoScriptOptions(item.id, { includeHook: e.target.checked })} />
                                            Include hook
                                          </label>
                                          <label className="entity-card-meta" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <input
                                              type="checkbox"
                                              checked={!!scriptOptions.includeSceneDirections}
                                              onChange={(e) => updateVideoScriptOptions(item.id, { includeSceneDirections: e.target.checked })}
                                            />
                                            Include scene directions
                                          </label>
                                          <label className="entity-card-meta" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <input type="checkbox" checked={!!scriptOptions.includeCTA} onChange={(e) => updateVideoScriptOptions(item.id, { includeCTA: e.target.checked })} />
                                            Include CTA
                                          </label>
                                        </div>

                                        <button className="btn btn-secondary" onClick={() => handleGenerateVideoScript(item.id, !!draft)} disabled={!!videoScriptBusyIds[item.id]}>
                                          {videoScriptBusyIds[item.id] ? 'Generating script...' : draft ? 'Regenerate Script' : 'Generate Script'}
                                        </button>

                                        {draft && (
                                          <div style={{ marginTop: 10 }}>
                                            <div className="tag-list">
                                              <span className="tag">{draft.estimatedWordCount} words</span>
                                              <span className="tag">~{draft.estimatedDurationSeconds}s</span>
                                              <span className="tag">{labelize(draft.tone)}</span>
                                              <span className="tag">{labelize(draft.duration)}</span>
                                              <span className="tag">{draft.provider} / {draft.model}</span>
                                              {draft.usage.totalTokens !== undefined && <span className="tag">{draft.usage.totalTokens} tokens</span>}
                                              {draft.cost && <span className="tag">${draft.cost.estimated.toFixed(4)} {draft.cost.currency}</span>}
                                              <span className="tag">Prompt {draft.promptVersion}</span>
                                            </div>
                                            <div className="entity-card-meta">Generated {new Date(draft.generatedAt).toLocaleString()}</div>
                                            {draft.warnings.length > 0 && <div className="content-warning" style={{ marginTop: 6 }}>{draft.warnings.join(' ')}</div>}

                                            <span className="summary-label" style={{ marginTop: 8, display: 'block' }}>
                                              {draft.title}
                                            </span>
                                            {draft.hook && (
                                              <>
                                                <span className="summary-label">Hook</span>
                                                <p>{draft.hook}</p>
                                              </>
                                            )}

                                            {draft.scenes && draft.scenes.length > 0 ? (
                                              draft.scenes.map((scene) => (
                                                <div key={scene.order} style={{ marginTop: 8 }}>
                                                  <span className="summary-label">Scene {scene.order}</span>
                                                  <p>{scene.narration}</p>
                                                  {scene.visualDirection && <div className="entity-card-meta">Visual: {scene.visualDirection}</div>}
                                                </div>
                                              ))
                                            ) : (
                                              <pre
                                                style={{
                                                  marginTop: 8,
                                                  padding: 10,
                                                  whiteSpace: 'pre-wrap',
                                                  wordBreak: 'break-word',
                                                  maxHeight: 320,
                                                  overflowY: 'auto',
                                                  background: 'var(--surface-muted, #f5f5f5)',
                                                  borderRadius: 6,
                                                }}
                                              >
                                                {draft.script}
                                              </pre>
                                            )}

                                            <div className="tag-list" style={{ marginTop: 6 }}>
                                              <button className="btn btn-secondary" onClick={() => handleCopyVideoScript(draft)}>
                                                Copy Script
                                              </button>
                                              <button className="btn btn-secondary" onClick={() => handleCopyVideoNarrationOnly(draft)}>
                                                Copy Narration Only
                                              </button>
                                            </div>
                                            <ContentVersionHistory basePath={basePath} artifactId={draft.artifactId} latestVersion={draft.version} />
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>

        <div className="section">
          <h3 className="section-title">Cross-Channel Repurposing</h3>

          <ErrorMessage message={repurposingError} />

          {!repurposingPlan && !repurposingBusy && <p className="muted">No cross-channel repurposing plan has been built yet.</p>}

          <button className="btn btn-primary" onClick={handleBuildRepurposingPlan} disabled={repurposingBusy}>
            {repurposingBusy ? 'Building cross-channel repurposing plan...' : repurposingPlan ? 'Rebuild Repurposing Plan' : 'Build Repurposing Plan'}
          </button>

          {repurposingPlan && (
            <div style={{ marginTop: 16 }}>
              <div className="summary-grid" style={{ marginBottom: 16 }}>
                <div>
                  <span className="summary-label">Total Repurposing Items</span>
                  <p>{repurposingPlan.items.length}</p>
                </div>
                <div>
                  <span className="summary-label">Repurposing Chains</span>
                  <p>{repurposingPlan.chains.length}</p>
                </div>
                <div>
                  <span className="summary-label">Overall Confidence</span>
                  <p>{repurposingPlan.confidenceScore}</p>
                </div>
                <div>
                  <span className="summary-label">Top Priority Items</span>
                  <p>{repurposingPlan.topPriorityItemIds.length}</p>
                </div>
                <div>
                  <span className="summary-label">Existing Calendar Linkages</span>
                  <p>{repurposingPlan.items.filter((i) => i.isExistingLinkage).length}</p>
                </div>
                <div>
                  <span className="summary-label">Target Channels Represented</span>
                  <p>{repurposingTargetTypes.length ? repurposingTargetTypes.map((t) => labelize(t)).join(', ') : '-'}</p>
                </div>
              </div>

              {(repurposingMissingEvidence.length > 0 || repurposingWarnings.length > 0) && (
                <div className="content-warning" style={{ marginBottom: 16 }}>
                  {[...repurposingMissingEvidence, ...repurposingWarnings].join(' ')}
                </div>
              )}

              {repurposingPlan.items.length === 0 ? (
                <p className="muted">No reliable cross-channel repurposing opportunities were detected from the current calendars and campaign channels.</p>
              ) : (
                <>
                  <div className="form-inline">
                    <div className="field" style={{ marginBottom: 0 }}>
                      <select value={repurposingSourceFilter} onChange={(e) => setRepurposingSourceFilter(e.target.value)}>
                        <option value="">All source types</option>
                        {repurposingSourceTypes.map((t) => (
                          <option key={t} value={t}>
                            {labelize(t)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <select value={repurposingTargetFilter} onChange={(e) => setRepurposingTargetFilter(e.target.value)}>
                        <option value="">All target types</option>
                        {repurposingTargetTypes.map((t) => (
                          <option key={t} value={t}>
                            {labelize(t)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <select value={repurposingFunnelStageFilter} onChange={(e) => setRepurposingFunnelStageFilter(e.target.value)}>
                        <option value="">All funnel stages</option>
                        {repurposingFunnelStages.map((s) => (
                          <option key={s} value={s}>
                            {labelize(s)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <select value={repurposingView} onChange={(e) => setRepurposingView(e.target.value as 'chains' | 'items')}>
                        <option value="chains">Chain view</option>
                        <option value="items">Item view</option>
                      </select>
                    </div>
                  </div>

                  {filteredRepurposingChains.length === 0 && filteredRepurposingItems.length === 0 ? (
                    <p className="muted">No repurposing items match the selected filters.</p>
                  ) : repurposingView === 'chains' ? (
                    <div className="calendar-days">
                      {filteredRepurposingChains.map((chain) => {
                        const derivatives = chain.repurposingItemIds
                          .map((id) => repurposingPlan.items.find((i) => i.id === id))
                          .filter((i): i is NonNullable<typeof i> => !!i);
                        const sourceLabel = derivatives[0];
                        return (
                          <div className="activity-card" key={chain.id} style={{ minWidth: 320 }}>
                            <div className="activity-card-title">{chain.title}</div>
                            {sourceLabel && (
                              <div className="entity-card-meta">
                                Source: {labelize(sourceLabel.sourceType)} &mdash; {sourceLabel.sourceTitle}
                              </div>
                            )}
                            <div className="tag-list">
                              <span className={`quality-badge ${qualityBadgeClass(scoreQuality(chain.priorityScore))}`}>Priority {chain.priorityScore}</span>
                              <span className="tag">Confidence {chain.confidenceScore}</span>
                            </div>
                            <div style={{ marginTop: 8 }}>
                              {derivatives.map((item) => (
                                <div className="entity-card-meta" key={item.id} style={{ marginTop: 4 }}>
                                  &rarr; {labelize(item.targetType)} ({labelize(item.actionType)}): {item.targetTitle}
                                  {item.isExistingLinkage && <span className="tag" style={{ marginLeft: 6 }}>Existing calendar linkage</span>}
                                </div>
                              ))}
                            </div>
                            {chain.reasons.length > 0 && (
                              <details style={{ marginTop: 6 }}>
                                <summary className="summary-label" style={{ cursor: 'pointer' }}>
                                  Reasons
                                </summary>
                                <ul className="bullet-list">
                                  {chain.reasons.map((r, i) => (
                                    <li key={i}>{r}</li>
                                  ))}
                                </ul>
                              </details>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="calendar-days">
                      {filteredRepurposingItems.map((item) => (
                        <div className="activity-card" key={item.id} style={{ minWidth: 320 }}>
                          <div className="activity-card-title">{item.targetTitle}</div>
                          <div className="tag-list">
                            <span className="tag">{labelize(item.sourceType)} &rarr; {labelize(item.targetType)}</span>
                            <span className="tag">{labelize(item.actionType)}</span>
                            <span className="tag">{labelize(item.targetFormatDirection)}</span>
                            <span className={`quality-badge ${qualityBadgeClass(scoreQuality(item.priorityScore))}`}>Priority {item.priorityScore}</span>
                            {item.isExistingLinkage && <span className="tag">Existing calendar linkage</span>}
                          </div>
                          <div className="entity-card-meta">Source: {item.sourceTitle}</div>
                          {item.sourceDay && item.recommendedTargetDay && (
                            <div className="entity-card-meta">
                              Day {item.sourceDay} &rarr; Day {item.recommendedTargetDay}
                            </div>
                          )}
                          {item.audienceSegmentIds.length > 0 && (
                            <div className="entity-card-meta">Audience: {item.audienceSegmentIds.map((id) => audienceLabel(mapping, id)).join(', ')}</div>
                          )}
                          {item.suggestedCTA && <div className="entity-card-meta">CTA: {item.suggestedCTA}</div>}
                          <details style={{ marginTop: 6 }}>
                            <summary className="summary-label" style={{ cursor: 'pointer' }}>
                              Details
                            </summary>
                            <div style={{ marginTop: 8 }}>
                              {item.keywords.length > 0 && (
                                <>
                                  <span className="summary-label">Keywords</span>
                                  <div className="tag-list">
                                    {item.keywords.map((k, i) => (
                                      <span className="tag" key={i}>
                                        {k}
                                      </span>
                                    ))}
                                  </div>
                                </>
                              )}
                              {item.messagingPillarIds.length > 0 && (
                                <>
                                  <span className="summary-label">Messaging Pillars</span>
                                  <p className="entity-card-meta">{item.messagingPillarIds.join(', ')}</p>
                                </>
                              )}
                              {item.reasons.length > 0 && (
                                <>
                                  <span className="summary-label">Reasons</span>
                                  <ul className="bullet-list">
                                    {item.reasons.map((r, i) => (
                                      <li key={i}>{r}</li>
                                    ))}
                                  </ul>
                                </>
                              )}
                              {item.warnings.length > 0 && <div className="content-warning" style={{ marginTop: 8 }}>{item.warnings.join(' ')}</div>}
                            </div>
                          </details>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </Card>
    </AppLayout>
  );
}
