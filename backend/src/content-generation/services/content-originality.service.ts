import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model, Types } from 'mongoose';
import { ContentArtifact, ContentArtifactDocument } from '../schemas/content-artifact.schema';
import { ContentOriginalityResult, ContentOriginalityResultDocument } from '../schemas/content-originality-result.schema';
import { ContentVersion, ContentVersionDocument } from '../schemas/content-version.schema';
import { GENERIC_NOISE_WORDS, splitSentences } from '../shared/content-claim-parsing.util';
import type { ContentGenerationKind } from '../types/content-generation.types';
import type {
  ContentOriginalityResultResponse,
  ContentOriginalityStatus,
  ContentOriginalitySummary,
  OriginalityCheck,
  OriginalityCheckClassification,
  OriginalityCheckType,
  ReviewOriginalityInput,
} from '../types/content-originality.types';
import { ContentReadabilityService } from './content-readability.service';

const DEFAULT_MIN_SENTENCE_WORDS = 6;
const DEFAULT_NGRAM_SIZE = 6;
const DEFAULT_WARNING_SIMILARITY = 0.55;
const DEFAULT_FAIL_SIMILARITY = 0.8;
const DEFAULT_MAX_COMPARISONS = 50;
const DEFAULT_GOOD_MIN = 85;
const DEFAULT_REVIEW_MIN = 60;

// Same-artifact regeneration and same-source cross-platform repurposing are
// both EXPECTED to share wording/topic (16F spec sections 9-12) — they need
// a higher similarity before being flagged than two otherwise-unrelated
// artifacts, so normal topic continuity/repurposing is never penalized.
const EXPECTED_SIMILARITY_WARNING_BOOST = 0.25;
const EXPECTED_SIMILARITY_FAIL_BOOST = 0.15;

// Substantial-paragraph filter: repeated short lines (a single heading,
// greeting, or CTA) are common and harmless; only longer repeated blocks are
// a "high-confidence issue" per spec section 7.
const MIN_SUBSTANTIAL_PARAGRAPH_CHARS = 40;
const MIN_TEMPLATE_LINE_CHARS = 20;

type OriginalityRelationship = 'same_artifact' | 'other_artifact';

interface ComparableText {
  tokens: Set<string>;
  sentences: string[];
}

interface CandidateInfo {
  versionId: string;
  artifactId: string;
  version: number;
  kind: ContentGenerationKind;
  sourceType: string;
  sourceId: string;
  relationship: OriginalityRelationship;
  comparable: ComparableText;
}

const CLASSIFICATION_SCORE: Record<Exclude<OriginalityCheckClassification, 'not_applicable'>, number> = {
  passed: 100,
  warning: 50,
  failed: 0,
};

// Sums to 100 across the checks that actually move the score: internal
// uniqueness (sentence_duplication 15 + paragraph_duplication 20 = 35),
// cross-version originality (25), cross-artifact originality (30),
// template/phrase repetition (phrase_repetition 5 + template_repetition 5 =
// 10). internal_repetition is an informational rollup (weight 0) — it still
// appears in `checks` but never affects `score`.
const CHECK_WEIGHTS: Partial<Record<OriginalityCheckType, number>> = {
  sentence_duplication: 15,
  paragraph_duplication: 20,
  cross_version_similarity: 25,
  cross_artifact_similarity: 30,
  phrase_repetition: 5,
  template_repetition: 5,
};

@Injectable()
export class ContentOriginalityService {
  private readonly logger = new Logger(ContentOriginalityService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly readabilityService: ContentReadabilityService,
    @InjectModel(ContentOriginalityResult.name) private readonly originalityModel: Model<ContentOriginalityResultDocument>,
    @InjectModel(ContentVersion.name) private readonly versionModel: Model<ContentVersionDocument>,
    @InjectModel(ContentArtifact.name) private readonly artifactModel: Model<ContentArtifactDocument>,
  ) {}

  /**
   * Deterministic, non-AI originality review of an already-generated
   * version against other generated content already stored in GIP (never
   * the public internet). Persists (upserts) one current result per
   * contentVersionId.
   */
  async reviewContentVersion(input: ReviewOriginalityInput): Promise<ContentOriginalityResultResponse> {
    const candidates = await this.fetchCandidates(input);
    const { checks, duplicateSentenceCount, duplicateParagraphCount, crossContentMatchCount } = this.reviewText({
      text: input.text,
      kind: input.kind,
      sourceId: input.sourceId,
      candidates,
    });

    const passedCount = checks.filter((c) => c.classification === 'passed').length;
    const warningCount = checks.filter((c) => c.classification === 'warning').length;
    const failedCount = checks.filter((c) => c.classification === 'failed').length;

    const applicable = checks.filter((c) => c.classification !== 'not_applicable' && (CHECK_WEIGHTS[c.type] ?? 0) > 0);
    const totalWeight = applicable.reduce((sum, c) => sum + (CHECK_WEIGHTS[c.type] ?? 0), 0);

    const warnings: string[] = ['Originality is evaluated only against generated content currently stored in GIP; it is not an internet-wide plagiarism check.'];
    let score: number;
    if (totalWeight === 0) {
      score = 100;
      warnings.push('No checkable originality signals were detected.');
    } else {
      const weightedSum = applicable.reduce(
        (sum, c) => sum + (CHECK_WEIGHTS[c.type] ?? 0) * CLASSIFICATION_SCORE[c.classification as Exclude<OriginalityCheckClassification, 'not_applicable'>],
        0,
      );
      score = Math.round(weightedSum / totalWeight);
    }

    const severeMatch = checks.some(
      (c) => (c.type === 'cross_version_similarity' || c.type === 'cross_artifact_similarity' || c.type === 'paragraph_duplication') && c.classification === 'failed',
    );
    if (severeMatch) {
      score = Math.min(score, this.getGoodMin() - 1);
    }

    let status = this.resolveStatus(score);
    if (severeMatch && status === 'original') status = 'needs_review';

    const reviewedAt = new Date();
    const doc = await this.originalityModel.findOneAndUpdate(
      { contentVersionId: new Types.ObjectId(input.contentVersionId) },
      {
        contentVersionId: new Types.ObjectId(input.contentVersionId),
        artifactId: new Types.ObjectId(input.artifactId),
        organizationId: new Types.ObjectId(input.organizationId),
        productId: new Types.ObjectId(input.productId),
        campaignId: new Types.ObjectId(input.campaignId),
        status,
        score,
        checks,
        passedCount,
        warningCount,
        failedCount,
        duplicateSentenceCount,
        duplicateParagraphCount,
        crossContentMatchCount,
        warnings,
        reviewedAt,
      },
      { upsert: true, new: true },
    );

    this.logger.log(
      `contentVersionId=${input.contentVersionId} kind=originality score=${score} status=${status} passed=${passedCount} warning=${warningCount} failed=${failedCount} candidates=${candidates.length} success=true`,
    );

    return this.toResponse(doc);
  }

  async getResult(contentVersionId: string): Promise<ContentOriginalityResultResponse | null> {
    const doc = await this.originalityModel.findOne({ contentVersionId: new Types.ObjectId(contentVersionId) });
    return doc ? this.toResponse(doc) : null;
  }

  async getSummary(contentVersionId: string): Promise<ContentOriginalitySummary | undefined> {
    const doc = await this.originalityModel.findOne({ contentVersionId: new Types.ObjectId(contentVersionId) }).select('status score duplicateSentenceCount crossContentMatchCount');
    if (!doc) return undefined;
    return { status: doc.status, score: doc.score, duplicateSentenceCount: doc.duplicateSentenceCount, crossContentMatchCount: doc.crossContentMatchCount };
  }

  async getSummariesByVersionIds(contentVersionIds: string[]): Promise<Map<string, ContentOriginalitySummary>> {
    if (contentVersionIds.length === 0) return new Map();
    const docs = await this.originalityModel
      .find({ contentVersionId: { $in: contentVersionIds.map((id) => new Types.ObjectId(id)) } })
      .select('contentVersionId status score duplicateSentenceCount crossContentMatchCount');
    return new Map(
      docs.map((d) => [d.contentVersionId.toString(), { status: d.status, score: d.score, duplicateSentenceCount: d.duplicateSentenceCount, crossContentMatchCount: d.crossContentMatchCount }]),
    );
  }

  // ---------------------------------------------------------------------
  // Candidate fetching — the only I/O in this service. Bounded, tenant-safe,
  // priority-ordered: same artifact's own prior versions first, then other
  // artifacts in the same campaign, then other recent artifacts in the same
  // product. Never crosses organization/product boundaries.
  // ---------------------------------------------------------------------

  private async fetchCandidates(input: ReviewOriginalityInput): Promise<CandidateInfo[]> {
    const maxComparisons = this.getMaxComparisons();
    const currentObjectId = new Types.ObjectId(input.contentVersionId);
    const artifactObjectId = new Types.ObjectId(input.artifactId);
    const organizationId = new Types.ObjectId(input.organizationId);
    const productId = new Types.ObjectId(input.productId);
    const campaignId = new Types.ObjectId(input.campaignId);

    const candidates: CandidateInfo[] = [];
    const seenArtifactIds = new Set<string>([input.artifactId]);

    const sameArtifactVersions = await this.versionModel
      .find({ artifactId: artifactObjectId, _id: { $ne: currentObjectId } })
      .sort({ version: -1 })
      .limit(Math.min(maxComparisons, 10))
      .exec();
    for (const v of sameArtifactVersions) candidates.push(this.toCandidateInfo(v, 'same_artifact'));

    if (candidates.length < maxComparisons) {
      const remaining = maxComparisons - candidates.length;
      const campaignArtifacts = await this.artifactModel
        .find({ organizationId, productId, campaignId, _id: { $ne: artifactObjectId }, latestVersionId: { $exists: true } })
        .sort({ updatedAt: -1 })
        .limit(remaining)
        .exec();
      for (const a of campaignArtifacts) seenArtifactIds.add(a._id.toString());
      const versionIds = campaignArtifacts.map((a) => a.latestVersionId).filter((id): id is Types.ObjectId => !!id);
      if (versionIds.length > 0) {
        const versions = await this.versionModel.find({ _id: { $in: versionIds } }).exec();
        for (const v of versions) candidates.push(this.toCandidateInfo(v, 'other_artifact'));
      }
    }

    if (candidates.length < maxComparisons) {
      const remaining = maxComparisons - candidates.length;
      const productArtifacts = await this.artifactModel
        .find({ organizationId, productId, _id: { $nin: [...seenArtifactIds].map((id) => new Types.ObjectId(id)) }, latestVersionId: { $exists: true } })
        .sort({ updatedAt: -1 })
        .limit(remaining)
        .exec();
      const versionIds = productArtifacts.map((a) => a.latestVersionId).filter((id): id is Types.ObjectId => !!id);
      if (versionIds.length > 0) {
        const versions = await this.versionModel.find({ _id: { $in: versionIds } }).exec();
        for (const v of versions) candidates.push(this.toCandidateInfo(v, 'other_artifact'));
      }
    }

    return candidates.slice(0, maxComparisons);
  }

  private toCandidateInfo(v: ContentVersionDocument, relationship: OriginalityRelationship): CandidateInfo {
    const text = this.readabilityService.extractReadableText(v.kind, v.payload);
    return {
      versionId: v._id.toString(),
      artifactId: v.artifactId.toString(),
      version: v.version,
      kind: v.kind,
      sourceType: v.sourceType,
      sourceId: v.sourceId,
      relationship,
      comparable: this.buildComparable(text),
    };
  }

  // ---------------------------------------------------------------------
  // Pure review logic — no I/O, unit-testable. Candidates are pre-fetched.
  // ---------------------------------------------------------------------

  reviewText(input: { text: string; kind: ContentGenerationKind; sourceId: string; candidates: CandidateInfo[] }): {
    checks: OriginalityCheck[];
    duplicateSentenceCount: number;
    duplicateParagraphCount: number;
    crossContentMatchCount: number;
  } {
    const { text, kind, sourceId, candidates } = input;
    const current = this.buildComparable(text);
    const currentSentencesRaw = splitSentences(text);

    const sentenceResult = this.checkSentenceDuplication(text);
    const paragraphResult = this.checkParagraphDuplication(text);
    const phraseCheck = this.checkPhraseRepetition(text);
    const internalCheck = this.rollupInternal(sentenceResult.check, paragraphResult.check, phraseCheck);
    const versionResult = this.checkCrossVersionSimilarity(current, candidates);
    const artifactResult = this.checkCrossArtifactSimilarity(current, sourceId, kind, candidates);
    const templateCheck = this.checkTemplateRepetition(currentSentencesRaw, candidates);

    return {
      checks: [internalCheck, sentenceResult.check, paragraphResult.check, phraseCheck, versionResult.check, artifactResult.check, templateCheck],
      duplicateSentenceCount: sentenceResult.duplicateCount,
      duplicateParagraphCount: paragraphResult.duplicateCount,
      crossContentMatchCount: (versionResult.matched ? 1 : 0) + artifactResult.matchCount,
    };
  }

  private checkSentenceDuplication(text: string): { check: OriginalityCheck; duplicateCount: number } {
    const sentences = splitSentences(text);
    const minWords = this.getMinSentenceWords();
    const eligible = sentences.filter((s) => s.split(/\s+/).filter(Boolean).length >= minWords);
    if (eligible.length < 2) return { check: this.check('sentence_duplication', 'not_applicable', 'Not enough content to assess internal sentence duplication.'), duplicateCount: 0 };

    const normalized = eligible.map((s) => this.normalizeForComparison(s)).filter((s) => s.length > 15);
    const counts = new Map<string, number>();
    for (const s of normalized) counts.set(s, (counts.get(s) ?? 0) + 1);
    const repeated = [...counts.entries()].filter(([, count]) => count > 1).map(([s]) => s);

    if (repeated.length === 0) return { check: this.check('sentence_duplication', 'passed', 'No significant repeated sentences detected within this content.'), duplicateCount: 0 };
    const classification: OriginalityCheckClassification = repeated.length >= 3 ? 'failed' : 'warning';
    return {
      check: this.check('sentence_duplication', classification, `Found ${repeated.length} repeated sentence(s) within this content.`, repeated.slice(0, 3)),
      duplicateCount: repeated.length,
    };
  }

  private checkParagraphDuplication(text: string): { check: OriginalityCheck; duplicateCount: number } {
    const paragraphs = text
      .split(/\n{2,}/)
      .map((p) => this.normalizeForComparison(p))
      .filter((p) => p.length >= MIN_SUBSTANTIAL_PARAGRAPH_CHARS);
    if (paragraphs.length < 2) return { check: this.check('paragraph_duplication', 'not_applicable', 'Not enough substantial paragraphs to assess duplication.'), duplicateCount: 0 };

    const counts = new Map<string, number>();
    for (const p of paragraphs) counts.set(p, (counts.get(p) ?? 0) + 1);
    const repeated = [...counts.entries()].filter(([, count]) => count > 1).map(([p]) => p);

    if (repeated.length === 0) return { check: this.check('paragraph_duplication', 'passed', 'No repeated substantial paragraphs detected.'), duplicateCount: 0 };
    // A repeated substantial paragraph is a high-confidence issue (spec section 7).
    return {
      check: this.check('paragraph_duplication', 'failed', `Found ${repeated.length} repeated substantial paragraph(s) within this content.`, repeated.slice(0, 2).map((p) => p.slice(0, 120))),
      duplicateCount: repeated.length,
    };
  }

  private checkPhraseRepetition(text: string): OriginalityCheck {
    const normalized = this.normalizeForComparison(text);
    const words = normalized.split(' ').filter(Boolean);
    const n = this.getNgramSize();
    if (words.length < n * 2) return this.check('phrase_repetition', 'not_applicable', 'Not enough content to assess phrase repetition.');

    const counts = new Map<string, number>();
    for (let i = 0; i + n <= words.length; i++) {
      const phrase = words.slice(i, i + n).join(' ');
      if (this.isGenericPhrase(phrase)) continue;
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
    }
    const repeated = [...counts.entries()].filter(([, count]) => count >= 3).map(([phrase]) => phrase);
    if (repeated.length === 0) return this.check('phrase_repetition', 'passed', 'No excessively repeated meaningful phrases detected.');
    return this.check('phrase_repetition', 'warning', `Found ${repeated.length} meaningful phrase(s) repeated 3 or more times.`, repeated.slice(0, 3));
  }

  private rollupInternal(sentenceCheck: OriginalityCheck, paragraphCheck: OriginalityCheck, phraseCheck: OriginalityCheck): OriginalityCheck {
    const classifications = [sentenceCheck.classification, paragraphCheck.classification, phraseCheck.classification];
    if (classifications.includes('failed')) return this.check('internal_repetition', 'failed', 'Internal repetition issues were found — see the sentence/paragraph/phrase checks for detail.');
    if (classifications.includes('warning')) return this.check('internal_repetition', 'warning', 'Some internal repetition was detected — see the sentence/paragraph/phrase checks for detail.');
    if (classifications.every((c) => c === 'not_applicable')) return this.check('internal_repetition', 'not_applicable', 'Not enough content to assess internal repetition.');
    return this.check('internal_repetition', 'passed', 'No significant internal repetition detected.');
  }

  private checkCrossVersionSimilarity(current: ComparableText, candidates: CandidateInfo[]): { check: OriginalityCheck; matched: boolean } {
    const sameArtifact = candidates.filter((c) => c.relationship === 'same_artifact');
    if (sameArtifact.length === 0) return { check: this.check('cross_version_similarity', 'not_applicable', 'No prior versions of this artifact are available for comparison.'), matched: false };

    const { warningThreshold, failThreshold } = this.getThresholds(true);
    let best = { similarity: 0, candidate: undefined as CandidateInfo | undefined };
    for (const c of sameArtifact) {
      const similarity = this.similarityScore(current, c.comparable);
      if (similarity > best.similarity) best = { similarity, candidate: c };
    }

    if (!best.candidate || best.similarity < warningThreshold) {
      return { check: this.check('cross_version_similarity', 'passed', 'Content is meaningfully different from prior versions of this artifact.'), matched: false };
    }
    const percent = Math.round(best.similarity * 100);
    if (best.similarity >= failThreshold) {
      return {
        check: this.check('cross_version_similarity', 'failed', `Nearly identical to version ${best.candidate.version} of this artifact (${percent}% similar).`, undefined, best.candidate.versionId, best.candidate.artifactId),
        matched: true,
      };
    }
    return {
      check: this.check('cross_version_similarity', 'warning', `Substantially similar to version ${best.candidate.version} of this artifact (${percent}% similar).`, undefined, best.candidate.versionId, best.candidate.artifactId),
      matched: true,
    };
  }

  private checkCrossArtifactSimilarity(current: ComparableText, currentSourceId: string, currentKind: ContentGenerationKind, candidates: CandidateInfo[]): { check: OriginalityCheck; matchCount: number } {
    const others = candidates.filter((c) => c.relationship === 'other_artifact');
    if (others.length === 0) return { check: this.check('cross_artifact_similarity', 'not_applicable', 'No other artifacts in this product are available for comparison.'), matchCount: 0 };

    let matchCount = 0;
    let worstClassification: Exclude<OriginalityCheckClassification, 'not_applicable'> = 'passed';
    let worstSimilarity = 0;
    let worstMatch: CandidateInfo | undefined;

    for (const c of others) {
      const isExpectedSimilarity = c.sourceId === currentSourceId && c.kind !== currentKind;
      const { warningThreshold, failThreshold } = this.getThresholds(isExpectedSimilarity);
      const similarity = this.similarityScore(current, c.comparable);
      if (similarity < warningThreshold) continue;

      matchCount++;
      const classification: Exclude<OriginalityCheckClassification, 'not_applicable'> = similarity >= failThreshold ? 'failed' : 'warning';
      const isMoreSevere = classification === 'failed' && worstClassification !== 'failed';
      const isMoreSimilarAtSameSeverity = classification === worstClassification && similarity > worstSimilarity;
      if (isMoreSevere || isMoreSimilarAtSameSeverity || !worstMatch) {
        worstClassification = classification;
        worstSimilarity = similarity;
        worstMatch = c;
      }
    }

    if (!worstMatch || worstClassification === 'passed') {
      return { check: this.check('cross_artifact_similarity', 'passed', 'Content is meaningfully different from other artifacts in this product.'), matchCount };
    }
    const percent = Math.round(worstSimilarity * 100);
    const reason =
      worstClassification === 'failed'
        ? `Nearly identical to another ${worstMatch.kind} artifact (${percent}% similar).`
        : `Substantially similar to another ${worstMatch.kind} artifact (${percent}% similar).`;
    return { check: this.check('cross_artifact_similarity', worstClassification, reason, undefined, worstMatch.versionId, worstMatch.artifactId), matchCount };
  }

  private checkTemplateRepetition(currentSentencesRaw: string[], candidates: CandidateInfo[]): OriginalityCheck {
    if (currentSentencesRaw.length === 0 || candidates.length === 0) return this.check('template_repetition', 'not_applicable', 'Not enough content or comparison candidates to assess template repetition.');

    const opening = this.normalizeForComparison(currentSentencesRaw[0]);
    const closing = this.normalizeForComparison(currentSentencesRaw[currentSentencesRaw.length - 1]);
    if (opening.length < MIN_TEMPLATE_LINE_CHARS && closing.length < MIN_TEMPLATE_LINE_CHARS) {
      return this.check('template_repetition', 'not_applicable', 'Opening/closing lines are too short to assess template repetition.');
    }

    let openingMatches = 0;
    let closingMatches = 0;
    for (const c of candidates) {
      if (opening.length >= MIN_TEMPLATE_LINE_CHARS && c.comparable.sentences.includes(opening)) openingMatches++;
      if (closing.length >= MIN_TEMPLATE_LINE_CHARS && c.comparable.sentences.includes(closing)) closingMatches++;
    }

    if (openingMatches >= 2 || closingMatches >= 2) {
      return this.check('template_repetition', 'warning', 'Opening/closing line repeats verbatim across multiple other generated pieces, suggesting a fixed template rather than original wording.');
    }
    return this.check('template_repetition', 'passed', 'No repeated boilerplate opening/closing detected across other generated content.');
  }

  // ---------------------------------------------------------------------
  // Comparison primitives — pure, deterministic, no NLP/embeddings.
  // ---------------------------------------------------------------------

  private buildComparable(text: string): ComparableText {
    const normalized = this.normalizeForComparison(text);
    const tokens = new Set(normalized.split(' ').filter((w) => w.length > 2 && !GENERIC_NOISE_WORDS.has(w)));
    const sentences = splitSentences(text)
      .map((s) => this.normalizeForComparison(s))
      .filter((s) => s.length > 10);
    return { tokens, sentences };
  }

  private normalizeForComparison(text: string): string {
    return text
      .toLowerCase()
      .replace(/[#*_`>]/g, ' ')
      .replace(/^\s*[-\d]+[.)]\s+/gm, ' ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private isGenericPhrase(phrase: string): boolean {
    const words = phrase.split(' ').filter(Boolean);
    if (words.length === 0) return true;
    const noiseCount = words.filter((w) => GENERIC_NOISE_WORDS.has(w)).length;
    return noiseCount / words.length > 0.5;
  }

  private jaccard(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 || b.size === 0) return 0;
    let intersection = 0;
    for (const t of a) if (b.has(t)) intersection++;
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  private sentenceOverlap(a: string[], b: string[]): number {
    if (a.length === 0 || b.length === 0) return 0;
    const setB = new Set(b);
    const matched = a.filter((s) => setB.has(s)).length;
    return matched / Math.min(a.length, b.length);
  }

  private similarityScore(a: ComparableText, b: ComparableText): number {
    return Math.max(this.jaccard(a.tokens, b.tokens), this.sentenceOverlap(a.sentences, b.sentences));
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private check(
    type: OriginalityCheckType,
    classification: OriginalityCheckClassification,
    reason: string,
    evidence?: string[],
    matchedVersionId?: string,
    matchedArtifactId?: string,
  ): OriginalityCheck {
    return { id: randomUUID(), type, classification, reason, evidence: evidence ?? [], matchedVersionId, matchedArtifactId };
  }

  // ---------------------------------------------------------------------
  // Scoring / config
  // ---------------------------------------------------------------------

  private resolveStatus(score: number): ContentOriginalityStatus {
    if (score >= this.getGoodMin()) return 'original';
    if (score >= this.getReviewMin()) return 'needs_review';
    return 'highly_repetitive';
  }

  private getThresholds(isExpectedSimilarity: boolean): { warningThreshold: number; failThreshold: number } {
    const baseWarning = this.getEnvNumber('CONTENT_ORIGINALITY_WARNING_SIMILARITY', DEFAULT_WARNING_SIMILARITY);
    const baseFail = this.getEnvNumber('CONTENT_ORIGINALITY_FAIL_SIMILARITY', DEFAULT_FAIL_SIMILARITY);
    if (!isExpectedSimilarity) return { warningThreshold: baseWarning, failThreshold: baseFail };
    return {
      warningThreshold: Math.min(0.95, baseWarning + EXPECTED_SIMILARITY_WARNING_BOOST),
      failThreshold: Math.min(0.97, baseFail + EXPECTED_SIMILARITY_FAIL_BOOST),
    };
  }

  private getMinSentenceWords(): number {
    return this.getEnvNumber('CONTENT_ORIGINALITY_MIN_SENTENCE_WORDS', DEFAULT_MIN_SENTENCE_WORDS);
  }

  private getNgramSize(): number {
    return this.getEnvNumber('CONTENT_ORIGINALITY_NGRAM_SIZE', DEFAULT_NGRAM_SIZE);
  }

  private getMaxComparisons(): number {
    return this.getEnvNumber('CONTENT_ORIGINALITY_MAX_COMPARISONS', DEFAULT_MAX_COMPARISONS);
  }

  private getGoodMin(): number {
    return this.getEnvNumber('CONTENT_ORIGINALITY_GOOD_MIN', DEFAULT_GOOD_MIN);
  }

  private getReviewMin(): number {
    return this.getEnvNumber('CONTENT_ORIGINALITY_REVIEW_MIN', DEFAULT_REVIEW_MIN);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  // ---------------------------------------------------------------------
  // Mapping
  // ---------------------------------------------------------------------

  private toResponse(doc: ContentOriginalityResultDocument): ContentOriginalityResultResponse {
    return {
      contentVersionId: doc.contentVersionId.toString(),
      artifactId: doc.artifactId.toString(),
      organizationId: doc.organizationId.toString(),
      productId: doc.productId.toString(),
      campaignId: doc.campaignId.toString(),
      status: doc.status,
      score: doc.score,
      checks: doc.checks.map((c) => ({
        id: c.id,
        type: c.type,
        classification: c.classification,
        score: c.score,
        reason: c.reason,
        matchedVersionId: c.matchedVersionId?.toString(),
        matchedArtifactId: c.matchedArtifactId?.toString(),
        evidence: c.evidence,
      })),
      passedCount: doc.passedCount,
      warningCount: doc.warningCount,
      failedCount: doc.failedCount,
      duplicateSentenceCount: doc.duplicateSentenceCount,
      duplicateParagraphCount: doc.duplicateParagraphCount,
      crossContentMatchCount: doc.crossContentMatchCount,
      warnings: doc.warnings,
      reviewedAt: doc.reviewedAt,
    };
  }
}
