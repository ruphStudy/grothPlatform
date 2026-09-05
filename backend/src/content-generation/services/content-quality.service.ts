import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ContentQualityResult, ContentQualityResultDocument } from '../schemas/content-quality-result.schema';
import type { ContentBrandVoiceResultResponse } from '../types/content-brand-voice.types';
import type { ContentFactValidationResultResponse } from '../types/content-fact-validation.types';
import type { ContentGroundingResultResponse } from '../types/content-grounding.types';
import type { ContentOriginalityResultResponse } from '../types/content-originality.types';
import type {
  CalculateQualityInput,
  ContentQualityBlocker,
  ContentQualityDimension,
  ContentQualityDimensionType,
  ContentQualityResultResponse,
  ContentQualityStatus,
  ContentQualitySummary,
} from '../types/content-quality.types';
import type { ContentReadabilityResultResponse } from '../types/content-readability.types';
import type { ContentSeoReviewResultResponse } from '../types/content-seo-review.types';
import { ContentBrandVoiceService } from './content-brand-voice.service';
import { ContentFactValidationService } from './content-fact-validation.service';
import { ContentGroundingService } from './content-grounding.service';
import { ContentOriginalityService } from './content-originality.service';
import { ContentReadabilityService } from './content-readability.service';
import { ContentSeoReviewService } from './content-seo-review.service';

const DEFAULT_WEIGHT_GROUNDING = 25;
const DEFAULT_WEIGHT_FACT_VALIDATION = 25;
const DEFAULT_WEIGHT_SEO = 15;
const DEFAULT_WEIGHT_READABILITY = 15;
const DEFAULT_WEIGHT_BRAND_VOICE = 10;
const DEFAULT_WEIGHT_ORIGINALITY = 10;

const DEFAULT_EXCELLENT_MIN = 90;
const DEFAULT_GOOD_MIN = 80;
const DEFAULT_IMPROVEMENT_MIN = 60;

// A SEO review whose persisted checks are mostly `not_applicable` (typical
// for short-form social kinds) is treated as not meaningfully evaluable for
// quality purposes and renormalized away, rather than penalizing the score
// for structural checks that were never relevant (spec section 5).
const SEO_RELEVANCE_THRESHOLD = 0.5;

export interface ReviewsForVersion {
  grounding: ContentGroundingResultResponse | null;
  factValidation: ContentFactValidationResultResponse | null;
  seo: ContentSeoReviewResultResponse | null;
  readability: ContentReadabilityResultResponse | null;
  brandVoice: ContentBrandVoiceResultResponse | null;
  originality: ContentOriginalityResultResponse | null;
}

interface CalculatedQuality {
  dimensions: ContentQualityDimension[];
  blockers: ContentQualityBlocker[];
  strengths: string[];
  weaknesses: string[];
  warnings: string[];
  score: number;
  status: ContentQualityStatus;
}

@Injectable()
export class ContentQualityService {
  private readonly logger = new Logger(ContentQualityService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly groundingService: ContentGroundingService,
    private readonly factValidationService: ContentFactValidationService,
    private readonly seoReviewService: ContentSeoReviewService,
    private readonly readabilityService: ContentReadabilityService,
    private readonly brandVoiceService: ContentBrandVoiceService,
    private readonly originalityService: ContentOriginalityService,
    @InjectModel(ContentQualityResult.name) private readonly qualityModel: Model<ContentQualityResultDocument>,
  ) {}

  /**
   * Aggregates the persisted 16A-16F results for this exact ContentVersion
   * into one overall quality score. Never rebuilds or reruns the underlying
   * reviews — only reads what is already persisted for this version.
   * Persists (upserts) one current result per contentVersionId.
   */
  async calculateForVersion(input: CalculateQualityInput): Promise<ContentQualityResultResponse> {
    const [grounding, factValidation, seo, readability, brandVoice, originality] = await Promise.all([
      this.groundingService.getResult(input.contentVersionId),
      this.factValidationService.getResult(input.contentVersionId),
      this.seoReviewService.getResult(input.contentVersionId),
      this.readabilityService.getResult(input.contentVersionId),
      this.brandVoiceService.getResult(input.contentVersionId),
      this.originalityService.getResult(input.contentVersionId),
    ]);

    const { dimensions, blockers, strengths, weaknesses, warnings, score, status } = this.calculateFromReviews({
      grounding,
      factValidation,
      seo,
      readability,
      brandVoice,
      originality,
    });

    const calculatedAt = new Date();
    const doc = await this.qualityModel.findOneAndUpdate(
      { contentVersionId: new Types.ObjectId(input.contentVersionId) },
      {
        contentVersionId: new Types.ObjectId(input.contentVersionId),
        artifactId: new Types.ObjectId(input.artifactId),
        organizationId: new Types.ObjectId(input.organizationId),
        productId: new Types.ObjectId(input.productId),
        campaignId: new Types.ObjectId(input.campaignId),
        status,
        score,
        dimensions,
        blockers,
        strengths,
        weaknesses,
        warnings,
        calculatedAt,
      },
      { upsert: true, new: true },
    );

    this.logger.log(`contentVersionId=${input.contentVersionId} kind=quality score=${score} status=${status} blockers=${blockers.length} success=true`);

    return this.toResponse(doc);
  }

  async getResult(contentVersionId: string): Promise<ContentQualityResultResponse | null> {
    const doc = await this.qualityModel.findOne({ contentVersionId: new Types.ObjectId(contentVersionId) });
    return doc ? this.toResponse(doc) : null;
  }

  async getSummary(contentVersionId: string): Promise<ContentQualitySummary | undefined> {
    const doc = await this.qualityModel.findOne({ contentVersionId: new Types.ObjectId(contentVersionId) }).select('status score blockers');
    if (!doc) return undefined;
    return { status: doc.status, score: doc.score, blockerCount: doc.blockers.length };
  }

  async getSummariesByVersionIds(contentVersionIds: string[]): Promise<Map<string, ContentQualitySummary>> {
    if (contentVersionIds.length === 0) return new Map();
    const docs = await this.qualityModel.find({ contentVersionId: { $in: contentVersionIds.map((id) => new Types.ObjectId(id)) } }).select('contentVersionId status score blockers');
    return new Map(docs.map((d) => [d.contentVersionId.toString(), { status: d.status, score: d.score, blockerCount: d.blockers.length }]));
  }

  // ---------------------------------------------------------------------
  // Pure aggregation logic — no I/O, unit-testable. Consumes already-
  // persisted 16A-16F results; never re-derives their scoring logic.
  // ---------------------------------------------------------------------

  calculateFromReviews(reviews: ReviewsForVersion): CalculatedQuality {
    const { grounding, factValidation, seo, readability, brandVoice, originality } = reviews;
    const warnings: string[] = [];
    const blockers: ContentQualityBlocker[] = [];
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    const groundingWeight = this.getWeight('GROUNDING', DEFAULT_WEIGHT_GROUNDING);
    const factWeight = this.getWeight('FACT_VALIDATION', DEFAULT_WEIGHT_FACT_VALIDATION);
    const seoWeight = this.getWeight('SEO', DEFAULT_WEIGHT_SEO);
    const readabilityWeight = this.getWeight('READABILITY', DEFAULT_WEIGHT_READABILITY);
    const brandVoiceWeight = this.getWeight('BRAND_VOICE', DEFAULT_WEIGHT_BRAND_VOICE);
    const originalityWeight = this.getWeight('ORIGINALITY', DEFAULT_WEIGHT_ORIGINALITY);

    const dimensions: ContentQualityDimension[] = [];

    if (grounding) {
      dimensions.push(this.dim('grounding', grounding.score, groundingWeight, grounding.status, true));
    } else {
      dimensions.push(this.dim('grounding', 0, groundingWeight, 'unavailable', false));
      warnings.push('Grounding review unavailable.');
    }

    if (factValidation) {
      dimensions.push(this.dim('fact_validation', factValidation.score, factWeight, factValidation.status, true));
    } else {
      dimensions.push(this.dim('fact_validation', 0, factWeight, 'unavailable', false));
      warnings.push('Fact Validation review unavailable.');
    }

    let seoRelevant = false;
    if (seo) {
      const applicableSeoChecks = seo.checks.filter((c) => c.classification !== 'not_applicable');
      seoRelevant = seo.checks.length === 0 || applicableSeoChecks.length / seo.checks.length > SEO_RELEVANCE_THRESHOLD;
      dimensions.push(this.dim('seo', seo.score, seoWeight, seo.status, seoRelevant));
      if (!seoRelevant) warnings.push('SEO checks were mostly not applicable to this content type; SEO was excluded from the quality score.');
    } else {
      dimensions.push(this.dim('seo', 0, seoWeight, 'unavailable', false));
      warnings.push('SEO review unavailable.');
    }

    if (readability) {
      dimensions.push(this.dim('readability', readability.score, readabilityWeight, readability.status, true));
    } else {
      dimensions.push(this.dim('readability', 0, readabilityWeight, 'unavailable', false));
      warnings.push('Readability review unavailable.');
    }

    if (brandVoice) {
      dimensions.push(this.dim('brand_voice', brandVoice.score, brandVoiceWeight, brandVoice.status, true));
    } else {
      dimensions.push(this.dim('brand_voice', 0, brandVoiceWeight, 'unavailable', false));
      warnings.push('Brand Voice review unavailable.');
    }

    if (originality) {
      dimensions.push(this.dim('originality', originality.score, originalityWeight, originality.status, true));
    } else {
      dimensions.push(this.dim('originality', 0, originalityWeight, 'unavailable', false));
      warnings.push('Originality review unavailable.');
    }

    const applicableDims = dimensions.filter((d) => d.applicable);
    const totalWeight = applicableDims.reduce((sum, d) => sum + d.weight, 0);
    let score = totalWeight === 0 ? 0 : Math.round(applicableDims.reduce((sum, d) => sum + d.score * d.weight, 0) / totalWeight);
    if (totalWeight === 0) warnings.push('No review results are available to calculate a quality score.');

    // --- Blockers ---
    const factHighRiskInvalid = !!factValidation?.claims.some((c) => c.classification === 'invalid' && c.severity === 'high');
    const factCritical = factHighRiskInvalid || factValidation?.status === 'failed_validation';
    const groundingCritical = grounding?.status === 'insufficient_evidence';
    const originalitySevere = !!originality?.checks.some(
      (c) => (c.type === 'cross_version_similarity' || c.type === 'cross_artifact_similarity' || c.type === 'paragraph_duplication') && c.classification === 'failed',
    );
    const brandVoiceSevere = brandVoice?.checks.find((c) => c.type === 'avoid_rules')?.classification === 'failed';
    const seoDim = dimensions.find((d) => d.type === 'seo');
    const seoSevere = !!seoDim?.applicable && seo?.status === 'poor';

    if (groundingCritical) blockers.push({ type: 'insufficient_evidence', severity: 'high', reason: 'Grounding evidence is insufficient to support the generated claims.' });
    if (factHighRiskInvalid) {
      blockers.push({ type: 'failed_validation', severity: 'high', reason: 'Content contains a high-risk factual claim that failed validation.' });
    } else if (factValidation?.status === 'failed_validation') {
      blockers.push({ type: 'failed_validation', severity: 'medium', reason: 'Content contains factual claims that failed validation.' });
    }
    if (originalitySevere) blockers.push({ type: 'near_verbatim_match', severity: 'high', reason: 'Content is near-identical to other generated content already stored in GIP.' });
    if (brandVoiceSevere) blockers.push({ type: 'avoid_rule_violation', severity: 'high', reason: 'Content violates an explicit brand voice avoid rule.' });
    if (seoSevere) blockers.push({ type: 'seo_mismatch', severity: 'medium', reason: 'SEO structure needs significant improvement.' });

    // --- Hard caps ---
    const excellentMin = this.getEnvNumber('CONTENT_QUALITY_EXCELLENT_MIN', DEFAULT_EXCELLENT_MIN);
    const goodMin = this.getEnvNumber('CONTENT_QUALITY_GOOD_MIN', DEFAULT_GOOD_MIN);
    const improvementMin = this.getEnvNumber('CONTENT_QUALITY_IMPROVEMENT_MIN', DEFAULT_IMPROVEMENT_MIN);

    if (factCritical || groundingCritical) score = Math.min(score, goodMin - 1);
    if (factCritical && groundingCritical) score = Math.min(score, 59);
    if (originalitySevere) score = Math.min(score, excellentMin - 1);

    const bothCriticalUnavailable = !grounding && !factValidation;
    if (bothCriticalUnavailable) {
      score = Math.min(score, goodMin - 1);
      warnings.push('Grounding and Fact Validation reviews are both unavailable; quality cannot be rated good or excellent.');
    }

    const status = this.resolveStatus(score, excellentMin, goodMin, improvementMin);

    // --- Strengths / weaknesses: fixed deterministic mapping only. ---
    if (grounding && grounding.score >= 90) strengths.push('Strong factual grounding.');
    if (factValidation && factValidation.score >= 90) strengths.push('Facts are well validated.');
    if (seoDim?.applicable && seo && seo.score >= 90) strengths.push('SEO structure is strong.');
    if (readability && readability.score >= 90) strengths.push('Content is highly readable.');
    if (brandVoice && brandVoice.score >= 90) strengths.push('Brand voice is well aligned.');
    if (originality && originality.score >= 90) strengths.push('Content is highly original.');

    if (grounding && grounding.score < 60) weaknesses.push('Content contains weakly supported factual claims.');
    if (factValidation && factValidation.score < 60) weaknesses.push('Content contains factual claims that need review.');
    if (seoDim?.applicable && seo && seo.score < 60) weaknesses.push('SEO structure needs improvement.');
    if (readability && readability.score < 60) weaknesses.push('Content readability needs substantial improvement.');
    if (brandVoice && brandVoice.score < 60) weaknesses.push('Content does not align well with the requested brand voice.');
    if (originality && originality.score < 60) weaknesses.push('Content overlaps significantly with other generated content.');

    return { dimensions, blockers, strengths, weaknesses, warnings, score, status };
  }

  private dim(type: ContentQualityDimensionType, score: number, weight: number, status: string, applicable: boolean): ContentQualityDimension {
    const effectiveScore = applicable ? score : 0;
    return { type, score: effectiveScore, weight, weightedScore: Math.round((effectiveScore * weight) / 100), status, applicable };
  }

  // ---------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------

  private resolveStatus(score: number, excellentMin: number, goodMin: number, improvementMin: number): ContentQualityStatus {
    if (score >= excellentMin) return 'excellent';
    if (score >= goodMin) return 'good';
    if (score >= improvementMin) return 'needs_improvement';
    return 'poor';
  }

  private getWeight(key: string, fallback: number): number {
    return this.getEnvNumber(`CONTENT_QUALITY_WEIGHT_${key}`, fallback);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  // ---------------------------------------------------------------------
  // Mapping
  // ---------------------------------------------------------------------

  private toResponse(doc: ContentQualityResultDocument): ContentQualityResultResponse {
    return {
      contentVersionId: doc.contentVersionId.toString(),
      artifactId: doc.artifactId.toString(),
      organizationId: doc.organizationId.toString(),
      productId: doc.productId.toString(),
      campaignId: doc.campaignId.toString(),
      status: doc.status,
      score: doc.score,
      dimensions: doc.dimensions.map((d) => ({ type: d.type, score: d.score, weight: d.weight, weightedScore: d.weightedScore, status: d.status, applicable: d.applicable })),
      blockers: doc.blockers.map((b) => ({ type: b.type, severity: b.severity, reason: b.reason })),
      strengths: doc.strengths,
      weaknesses: doc.weaknesses,
      warnings: doc.warnings,
      calculatedAt: doc.calculatedAt,
    };
  }
}
