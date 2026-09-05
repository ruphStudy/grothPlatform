import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model, Types } from 'mongoose';
import { ContentGroundingResult, ContentGroundingResultDocument } from '../schemas/content-grounding-result.schema';
import {
  detectHighRisk,
  isCtaOnly,
  isRhetoricalOrOpinion,
  looksFactual,
  matchEvidence,
  splitSentences,
} from '../shared/content-claim-parsing.util';
import type {
  AnalyzeContentVersionInput,
  ContentGroundingResultResponse,
  ContentGroundingStatus,
  ContentVersionGroundingEvidenceSnapshot,
  GroundingClaim,
  GroundingClaimClassification,
} from '../types/content-grounding.types';

const DEFAULT_GROUNDED_MIN = 90;
const DEFAULT_PARTIAL_MIN = 60;

@Injectable()
export class ContentGroundingService {
  private readonly logger = new Logger(ContentGroundingService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(ContentGroundingResult.name) private readonly groundingModel: Model<ContentGroundingResultDocument>,
  ) {}

  /**
   * Deterministic, non-AI grounding of already-generated text against the
   * evidence boundary captured at generation time. Persists (upserts) one
   * current result per contentVersionId.
   */
  async analyzeContentVersion(input: AnalyzeContentVersionInput): Promise<ContentGroundingResultResponse> {
    const claims = this.extractAndClassifyClaims(input.text, input.evidence);

    const supportedClaimCount = claims.filter((c) => c.classification === 'supported').length;
    const unsupportedClaimCount = claims.filter((c) => c.classification === 'unsupported').length;
    const uncertainClaimCount = claims.filter((c) => c.classification === 'uncertain').length;
    const checkable = supportedClaimCount + unsupportedClaimCount + uncertainClaimCount;

    const warnings: string[] = [];
    let score: number;
    if (checkable === 0) {
      score = 100;
      warnings.push('No checkable factual claims were detected.');
    } else {
      score = Math.round((supportedClaimCount / checkable) * 100);
    }
    const status = this.resolveStatus(score);

    const checkedAt = new Date();
    const doc = await this.groundingModel.findOneAndUpdate(
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
        supportedClaimCount,
        unsupportedClaimCount,
        uncertainClaimCount,
        warnings,
        checkedAt,
      },
      { upsert: true, new: true },
    );

    this.logger.log(
      `contentVersionId=${input.contentVersionId} kind=grounding score=${score} status=${status} supported=${supportedClaimCount} unsupported=${unsupportedClaimCount} uncertain=${uncertainClaimCount} success=true`,
    );

    return this.toResponse(doc);
  }

  async getResult(contentVersionId: string): Promise<ContentGroundingResultResponse | null> {
    const doc = await this.groundingModel.findOne({ contentVersionId: new Types.ObjectId(contentVersionId) });
    return doc ? this.toResponse(doc) : null;
  }

  async getSummary(contentVersionId: string): Promise<{ status: ContentGroundingStatus; score: number; unsupportedClaimCount: number; uncertainClaimCount: number } | undefined> {
    const doc = await this.groundingModel.findOne({ contentVersionId: new Types.ObjectId(contentVersionId) }).select('status score unsupportedClaimCount uncertainClaimCount');
    if (!doc) return undefined;
    return { status: doc.status, score: doc.score, unsupportedClaimCount: doc.unsupportedClaimCount, uncertainClaimCount: doc.uncertainClaimCount };
  }

  async getSummariesByVersionIds(
    contentVersionIds: string[],
  ): Promise<Map<string, { status: ContentGroundingStatus; score: number; unsupportedClaimCount: number; uncertainClaimCount: number }>> {
    if (contentVersionIds.length === 0) return new Map();
    const docs = await this.groundingModel
      .find({ contentVersionId: { $in: contentVersionIds.map((id) => new Types.ObjectId(id)) } })
      .select('contentVersionId status score unsupportedClaimCount uncertainClaimCount');
    return new Map(docs.map((d) => [d.contentVersionId.toString(), { status: d.status, score: d.score, unsupportedClaimCount: d.unsupportedClaimCount, uncertainClaimCount: d.uncertainClaimCount }]));
  }

  // ---------------------------------------------------------------------
  // Pure claim extraction / classification — no I/O, unit-testable.
  // ---------------------------------------------------------------------

  extractAndClassifyClaims(text: string, evidence: ContentVersionGroundingEvidenceSnapshot | undefined): GroundingClaim[] {
    const sentences = splitSentences(text);
    return sentences.map((sentence) => this.classifySentence(sentence, evidence));
  }

  private classifySentence(sentence: string, evidence: ContentVersionGroundingEvidenceSnapshot | undefined): GroundingClaim {
    const id = randomUUID();

    // Question/opinion/generic-advice phrasing is non-factual regardless of
    // anything else in the sentence.
    if (isRhetoricalOrOpinion(sentence)) {
      return { id, text: sentence, classification: 'non_factual', evidenceRefs: [], reason: 'Rhetorical question or generic/opinion phrasing.' };
    }

    // High-risk detection runs before the plain-CTA check so a CTA-shaped
    // sentence that also embeds a real claim (e.g. "Get started for $19/month")
    // is still evaluated as that claim, not waved through as pure CTA text.
    const highRisk = detectHighRisk(sentence);
    if (highRisk) {
      const proofEvidence = [...(evidence?.proofPoints ?? []), ...(evidence?.facts ?? [])];
      const match = matchEvidence(sentence, proofEvidence);
      if (match.strength === 'strong') {
        return { id, text: sentence, classification: 'supported', evidenceRefs: match.refs, reason: `${highRisk.label} claim matches recorded proof/fact evidence.` };
      }
      return {
        id,
        text: sentence,
        classification: 'unsupported',
        evidenceRefs: [],
        reason: `${highRisk.label} claims require explicit proof/fact evidence; none is available.`,
      };
    }

    if (isCtaOnly(sentence)) {
      return { id, text: sentence, classification: 'non_factual', evidenceRefs: [], reason: 'CTA instruction with no embedded factual claim.' };
    }

    if (!looksFactual(sentence)) {
      return { id, text: sentence, classification: 'non_factual', evidenceRefs: [], reason: 'No factual claim pattern detected.' };
    }

    const candidateEvidence = this.buildCandidateEvidence(evidence);
    const match = matchEvidence(sentence, candidateEvidence);
    if (match.strength === 'strong') {
      return { id, text: sentence, classification: 'supported', evidenceRefs: match.refs, reason: 'Matches available product/context evidence.' };
    }
    if (match.strength === 'partial') {
      return { id, text: sentence, classification: 'uncertain', evidenceRefs: match.refs, reason: 'Partial overlap with available evidence; not a confident match.' };
    }
    return { id, text: sentence, classification: 'unsupported', evidenceRefs: [], reason: 'No matching evidence found for this claim.' };
  }

  private buildCandidateEvidence(evidence: ContentVersionGroundingEvidenceSnapshot | undefined): string[] {
    if (!evidence) return [];
    const identity = [evidence.productName, evidence.productCategory, evidence.productDescription, evidence.valueProposition].filter((v): v is string => !!v);
    return [
      ...identity,
      ...evidence.capabilities,
      ...evidence.useCases,
      ...evidence.differentiators,
      ...evidence.pains,
      ...evidence.goals,
      ...evidence.objections,
      ...evidence.proofPoints,
      ...evidence.facts,
    ];
  }

  // ---------------------------------------------------------------------
  // Scoring
  // ---------------------------------------------------------------------

  private resolveStatus(score: number): ContentGroundingStatus {
    if (score >= this.getGroundedMin()) return 'grounded';
    if (score >= this.getPartialMin()) return 'partially_grounded';
    return 'insufficient_evidence';
  }

  private getGroundedMin(): number {
    return this.getEnvNumber('CONTENT_GROUNDING_GROUNDED_MIN', DEFAULT_GROUNDED_MIN);
  }

  private getPartialMin(): number {
    return this.getEnvNumber('CONTENT_GROUNDING_PARTIAL_MIN', DEFAULT_PARTIAL_MIN);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  // ---------------------------------------------------------------------
  // Mapping
  // ---------------------------------------------------------------------

  private toResponse(doc: ContentGroundingResultDocument): ContentGroundingResultResponse {
    return {
      contentVersionId: doc.contentVersionId.toString(),
      artifactId: doc.artifactId.toString(),
      organizationId: doc.organizationId.toString(),
      productId: doc.productId.toString(),
      campaignId: doc.campaignId.toString(),
      status: doc.status,
      score: doc.score,
      claims: doc.claims.map((c) => ({ id: c.id, text: c.text, classification: c.classification as GroundingClaimClassification, evidenceRefs: c.evidenceRefs, reason: c.reason })),
      supportedClaimCount: doc.supportedClaimCount,
      unsupportedClaimCount: doc.unsupportedClaimCount,
      uncertainClaimCount: doc.uncertainClaimCount,
      warnings: doc.warnings,
      checkedAt: doc.checkedAt,
    };
  }
}
