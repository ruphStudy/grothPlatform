import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model, Types } from 'mongoose';
import { ContentHumanReviewResult, ContentHumanReviewResultDocument } from '../schemas/content-human-review-result.schema';
import type { ContentBrandVoiceResultResponse } from '../types/content-brand-voice.types';
import type { ContentFactValidationResultResponse } from '../types/content-fact-validation.types';
import type { ContentGroundingResultResponse } from '../types/content-grounding.types';
import type {
  ContentHumanReviewResultResponse,
  ContentHumanReviewSummary,
  EvaluateHumanReviewInput,
  HumanReviewDecision,
  HumanReviewReason,
  HumanReviewReasonCategory,
  HumanReviewReasonSeverity,
} from '../types/content-human-review.types';
import type { ContentOriginalityResultResponse } from '../types/content-originality.types';
import type { ContentQualityResultResponse } from '../types/content-quality.types';
import type { ContentReadabilityResultResponse } from '../types/content-readability.types';
import type { ContentSeoReviewResultResponse } from '../types/content-seo-review.types';
import { ContentBrandVoiceService } from './content-brand-voice.service';
import { ContentFactValidationService } from './content-fact-validation.service';
import { ContentGroundingService } from './content-grounding.service';
import { ContentOriginalityService } from './content-originality.service';
import { ContentQualityService } from './content-quality.service';
import { ContentReadabilityService } from './content-readability.service';
import { ContentSeoReviewService } from './content-seo-review.service';

const DEFAULT_AUTO_CLEAR_MIN = 85;
const DEFAULT_REQUIRED_BELOW = 60;

// Renormalized risk-score weights (spec section 15). Higher risk
// contribution = 100 - dimension score, so a low review score raises risk.
const RISK_WEIGHTS: Record<'fact_validation' | 'grounding' | 'quality' | 'originality' | 'brand_voice' | 'readability' | 'seo', number> = {
  fact_validation: 30,
  grounding: 25,
  quality: 20,
  originality: 10,
  brand_voice: 5,
  readability: 5,
  seo: 5,
};

const SEO_RELEVANCE_THRESHOLD = 0.5;

export interface ReviewsForHumanReview {
  grounding: ContentGroundingResultResponse | null;
  factValidation: ContentFactValidationResultResponse | null;
  seo: ContentSeoReviewResultResponse | null;
  readability: ContentReadabilityResultResponse | null;
  brandVoice: ContentBrandVoiceResultResponse | null;
  originality: ContentOriginalityResultResponse | null;
  quality: ContentQualityResultResponse | null;
}

interface RuleOutcome {
  ruleId: string;
  forces: 'required' | 'recommended';
  reason: HumanReviewReason;
}

interface EvaluatedDecision {
  decision: HumanReviewDecision;
  riskScore: number;
  reasons: HumanReviewReason[];
  triggeredRuleIds: string[];
  evaluatedQualityScore?: number;
}

@Injectable()
export class ContentHumanReviewService {
  private readonly logger = new Logger(ContentHumanReviewService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly groundingService: ContentGroundingService,
    private readonly factValidationService: ContentFactValidationService,
    private readonly seoReviewService: ContentSeoReviewService,
    private readonly readabilityService: ContentReadabilityService,
    private readonly brandVoiceService: ContentBrandVoiceService,
    private readonly originalityService: ContentOriginalityService,
    private readonly qualityService: ContentQualityService,
    @InjectModel(ContentHumanReviewResult.name) private readonly humanReviewModel: Model<ContentHumanReviewResultDocument>,
  ) {}

  /**
   * Aggregates the persisted 16A-16G results for this exact ContentVersion
   * into a deterministic human-review decision. Answers only "does this
   * need human review?" — never an approval/publish decision (Sprint 28),
   * and never reruns any underlying review. Persists (upserts) one current
   * result per contentVersionId.
   */
  async evaluateForVersion(input: EvaluateHumanReviewInput): Promise<ContentHumanReviewResultResponse> {
    const [grounding, factValidation, seo, readability, brandVoice, originality, quality] = await Promise.all([
      this.groundingService.getResult(input.contentVersionId),
      this.factValidationService.getResult(input.contentVersionId),
      this.seoReviewService.getResult(input.contentVersionId),
      this.readabilityService.getResult(input.contentVersionId),
      this.brandVoiceService.getResult(input.contentVersionId),
      this.originalityService.getResult(input.contentVersionId),
      this.qualityService.getResult(input.contentVersionId),
    ]);

    const evaluated = this.evaluateFromReviews({ grounding, factValidation, seo, readability, brandVoice, originality, quality });

    const evaluatedAt = new Date();
    const doc = await this.humanReviewModel.findOneAndUpdate(
      { contentVersionId: new Types.ObjectId(input.contentVersionId) },
      {
        contentVersionId: new Types.ObjectId(input.contentVersionId),
        artifactId: new Types.ObjectId(input.artifactId),
        organizationId: new Types.ObjectId(input.organizationId),
        productId: new Types.ObjectId(input.productId),
        campaignId: new Types.ObjectId(input.campaignId),
        decision: evaluated.decision,
        riskScore: evaluated.riskScore,
        reasons: evaluated.reasons,
        triggeredRuleIds: evaluated.triggeredRuleIds,
        evaluatedQualityScore: evaluated.evaluatedQualityScore,
        evaluatedAt,
      },
      { upsert: true, new: true },
    );

    this.logger.log(
      `contentVersionId=${input.contentVersionId} kind=human_review decision=${evaluated.decision} riskScore=${evaluated.riskScore} rules=${evaluated.triggeredRuleIds.length} success=true`,
    );

    return this.toResponse(doc);
  }

  async getResult(contentVersionId: string): Promise<ContentHumanReviewResultResponse | null> {
    const doc = await this.humanReviewModel.findOne({ contentVersionId: new Types.ObjectId(contentVersionId) });
    return doc ? this.toResponse(doc) : null;
  }

  async getSummary(contentVersionId: string): Promise<ContentHumanReviewSummary | undefined> {
    const doc = await this.humanReviewModel.findOne({ contentVersionId: new Types.ObjectId(contentVersionId) }).select('decision riskScore reasons');
    if (!doc) return undefined;
    return { decision: doc.decision, riskScore: doc.riskScore, reasonCount: doc.reasons.length };
  }

  async getSummariesByVersionIds(contentVersionIds: string[]): Promise<Map<string, ContentHumanReviewSummary>> {
    if (contentVersionIds.length === 0) return new Map();
    const docs = await this.humanReviewModel.find({ contentVersionId: { $in: contentVersionIds.map((id) => new Types.ObjectId(id)) } }).select('contentVersionId decision riskScore reasons');
    return new Map(docs.map((d) => [d.contentVersionId.toString(), { decision: d.decision, riskScore: d.riskScore, reasonCount: d.reasons.length }]));
  }

  // ---------------------------------------------------------------------
  // Pure decision logic — no I/O, unit-testable. Consumes already-
  // persisted 16A-16G results; never re-derives their scoring logic.
  // ---------------------------------------------------------------------

  evaluateFromReviews(reviews: ReviewsForHumanReview): EvaluatedDecision {
    const { grounding, factValidation, seo, readability, brandVoice, originality, quality } = reviews;
    const requiredBelow = this.getRequiredBelow();
    const autoClearMin = this.getAutoClearMin();

    const outcomes: RuleOutcome[] = [];

    // --- Fact Validation (critical) ---
    if (!factValidation) {
      outcomes.push(this.rule('FACT_VALIDATION_UNAVAILABLE', 'required', 'fact_validation', 'critical', 'Fact Validation results are unavailable; factual safety was not evaluated.'));
    } else {
      const highRiskInvalid = factValidation.claims.some((c) => c.classification === 'invalid' && c.severity === 'high');
      if (highRiskInvalid) {
        outcomes.push(this.rule('FACT_HIGH_RISK_INVALID', 'required', 'fact_validation', 'critical', 'A high-severity invalid factual claim was found.'));
      } else if (factValidation.status === 'failed_validation') {
        outcomes.push(this.rule('FACT_VALIDATION_FAILED', 'required', 'fact_validation', 'high', 'Fact Validation failed for this content.'));
      } else if (factValidation.status === 'needs_review' && factValidation.reviewClaimCount > 0) {
        outcomes.push(this.rule('FACT_NEEDS_REVIEW', 'recommended', 'fact_validation', 'medium', 'Factual claims need review.'));
      }
    }

    // --- Grounding (critical) ---
    if (!grounding) {
      outcomes.push(this.rule('GROUNDING_UNAVAILABLE', 'required', 'grounding', 'critical', 'Grounding results are unavailable; factual safety was not evaluated.'));
    } else if (grounding.status === 'insufficient_evidence') {
      if (grounding.claims.length > 0) {
        outcomes.push(this.rule('GROUNDING_INSUFFICIENT', 'required', 'grounding', 'critical', 'Grounding evidence is insufficient to support the generated factual claims.'));
      } else {
        outcomes.push(this.rule('GROUNDING_INSUFFICIENT', 'recommended', 'grounding', 'medium', 'Grounding evidence is insufficient.'));
      }
    } else if (grounding.status === 'partially_grounded') {
      outcomes.push(this.rule('GROUNDING_PARTIAL', 'recommended', 'grounding', 'medium', 'Content is only partially grounded in supplied evidence.'));
    }

    // --- Originality ---
    if (!originality) {
      outcomes.push(this.rule('ORIGINALITY_UNAVAILABLE', 'recommended', 'originality', 'low', 'Originality review is unavailable.'));
    } else {
      const severeMatch = originality.checks.some(
        (c) => (c.type === 'cross_version_similarity' || c.type === 'cross_artifact_similarity' || c.type === 'paragraph_duplication') && c.classification === 'failed',
      );
      if (severeMatch) {
        outcomes.push(this.rule('ORIGINALITY_SEVERE', 'required', 'originality', 'critical', 'A severe near-verbatim match with other generated content was found.'));
      } else if (originality.status === 'highly_repetitive') {
        outcomes.push(this.rule('ORIGINALITY_NEEDS_REVIEW', 'recommended', 'originality', 'medium', 'Originality score indicates high internal/cross-content repetition.'));
      } else if (originality.status === 'needs_review') {
        outcomes.push(this.rule('ORIGINALITY_NEEDS_REVIEW', 'recommended', 'originality', 'low', 'Originality needs review.'));
      }
    }

    // --- Brand Voice ---
    if (!brandVoice) {
      outcomes.push(this.rule('BRAND_VOICE_UNAVAILABLE', 'recommended', 'brand_voice', 'low', 'Brand Voice review is unavailable.'));
    } else {
      const avoidSevere = brandVoice.checks.find((c) => c.type === 'avoid_rules')?.classification === 'failed';
      if (avoidSevere) {
        outcomes.push(this.rule('BRAND_AVOID_VIOLATION', 'required', 'brand_voice', 'critical', 'Content violates an explicit brand voice avoid rule.'));
      } else if (brandVoice.status === 'misaligned') {
        outcomes.push(this.rule('BRAND_MISALIGNED', 'recommended', 'brand_voice', 'medium', 'Brand voice is misaligned with the requested tone/style.'));
      } else if (brandVoice.status === 'needs_adjustment') {
        outcomes.push(this.rule('BRAND_NEEDS_ADJUSTMENT', 'recommended', 'brand_voice', 'low', 'Brand voice needs adjustment.'));
      }
    }

    // --- SEO (never mandatory alone, unless escalated) ---
    let seoApplicable = false;
    if (!seo) {
      outcomes.push(this.rule('SEO_UNAVAILABLE', 'recommended', 'seo', 'low', 'SEO review is unavailable.'));
    } else {
      const applicableChecks = seo.checks.filter((c) => c.classification !== 'not_applicable');
      seoApplicable = seo.checks.length === 0 || applicableChecks.length / seo.checks.length > SEO_RELEVANCE_THRESHOLD;
      if (seoApplicable && seo.status === 'poor') {
        const topicMismatch = seo.checks.find((c) => c.type === 'topic_alignment')?.classification === 'failed';
        const escalate = topicMismatch && !!quality && quality.score < requiredBelow;
        outcomes.push(this.rule('SEO_POOR', escalate ? 'required' : 'recommended', 'seo', escalate ? 'high' : 'medium', 'SEO structure needs significant improvement.'));
      }
    }

    // --- Readability (never mandatory alone, unless escalated) ---
    if (!readability) {
      outcomes.push(this.rule('READABILITY_UNAVAILABLE', 'recommended', 'readability', 'low', 'Readability review is unavailable.'));
    } else if (readability.status === 'difficult') {
      const unusable = readability.score < 30;
      const escalate = unusable && !!quality && quality.score < requiredBelow;
      outcomes.push(this.rule('READABILITY_DIFFICULT', escalate ? 'required' : 'recommended', 'readability', escalate ? 'high' : 'medium', 'Content readability is difficult.'));
    }

    // --- Quality ---
    let evaluatedQualityScore: number | undefined;
    if (!quality) {
      outcomes.push(this.rule('QUALITY_UNAVAILABLE', 'recommended', 'quality', 'low', 'Quality score is unavailable.'));
    } else {
      evaluatedQualityScore = quality.score;
      if (quality.score < requiredBelow) {
        outcomes.push(this.rule('QUALITY_BELOW_REQUIRED', 'required', 'quality', 'high', `Overall quality score (${quality.score}) is below the required threshold.`));
      } else if (quality.score < autoClearMin) {
        outcomes.push(this.rule('QUALITY_BELOW_AUTO_CLEAR', 'recommended', 'quality', 'low', `Overall quality score (${quality.score}) is below the auto-clear threshold.`));
      }
    }

    const forcedRequired = outcomes.some((o) => o.forces === 'required');
    const forcedRecommended = outcomes.some((o) => o.forces === 'recommended');
    const decision: HumanReviewDecision = forcedRequired ? 'review_required' : forcedRecommended ? 'review_recommended' : 'auto_clear';

    let riskScore = this.computeRiskScore({ grounding, factValidation, seo: seoApplicable ? seo : null, readability, brandVoice, originality, quality });
    if (decision === 'review_required') riskScore = Math.max(riskScore, 75);
    else if (decision === 'review_recommended') riskScore = Math.max(riskScore, 21);

    return {
      decision,
      riskScore,
      reasons: outcomes.map((o) => o.reason),
      triggeredRuleIds: outcomes.map((o) => o.ruleId),
      evaluatedQualityScore,
    };
  }

  private computeRiskScore(reviews: {
    grounding: ContentGroundingResultResponse | null;
    factValidation: ContentFactValidationResultResponse | null;
    seo: ContentSeoReviewResultResponse | null;
    readability: ContentReadabilityResultResponse | null;
    brandVoice: ContentBrandVoiceResultResponse | null;
    originality: ContentOriginalityResultResponse | null;
    quality: ContentQualityResultResponse | null;
  }): number {
    let weightedSum = 0;
    let totalWeight = 0;
    const add = (score: number | undefined, weight: number) => {
      if (score === undefined) return;
      weightedSum += weight * (100 - score);
      totalWeight += weight;
    };
    add(reviews.factValidation?.score, RISK_WEIGHTS.fact_validation);
    add(reviews.grounding?.score, RISK_WEIGHTS.grounding);
    add(reviews.quality?.score, RISK_WEIGHTS.quality);
    add(reviews.originality?.score, RISK_WEIGHTS.originality);
    add(reviews.brandVoice?.score, RISK_WEIGHTS.brand_voice);
    add(reviews.readability?.score, RISK_WEIGHTS.readability);
    add(reviews.seo?.score, RISK_WEIGHTS.seo);

    // No dimension available at all — treat as maximum risk rather than a
    // falsely reassuring 0; the critical-unavailable rules above already
    // force review_required in this case.
    if (totalWeight === 0) return 100;
    return Math.round(weightedSum / totalWeight);
  }

  private rule(ruleId: string, forces: 'required' | 'recommended', category: HumanReviewReasonCategory, severity: HumanReviewReasonSeverity, reason: string): RuleOutcome {
    return { ruleId, forces, reason: { id: randomUUID(), category, severity, reason } };
  }

  // ---------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------

  private getAutoClearMin(): number {
    return this.getEnvNumber('CONTENT_HUMAN_REVIEW_AUTO_CLEAR_MIN', DEFAULT_AUTO_CLEAR_MIN);
  }

  private getRequiredBelow(): number {
    return this.getEnvNumber('CONTENT_HUMAN_REVIEW_REQUIRED_BELOW', DEFAULT_REQUIRED_BELOW);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  // ---------------------------------------------------------------------
  // Mapping
  // ---------------------------------------------------------------------

  private toResponse(doc: ContentHumanReviewResultDocument): ContentHumanReviewResultResponse {
    return {
      contentVersionId: doc.contentVersionId.toString(),
      artifactId: doc.artifactId.toString(),
      organizationId: doc.organizationId.toString(),
      productId: doc.productId.toString(),
      campaignId: doc.campaignId.toString(),
      decision: doc.decision,
      riskScore: doc.riskScore,
      reasons: doc.reasons.map((r) => ({ id: r.id, category: r.category, severity: r.severity, reason: r.reason })),
      triggeredRuleIds: doc.triggeredRuleIds,
      evaluatedQualityScore: doc.evaluatedQualityScore,
      evaluatedAt: doc.evaluatedAt,
    };
  }
}
