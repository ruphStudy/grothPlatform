import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model, Types } from 'mongoose';
import { ContentFactValidationResult, ContentFactValidationResultDocument } from '../schemas/content-fact-validation-result.schema';
import {
  detectHighRisk,
  isCtaOnly,
  isRhetoricalOrOpinion,
  looksFactual,
  matchEvidence,
  splitSentences,
} from '../shared/content-claim-parsing.util';
import type { ContentVersionGroundingEvidenceSnapshot } from '../types/content-grounding.types';
import type {
  ContentFactValidationResultResponse,
  ContentFactValidationStatus,
  ContentFactValidationSummary,
  FactValidationClaim,
  FactValidationClaimFactType,
  ValidateContentVersionInput,
} from '../types/content-fact-validation.types';

const DEFAULT_VALIDATED_MIN = 90;
const DEFAULT_REVIEW_MIN = 60;
const HIGH_SEVERITY_SCORE_CAP = 59;

// Maps 16A's shared high-risk detection categories onto 16B's stricter
// fact-type taxonomy. Every one of these fact types is "high-risk": it can
// only be validated against explicit proofPoints/facts, never general
// messaging evidence.
const HIGH_RISK_FACT_TYPE_MAP: Record<string, FactValidationClaimFactType> = {
  customer_count: 'customer_result',
  revenue_roi: 'number',
  superlative: 'comparison',
  guarantee: 'guarantee',
  certification: 'certification',
  integration: 'integration',
  pricing: 'pricing',
  testimonial: 'customer_result',
  award: 'market_claim',
  competitor: 'comparison',
  numeric_stat: 'number',
};

const HIGH_RISK_FACT_TYPES = new Set<FactValidationClaimFactType>([
  'number', 'pricing', 'comparison', 'proof', 'customer_result', 'integration', 'certification', 'guarantee', 'market_claim',
]);

// Overreaching/absolute wording ("supports every file type") is rejected
// outright rather than softened, even without a high-risk pattern hit.
const ABSOLUTE_OVERREACH_PATTERN = /\b(every|all|any|unlimited|entirely|completely|instantly|always|fully automat\w*)\b/i;

// Soft outcome wording ("improves confidence", "boosts performance") that
// may be directionally true but is stronger than what the evidence states —
// treated as needs_review rather than flatly invalid when some related
// capability evidence exists at all.
const OUTCOME_WORDS_PATTERN = /\b(confidence|performance|success rate|results?|outcomes?|improves?|increases?|boosts?|enhances?|maximizes?|lands?( you)? a job|get hired|ace (the|your))\b/i;

// Common capability phrasing ("Users can upload...", "You can create...")
// that the shared CAPABILITY_VERB_PATTERN verb list doesn't cover.
const MODAL_CAPABILITY_PATTERN = /\busers?\s+can\b|\byou\s+can\b/i;

@Injectable()
export class ContentFactValidationService {
  private readonly logger = new Logger(ContentFactValidationService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(ContentFactValidationResult.name) private readonly validationModel: Model<ContentFactValidationResultDocument>,
  ) {}

  /**
   * Deterministic, non-AI, stricter-than-grounding fact validation of
   * already-generated text against the same evidence snapshot 16A uses.
   * Persists (upserts) one current result per contentVersionId.
   */
  async validateContentVersion(input: ValidateContentVersionInput): Promise<ContentFactValidationResultResponse> {
    const claims = this.validateTextAgainstEvidence(input.text, input.evidence);

    const validatedClaimCount = claims.filter((c) => c.classification === 'validated').length;
    const reviewClaimCount = claims.filter((c) => c.classification === 'needs_review').length;
    const failedClaimCount = claims.filter((c) => c.classification === 'invalid').length;
    const checkable = validatedClaimCount + reviewClaimCount + failedClaimCount;

    const warnings: string[] = [];
    let score: number;
    if (checkable === 0) {
      score = 100;
      warnings.push('No checkable factual claims were detected.');
    } else {
      const weightSum = validatedClaimCount * 1 + reviewClaimCount * 0.5;
      score = Math.round((weightSum / checkable) * 100);
    }

    const anyHighSeverityInvalid = claims.some((c) => c.classification === 'invalid' && c.severity === 'high');
    if (anyHighSeverityInvalid) {
      score = Math.min(score, HIGH_SEVERITY_SCORE_CAP);
    }

    let status = this.resolveStatus(score);
    // Belt-and-suspenders: a high-severity invalid claim can never yield
    // "validated", even if scoring math were ever adjusted later.
    if (anyHighSeverityInvalid && status === 'validated') status = 'failed_validation';

    const validatedAt = new Date();
    const doc = await this.validationModel.findOneAndUpdate(
      { contentVersionId: new Types.ObjectId(input.contentVersionId) },
      {
        contentVersionId: new Types.ObjectId(input.contentVersionId),
        artifactId: new Types.ObjectId(input.artifactId),
        organizationId: new Types.ObjectId(input.organizationId),
        productId: new Types.ObjectId(input.productId),
        campaignId: new Types.ObjectId(input.campaignId),
        status,
        score,
        claims,
        validatedClaimCount,
        reviewClaimCount,
        failedClaimCount,
        warnings,
        validatedAt,
      },
      { upsert: true, new: true },
    );

    this.logger.log(
      `contentVersionId=${input.contentVersionId} kind=fact_validation score=${score} status=${status} validated=${validatedClaimCount} review=${reviewClaimCount} failed=${failedClaimCount} success=true`,
    );

    return this.toResponse(doc);
  }

  async getResult(contentVersionId: string): Promise<ContentFactValidationResultResponse | null> {
    const doc = await this.validationModel.findOne({ contentVersionId: new Types.ObjectId(contentVersionId) });
    return doc ? this.toResponse(doc) : null;
  }

  async getSummary(contentVersionId: string): Promise<ContentFactValidationSummary | undefined> {
    const doc = await this.validationModel.findOne({ contentVersionId: new Types.ObjectId(contentVersionId) }).select('status score reviewClaimCount failedClaimCount');
    if (!doc) return undefined;
    return { status: doc.status, score: doc.score, reviewClaimCount: doc.reviewClaimCount, failedClaimCount: doc.failedClaimCount };
  }

  async getSummariesByVersionIds(contentVersionIds: string[]): Promise<Map<string, ContentFactValidationSummary>> {
    if (contentVersionIds.length === 0) return new Map();
    const docs = await this.validationModel
      .find({ contentVersionId: { $in: contentVersionIds.map((id) => new Types.ObjectId(id)) } })
      .select('contentVersionId status score reviewClaimCount failedClaimCount');
    return new Map(docs.map((d) => [d.contentVersionId.toString(), { status: d.status, score: d.score, reviewClaimCount: d.reviewClaimCount, failedClaimCount: d.failedClaimCount }]));
  }

  // ---------------------------------------------------------------------
  // Pure claim extraction / classification — no I/O, unit-testable. Reuses
  // 16A's shared sentence-splitting/high-risk-detection/matching primitives;
  // applies 16B's stricter fact-type rules on top.
  // ---------------------------------------------------------------------

  validateTextAgainstEvidence(text: string, evidence: ContentVersionGroundingEvidenceSnapshot | undefined): FactValidationClaim[] {
    const sentences = splitSentences(text);
    return sentences.map((sentence) => this.classifySentence(sentence, evidence));
  }

  private classifySentence(sentence: string, evidence: ContentVersionGroundingEvidenceSnapshot | undefined): FactValidationClaim {
    const id = randomUUID();

    if (isRhetoricalOrOpinion(sentence)) {
      return this.claim(id, sentence, 'non_factual', 'other', [], 'Rhetorical question or generic/opinion phrasing.', 'low');
    }

    const highRisk = detectHighRisk(sentence);
    if (highRisk) {
      const factType = HIGH_RISK_FACT_TYPE_MAP[highRisk.category] ?? 'proof';
      const proofEvidence = [...(evidence?.proofPoints ?? []), ...(evidence?.facts ?? [])];
      const match = matchEvidence(sentence, proofEvidence);
      if (match.strength === 'strong') {
        return this.claim(id, sentence, 'validated', factType, match.refs, `${highRisk.label} claim matches explicit proof/fact evidence.`, 'low');
      }
      return this.claim(id, sentence, 'invalid', factType, [], `${highRisk.label} claims require explicit, verified proof/fact evidence; none is available.`, 'high');
    }

    if (isCtaOnly(sentence)) {
      return this.claim(id, sentence, 'non_factual', 'other', [], 'CTA instruction with no embedded factual claim.', 'low');
    }

    // 16B checks a slightly wider set of sentences than 16A's shared gate:
    // modal capability phrasing ("Users can upload...") and soft-outcome
    // wording ("Improves performance...") are claims worth validating even
    // though they don't use one of the shared CAPABILITY_VERB_PATTERN verbs.
    // This is local to fact validation — the shared `looksFactual` used by
    // 16A grounding is untouched.
    if (!looksFactual(sentence) && !MODAL_CAPABILITY_PATTERN.test(sentence) && !OUTCOME_WORDS_PATTERN.test(sentence)) {
      return this.claim(id, sentence, 'non_factual', 'other', [], 'No factual claim pattern detected.', 'low');
    }

    // Product identity check first — an explicit identity match is always
    // validated regardless of capability wording in the same sentence.
    const identityEvidence = this.buildIdentityEvidence(evidence);
    const identityMatch = matchEvidence(sentence, identityEvidence);
    if (identityMatch.strength === 'strong') {
      return this.claim(id, sentence, 'validated', 'product_fact', identityMatch.refs, 'Matches explicit product identity evidence.', 'low');
    }

    const capabilityEvidence = this.buildCapabilityEvidence(evidence);
    const capabilityMatch = matchEvidence(sentence, capabilityEvidence);
    if (capabilityMatch.strength === 'strong') {
      return this.claim(id, sentence, 'validated', 'capability', capabilityMatch.refs, 'Matches explicit supported-capability evidence.', 'low');
    }

    if (identityMatch.strength === 'partial') {
      return this.claim(id, sentence, 'needs_review', 'product_fact', identityMatch.refs, 'Partially overlaps with product identity evidence; treat cautiously.', 'medium');
    }

    // Absolute/overreaching wording ("every", "always", "100%" scope claims)
    // is rejected outright rather than softened to needs_review.
    if (ABSOLUTE_OVERREACH_PATTERN.test(sentence)) {
      return this.claim(id, sentence, 'invalid', 'capability', [], 'Overreaching/absolute claim is not explicitly supported.', 'medium');
    }

    if (capabilityMatch.strength === 'partial') {
      return this.claim(id, sentence, 'needs_review', 'capability', capabilityMatch.refs, 'Partially overlaps with capability evidence; not a confident exact match.', 'medium');
    }

    // A soft outcome claim (e.g. "improves confidence") stronger than the
    // literal evidence wording is flagged for review rather than rejected,
    // as long as some related capability evidence exists at all.
    if (OUTCOME_WORDS_PATTERN.test(sentence) && capabilityEvidence.length > 0) {
      return this.claim(id, sentence, 'needs_review', 'capability', [], 'Outcome claim is stronger than the available capability evidence.', 'medium');
    }

    return this.claim(id, sentence, 'invalid', 'capability', [], 'No matching evidence found for this claim.', 'medium');
  }

  private claim(
    id: string,
    text: string,
    classification: FactValidationClaim['classification'],
    factType: FactValidationClaimFactType,
    evidenceRefs: string[],
    reason: string,
    severityHint: FactValidationClaim['severity'],
  ): FactValidationClaim {
    const severity: FactValidationClaim['severity'] =
      classification === 'invalid' && HIGH_RISK_FACT_TYPES.has(factType) ? 'high' : classification === 'validated' || classification === 'non_factual' ? 'low' : severityHint;
    return { id, text, classification, factType, evidenceRefs, reason, severity };
  }

  private buildIdentityEvidence(evidence: ContentVersionGroundingEvidenceSnapshot | undefined): string[] {
    if (!evidence) return [];
    return [evidence.productName, evidence.productCategory, evidence.productDescription, evidence.valueProposition].filter((v): v is string => !!v);
  }

  private buildCapabilityEvidence(evidence: ContentVersionGroundingEvidenceSnapshot | undefined): string[] {
    if (!evidence) return [];
    return [...evidence.capabilities, ...evidence.useCases, ...evidence.differentiators, ...evidence.proofPoints, ...evidence.facts];
  }

  // ---------------------------------------------------------------------
  // Scoring
  // ---------------------------------------------------------------------

  private resolveStatus(score: number): ContentFactValidationStatus {
    if (score >= this.getValidatedMin()) return 'validated';
    if (score >= this.getReviewMin()) return 'needs_review';
    return 'failed_validation';
  }

  private getValidatedMin(): number {
    return this.getEnvNumber('CONTENT_FACT_VALIDATED_MIN', DEFAULT_VALIDATED_MIN);
  }

  private getReviewMin(): number {
    return this.getEnvNumber('CONTENT_FACT_REVIEW_MIN', DEFAULT_REVIEW_MIN);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  // ---------------------------------------------------------------------
  // Mapping
  // ---------------------------------------------------------------------

  private toResponse(doc: ContentFactValidationResultDocument): ContentFactValidationResultResponse {
    return {
      contentVersionId: doc.contentVersionId.toString(),
      artifactId: doc.artifactId.toString(),
      organizationId: doc.organizationId.toString(),
      productId: doc.productId.toString(),
      campaignId: doc.campaignId.toString(),
      status: doc.status,
      score: doc.score,
      claims: doc.claims.map((c) => ({ id: c.id, text: c.text, classification: c.classification, factType: c.factType, evidenceRefs: c.evidenceRefs, reason: c.reason, severity: c.severity })),
      validatedClaimCount: doc.validatedClaimCount,
      reviewClaimCount: doc.reviewClaimCount,
      failedClaimCount: doc.failedClaimCount,
      warnings: doc.warnings,
      validatedAt: doc.validatedAt,
    };
  }
}
