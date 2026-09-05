import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model, Types } from 'mongoose';
import { ContentGroundingResult, ContentGroundingResultDocument } from '../schemas/content-grounding-result.schema';
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

// Function words / marketing filler excluded from token-overlap matching so
// a single shared generic word (e.g. "platform") can never by itself count
// as evidence support (required: Test H).
const GENERIC_NOISE_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'of', 'for', 'with', 'and', 'or', 'to', 'in',
  'on', 'at', 'by', 'as', 'that', 'this', 'it', 'its', 'their', 'your', 'our', 'you', 'we', 'they', 'them',
  'platform', 'solution', 'solutions', 'product', 'products', 'service', 'services', 'tool', 'tools', 'app',
  'application', 'best', 'leading', 'top', 'most', 'trusted', 'only', 'great', 'amazing', 'powerful', 'innovative',
  'business', 'businesses', 'company', 'companies', 'users', 'user', 'customers', 'customer', 'client', 'clients',
  'help', 'helps', 'helping', 'use', 'uses', 'using', 'get', 'gets', 'make', 'makes', 'today', 'now', 'more',
]);

const CTA_START_PATTERN = /^(click|join|sign\s?up|get\s+started|download|try|book|subscribe|share|learn\s+more|discover|explore|start|contact|visit|register|apply|schedule|request)\b/i;

const OPINION_MARKERS = /\b(we believe|in our opinion|imagine|picture this|isn'?t it|what if|you might think|it'?s no secret)\b/i;

const GENERIC_ADVICE_PHRASES = /\b(in conclusion|in summary|the bottom line|at the end of the day|preparation is key|practice makes perfect|now more than ever|in today'?s (world|competitive|fast-paced))\b/i;

interface HighRiskMatch {
  category: string;
  label: string;
}

const HIGH_RISK_PATTERNS: (HighRiskMatch & { pattern: RegExp })[] = [
  { category: 'customer_count', label: 'Customer/user count', pattern: /\b\d[\d,]*\+?\s*(customers?|users?|candidates?|clients?|companies|businesses)\b/i },
  { category: 'revenue_roi', label: 'Revenue/ROI', pattern: /\b(revenue|roi|return on investment)\b/i },
  { category: 'superlative', label: 'Superlative/ranking', pattern: /(#\s?1|\bnumber\s+one\b|\bbest\b|\bleading\b|\bmost trusted\b|\btop[- ]rated\b|\bunmatched\b|\bunrivaled\b|\bworld[- ]class\b)/i },
  { category: 'guarantee', label: 'Guarantee', pattern: /\b(guarantee[sd]?|100%\s*(guarantee|success))\b/i },
  { category: 'certification', label: 'Certification/compliance', pattern: /\b(certified|certification|compliant|compliance|gdpr|soc\s?2|iso\s?\d+|hipaa)\b/i },
  { category: 'integration', label: 'Named integration', pattern: /\b(integrates?\s+with|integration\s+with|works?\s+with|compatible\s+with|connects?\s+to)\b/i },
  { category: 'pricing', label: 'Pricing', pattern: /([$₹€£]\s?\d)|\bpricing\b|\bper\s?(month|year)\b|\bfree\s?trial\b/i },
  { category: 'testimonial', label: 'Testimonial/case study', pattern: /\b(testimonial|case study|success story|according to)\b/i },
  { category: 'award', label: 'Award', pattern: /\b(award(ed)?|winner|recognized by)\b/i },
  { category: 'competitor', label: 'Competitor comparison', pattern: /\b(better than|outperforms|beats|versus|vs\.?)\s+\w+/i },
  { category: 'numeric_stat', label: 'Numeric statistic', pattern: /\b\d[\d,]*(\.\d+)?%/ },
];

const CAPABILITY_VERB_PATTERN = /\b(supports?|enables?|helps?|provides?|offers?|automates?|generates?|analyz(e|es)|manages?|creates?|delivers?|includes?|allows?|lets you|features?)\b/i;

interface MatchResult {
  strength: 'strong' | 'partial' | 'none';
  refs: string[];
}

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
    const sentences = this.splitSentences(text);
    return sentences.map((sentence) => this.classifySentence(sentence, evidence));
  }

  private classifySentence(sentence: string, evidence: ContentVersionGroundingEvidenceSnapshot | undefined): GroundingClaim {
    const id = randomUUID();

    // Question/opinion/generic-advice phrasing is non-factual regardless of
    // anything else in the sentence.
    if (this.isRhetoricalOrOpinion(sentence)) {
      return { id, text: sentence, classification: 'non_factual', evidenceRefs: [], reason: 'Rhetorical question or generic/opinion phrasing.' };
    }

    // High-risk detection runs before the plain-CTA check so a CTA-shaped
    // sentence that also embeds a real claim (e.g. "Get started for $19/month")
    // is still evaluated as that claim, not waved through as pure CTA text.
    const highRisk = this.detectHighRisk(sentence);
    if (highRisk) {
      const proofEvidence = [...(evidence?.proofPoints ?? []), ...(evidence?.facts ?? [])];
      const match = this.matchEvidence(sentence, proofEvidence);
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

    if (CTA_START_PATTERN.test(sentence.trim())) {
      return { id, text: sentence, classification: 'non_factual', evidenceRefs: [], reason: 'CTA instruction with no embedded factual claim.' };
    }

    if (!this.looksFactual(sentence)) {
      return { id, text: sentence, classification: 'non_factual', evidenceRefs: [], reason: 'No factual claim pattern detected.' };
    }

    const candidateEvidence = this.buildCandidateEvidence(evidence);
    const match = this.matchEvidence(sentence, candidateEvidence);
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
  // Sentence-level heuristics
  // ---------------------------------------------------------------------

  private splitSentences(text: string): string[] {
    return text
      .replace(/\r/g, '')
      .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9])/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 6);
  }

  private isRhetoricalOrOpinion(sentence: string): boolean {
    if (sentence.trim().endsWith('?')) return true;
    if (OPINION_MARKERS.test(sentence)) return true;
    if (GENERIC_ADVICE_PHRASES.test(sentence)) return true;
    return false;
  }

  private detectHighRisk(sentence: string): HighRiskMatch | null {
    for (const rule of HIGH_RISK_PATTERNS) {
      if (rule.pattern.test(sentence)) return { category: rule.category, label: rule.label };
    }
    return null;
  }

  private looksFactual(sentence: string): boolean {
    if (CAPABILITY_VERB_PATTERN.test(sentence)) return true;
    if (/\bis\s+(a|an)\b/i.test(sentence)) return true;
    if (/\d/.test(sentence)) return true;
    return false;
  }

  // ---------------------------------------------------------------------
  // Deterministic evidence matching
  // ---------------------------------------------------------------------

  private matchEvidence(claimText: string, evidenceItems: string[]): MatchResult {
    const claimTokens = this.significantTokens(claimText);
    if (claimTokens.size === 0 || evidenceItems.length === 0) return { strength: 'none', refs: [] };

    const normalizedClaim = this.normalize(claimText);
    let bestRatio = 0;
    let bestOverlap = 0;
    let bestItem: string | undefined;
    let containmentMatch: string | undefined;

    for (const item of evidenceItems) {
      const normalizedItem = this.normalize(item);
      if (!normalizedItem) continue;

      if (normalizedItem.length > 8 && (normalizedClaim.includes(normalizedItem) || normalizedItem.includes(normalizedClaim))) {
        containmentMatch = item;
        break;
      }

      const itemTokens = this.significantTokens(item);
      if (itemTokens.size === 0) continue;
      const overlap = [...claimTokens].filter((t) => itemTokens.has(t)).length;
      const ratio = overlap / Math.max(1, Math.min(claimTokens.size, itemTokens.size));
      if (overlap > bestOverlap || (overlap === bestOverlap && ratio > bestRatio)) {
        bestOverlap = overlap;
        bestRatio = ratio;
        bestItem = item;
      }
    }

    if (containmentMatch) return { strength: 'strong', refs: [containmentMatch] };
    if (bestOverlap >= 2 && bestRatio >= 0.6) return { strength: 'strong', refs: bestItem ? [bestItem] : [] };
    if (bestOverlap >= 2 && bestRatio >= 0.3) return { strength: 'partial', refs: bestItem ? [bestItem] : [] };
    return { strength: 'none', refs: [] };
  }

  private significantTokens(text: string): Set<string> {
    return new Set(
      this.normalize(text)
        .split(/\s+/)
        .filter((t) => t.length > 2 && !GENERIC_NOISE_WORDS.has(t)),
    );
  }

  private normalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
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
