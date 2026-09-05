import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model, Types } from 'mongoose';
import { ContentReadabilityResult, ContentReadabilityResultDocument } from '../schemas/content-readability-result.schema';
import { findRepeatedNormalizedSentences, normalizeText, splitSentences } from '../shared/content-claim-parsing.util';
import type { ContentGenerationKind } from '../types/content-generation.types';
import type {
  ContentReadabilityMetrics,
  ContentReadabilityResultResponse,
  ContentReadabilityStatus,
  ContentReadabilitySummary,
  ReadabilityCheck,
  ReadabilityCheckClassification,
  ReadabilityCheckType,
  ReviewReadabilityInput,
} from '../types/content-readability.types';
import type { ContentVersionPayload } from '../types/content-versioning.types';

const DEFAULT_LONG_SENTENCE_WORDS = 25;
const DEFAULT_VERY_LONG_SENTENCE_WORDS = 40;
const DEFAULT_LONG_PARAGRAPH_WORDS = 120;
const DEFAULT_GOOD_MIN = 85;
const DEFAULT_IMPROVEMENT_MIN = 60;

// Content-kind profiles: structural checks (headings/paragraphs/scannability)
// apply differently depending on how the content is naturally consumed.
const LONG_FORM_KINDS = new Set<ContentGenerationKind>(['blog', 'newsletter']);
const SHORT_SOCIAL_KINDS = new Set<ContentGenerationKind>(['x']);
const SCRIPT_KINDS = new Set<ContentGenerationKind>(['video_script']);

const CLASSIFICATION_SCORE: Record<Exclude<ReadabilityCheckClassification, 'not_applicable'>, number> = {
  passed: 100,
  warning: 50,
  failed: 0,
};

// Sums to 100 across the checks that actually move the score:
// sentence readability (sentence_length 20 + sentence_variety 5 = 25),
// paragraph structure (paragraph_length 10 + paragraph_structure 10 = 20),
// scannability (20), complexity (15), repetition (10), opening/closing
// clarity (opening_clarity 5 + closing_clarity 5 = 10). heading_support,
// list_usage, and passive_voice are informational-only (weight 0).
const CHECK_WEIGHTS: Partial<Record<ReadabilityCheckType, number>> = {
  sentence_length: 20,
  sentence_variety: 5,
  paragraph_length: 10,
  paragraph_structure: 10,
  scannability: 20,
  complexity: 15,
  repetition: 10,
  opening_clarity: 5,
  closing_clarity: 5,
};

const PASSIVE_VOICE_PATTERN = /\b(is|are|was|were|been|be|being)\s+\w+ed\b/i;

@Injectable()
export class ContentReadabilityService {
  private readonly logger = new Logger(ContentReadabilityService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(ContentReadabilityResult.name) private readonly readabilityModel: Model<ContentReadabilityResultDocument>,
  ) {}

  /**
   * Deterministic, non-AI readability review of an already-generated
   * version. Persists (upserts) one current result per contentVersionId.
   */
  async reviewContentVersion(input: ReviewReadabilityInput): Promise<ContentReadabilityResultResponse> {
    const { checks, metrics } = this.reviewText({ kind: input.kind, payload: input.payload, text: input.text });

    const passedCount = checks.filter((c) => c.classification === 'passed').length;
    const warningCount = checks.filter((c) => c.classification === 'warning').length;
    const failedCount = checks.filter((c) => c.classification === 'failed').length;

    const applicable = checks.filter((c) => c.classification !== 'not_applicable' && (CHECK_WEIGHTS[c.type] ?? 0) > 0);
    const totalWeight = applicable.reduce((sum, c) => sum + (CHECK_WEIGHTS[c.type] ?? 0), 0);

    const warnings: string[] = [];
    let score: number;
    if (totalWeight === 0) {
      score = 100;
      warnings.push('No checkable readability signals were detected.');
    } else {
      const weightedSum = applicable.reduce(
        (sum, c) => sum + (CHECK_WEIGHTS[c.type] ?? 0) * CLASSIFICATION_SCORE[c.classification as Exclude<ReadabilityCheckClassification, 'not_applicable'>],
        0,
      );
      score = Math.round(weightedSum / totalWeight);
    }

    const severeSentenceDensity = metrics.sentenceCount > 0 && metrics.veryLongSentenceCount / metrics.sentenceCount > 0.5;
    const severeUnbrokenBlock = LONG_FORM_KINDS.has(input.kind) && metrics.wordCount > 300 && metrics.paragraphCount <= 1;
    if (severeSentenceDensity || severeUnbrokenBlock) {
      score = Math.min(score, this.getGoodMin() - 1);
    }

    let status = this.resolveStatus(score);
    if ((severeSentenceDensity || severeUnbrokenBlock) && status === 'readable') status = 'needs_improvement';

    const reviewedAt = new Date();
    const doc = await this.readabilityModel.findOneAndUpdate(
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
        metrics,
        warnings,
        reviewedAt,
      },
      { upsert: true, new: true },
    );

    this.logger.log(
      `contentVersionId=${input.contentVersionId} kind=readability score=${score} status=${status} passed=${passedCount} warning=${warningCount} failed=${failedCount} success=true`,
    );

    return this.toResponse(doc);
  }

  async getResult(contentVersionId: string): Promise<ContentReadabilityResultResponse | null> {
    const doc = await this.readabilityModel.findOne({ contentVersionId: new Types.ObjectId(contentVersionId) });
    return doc ? this.toResponse(doc) : null;
  }

  async getSummary(contentVersionId: string): Promise<ContentReadabilitySummary | undefined> {
    const doc = await this.readabilityModel.findOne({ contentVersionId: new Types.ObjectId(contentVersionId) }).select('status score warningCount failedCount');
    if (!doc) return undefined;
    return { status: doc.status, score: doc.score, warningCount: doc.warningCount, failedCount: doc.failedCount };
  }

  async getSummariesByVersionIds(contentVersionIds: string[]): Promise<Map<string, ContentReadabilitySummary>> {
    if (contentVersionIds.length === 0) return new Map();
    const docs = await this.readabilityModel
      .find({ contentVersionId: { $in: contentVersionIds.map((id) => new Types.ObjectId(id)) } })
      .select('contentVersionId status score warningCount failedCount');
    return new Map(docs.map((d) => [d.contentVersionId.toString(), { status: d.status, score: d.score, warningCount: d.warningCount, failedCount: d.failedCount }]));
  }

  // ---------------------------------------------------------------------
  // Content extraction — readability reviews the reader-facing text only,
  // excluding metadata (subject lines, preheaders, hooks) that grounding/SEO
  // checks look at. This is intentionally separate from extractGroundableText.
  // ---------------------------------------------------------------------

  extractReadableText(kind: ContentGenerationKind, payload: ContentVersionPayload): string {
    if (kind === 'video_script') {
      return (payload.scenes ?? []).map((s) => s.narration).filter(Boolean).join('\n\n');
    }
    if (payload.posts && payload.posts.length > 0) {
      return payload.posts.join('\n\n');
    }
    return payload.content ?? '';
  }

  // ---------------------------------------------------------------------
  // Pure review logic — no I/O, unit-testable.
  // ---------------------------------------------------------------------

  reviewText(input: { kind: ContentGenerationKind; payload: ContentVersionPayload; text: string }): { checks: ReadabilityCheck[]; metrics: ContentReadabilityMetrics } {
    const { kind, payload, text } = input;
    const sentences = splitSentences(text);
    const metrics = this.computeMetrics(text, sentences);

    const headingCheck = this.checkHeadingSupport(kind, payload, metrics.wordCount);
    const listCheck = this.checkListUsage(kind, payload.content, text);

    const checks: ReadabilityCheck[] = [
      this.checkSentenceLength(metrics),
      this.checkParagraphLength(kind, metrics),
      this.checkSentenceVariety(sentences),
      this.checkParagraphStructure(kind, metrics),
      headingCheck,
      listCheck,
      this.checkRepetition(text, sentences),
      this.checkComplexity(text, metrics),
      this.checkPassiveVoice(metrics),
      this.checkScannability(kind, metrics, headingCheck, listCheck),
      this.checkOpeningClarity(kind, sentences, metrics),
      this.checkClosingClarity(kind, sentences, metrics),
    ];

    return { checks, metrics };
  }

  private computeMetrics(text: string, sentences: string[]): ContentReadabilityMetrics {
    const paragraphs = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    const wordCount = this.countWords(text);

    const longSentenceWords = this.getLongSentenceWords();
    const veryLongSentenceWords = this.getVeryLongSentenceWords();
    const longParagraphWords = this.getLongParagraphWords();

    const sentenceWordCounts = sentences.map((s) => this.countWords(s));
    const averageSentenceWords = sentences.length > 0 ? this.round1(sentenceWordCounts.reduce((a, b) => a + b, 0) / sentences.length) : 0;
    const longSentenceCount = sentenceWordCounts.filter((c) => c >= longSentenceWords && c < veryLongSentenceWords).length;
    const veryLongSentenceCount = sentenceWordCounts.filter((c) => c >= veryLongSentenceWords).length;

    const paragraphWordCounts = paragraphs.map((p) => this.countWords(p));
    const averageParagraphWords = paragraphs.length > 0 ? this.round1(paragraphWordCounts.reduce((a, b) => a + b, 0) / paragraphs.length) : 0;
    const longParagraphCount = paragraphWordCounts.filter((c) => c >= longParagraphWords).length;

    const passiveVoiceApproxCount = sentences.filter((s) => PASSIVE_VOICE_PATTERN.test(s)).length;

    return {
      wordCount,
      sentenceCount: sentences.length,
      paragraphCount: paragraphs.length,
      averageSentenceWords,
      averageParagraphWords,
      longSentenceCount,
      veryLongSentenceCount,
      longParagraphCount,
      passiveVoiceApproxCount,
    };
  }

  private checkSentenceLength(metrics: ContentReadabilityMetrics): ReadabilityCheck {
    if (metrics.sentenceCount === 0) return this.check('sentence_length', 'not_applicable', 'No sentences to evaluate.');
    const longCount = metrics.longSentenceCount + metrics.veryLongSentenceCount;
    const longRatio = longCount / metrics.sentenceCount;
    const veryLongRatio = metrics.veryLongSentenceCount / metrics.sentenceCount;
    if (veryLongRatio > 0.3 || longRatio > 0.5) {
      return this.check('sentence_length', 'failed', `${longCount} of ${metrics.sentenceCount} sentence(s) are long or very long.`);
    }
    if (longRatio > 0.2 || metrics.veryLongSentenceCount > 0) {
      return this.check('sentence_length', 'warning', 'A few sentences are longer than ideal for easy reading.');
    }
    return this.check('sentence_length', 'passed', 'Sentence lengths are generally easy to read.');
  }

  private checkParagraphLength(kind: ContentGenerationKind, metrics: ContentReadabilityMetrics): ReadabilityCheck {
    if (metrics.paragraphCount === 0) return this.check('paragraph_length', 'not_applicable', 'No paragraphs to evaluate.');
    if (!LONG_FORM_KINDS.has(kind)) {
      if (metrics.longParagraphCount > 0 && metrics.wordCount > 60) {
        return this.check('paragraph_length', 'warning', 'Content reads as a dense block for a short-form post.');
      }
      return this.check('paragraph_length', 'not_applicable', 'Paragraph-length expectations are relaxed for this content type.');
    }
    if (metrics.longParagraphCount >= 2) {
      return this.check('paragraph_length', 'failed', `${metrics.longParagraphCount} paragraph(s) are too long for comfortable reading.`);
    }
    if (metrics.longParagraphCount === 1) {
      return this.check('paragraph_length', 'warning', 'One paragraph is longer than ideal.');
    }
    return this.check('paragraph_length', 'passed', 'Paragraph lengths support comfortable reading.');
  }

  private checkSentenceVariety(sentences: string[]): ReadabilityCheck {
    if (sentences.length < 4) return this.check('sentence_variety', 'not_applicable', 'Not enough sentences to assess variety.');
    const lengths = sentences.map((s) => this.countWords(s));
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((sum, l) => sum + (l - avg) ** 2, 0) / lengths.length;
    const stdDev = Math.sqrt(variance);

    const openings = sentences.map((s) => normalizeText(s).split(' ').slice(0, 2).join(' '));
    const openingCounts = new Map<string, number>();
    for (const o of openings) openingCounts.set(o, (openingCounts.get(o) ?? 0) + 1);
    const maxOpeningRepeat = Math.max(...openingCounts.values());
    const repeatedOpeningRatio = maxOpeningRepeat / sentences.length;

    if (stdDev < 2 && sentences.length >= 6) {
      return this.check('sentence_variety', 'warning', 'Sentences are very uniform in length, which can feel monotonous.');
    }
    if (repeatedOpeningRatio > 0.4) {
      return this.check('sentence_variety', 'warning', 'Many sentences start the same way, reducing variety.');
    }
    return this.check('sentence_variety', 'passed', 'Sentence structure has reasonable variety.');
  }

  private checkParagraphStructure(kind: ContentGenerationKind, metrics: ContentReadabilityMetrics): ReadabilityCheck {
    if (SHORT_SOCIAL_KINDS.has(kind)) return this.check('paragraph_structure', 'not_applicable', 'Paragraph structure is not meaningful for short-form posts.');
    if (!LONG_FORM_KINDS.has(kind)) {
      if (metrics.wordCount > 80 && metrics.paragraphCount <= 1) {
        return this.check('paragraph_structure', 'warning', 'Longer social content would benefit from a paragraph break.');
      }
      return this.check('paragraph_structure', 'passed', 'Paragraph structure is reasonable for this content length.');
    }
    if (metrics.wordCount > 300 && metrics.paragraphCount < 3) {
      return this.check('paragraph_structure', 'failed', 'Long-form content has too few paragraph breaks.');
    }
    if (metrics.wordCount > 150 && metrics.paragraphCount < 2) {
      return this.check('paragraph_structure', 'warning', 'Content would benefit from additional paragraph breaks.');
    }
    return this.check('paragraph_structure', 'passed', 'Paragraph breaks support easy reading.');
  }

  private checkHeadingSupport(kind: ContentGenerationKind, payload: ContentVersionPayload, wordCount: number): ReadabilityCheck {
    if (SCRIPT_KINDS.has(kind)) {
      if (wordCount < 300) return this.check('heading_support', 'not_applicable', 'Script is short enough that scene breakdown is not required.');
      const sceneCount = payload.scenes?.length ?? 0;
      if (sceneCount <= 1) return this.check('heading_support', 'warning', 'Long script has little scene breakdown to help pacing/scanning.');
      return this.check('heading_support', 'passed', 'Script is broken into distinct scenes.');
    }
    if (!LONG_FORM_KINDS.has(kind)) return this.check('heading_support', 'not_applicable', 'Heading support is not relevant for short-form social content.');
    if (wordCount < 300) return this.check('heading_support', 'not_applicable', 'Content is short enough that headings are not needed for scanning.');
    const headingCount = payload.content ? [...payload.content.matchAll(/^#{1,6}\s+.+$/gm)].length : 0;
    if (headingCount === 0) return this.check('heading_support', 'warning', 'No headings/sections to help readers scan long content.');
    return this.check('heading_support', 'passed', 'Headings/sections help readers scan the content.');
  }

  private checkListUsage(kind: ContentGenerationKind, content: string | undefined, text: string): ReadabilityCheck {
    if (SHORT_SOCIAL_KINDS.has(kind)) return this.check('list_usage', 'not_applicable', 'List usage is not meaningful for short-form posts.');
    const hasMarkdownList = content ? /^(\s*[-*]\s+|\s*\d+\.\s+)/m.test(content) : false;
    if (hasMarkdownList) return this.check('list_usage', 'passed', 'Content already uses lists where useful.');
    const denseEnumeration = /(?:[^,.;]+,){4,}[^,.;]+[.?!]/.test(text);
    if (denseEnumeration) return this.check('list_usage', 'warning', 'A dense comma-separated enumeration may be easier to scan as a list.');
    return this.check('list_usage', 'not_applicable', 'No clear enumeration that would benefit from list formatting.');
  }

  private checkRepetition(text: string, sentences: string[]): ReadabilityCheck {
    if (sentences.length < 2) return this.check('repetition', 'passed', 'Not enough content to assess repetition.');
    const repeated = findRepeatedNormalizedSentences(text);
    if (repeated.length > 0) return this.check('repetition', 'failed', `Found ${repeated.length} repeated sentence(s), which hurts reading flow.`, repeated.slice(0, 3));
    return this.check('repetition', 'passed', 'No significant repeated sentences detected.');
  }

  private checkComplexity(text: string, metrics: ContentReadabilityMetrics): ReadabilityCheck {
    if (metrics.wordCount === 0) return this.check('complexity', 'not_applicable', 'No content to evaluate.');
    const words = text.split(/\s+/).filter(Boolean);
    const longWords = words.filter((w) => w.replace(/[^a-zA-Z]/g, '').length >= 12).length;
    const longWordRatio = longWords / words.length;
    const nestedPunctuation = (text.match(/[;:]|\([^)]*\(/g) ?? []).length;
    const nestedPunctuationDensity = nestedPunctuation / Math.max(1, metrics.sentenceCount);

    let issues = 0;
    if (longWordRatio > 0.12) issues++;
    if (metrics.averageSentenceWords > 28) issues++;
    if (nestedPunctuationDensity > 0.5) issues++;

    if (issues >= 2) return this.check('complexity', 'failed', 'Content combines long words, long sentences, and dense punctuation, making it hard to read.');
    if (issues === 1) return this.check('complexity', 'warning', 'Content shows some signs of dense/complex wording.');
    return this.check('complexity', 'passed', 'Wording complexity looks reasonable.');
  }

  private checkPassiveVoice(metrics: ContentReadabilityMetrics): ReadabilityCheck {
    if (metrics.sentenceCount === 0) return this.check('passive_voice', 'not_applicable', 'No sentences to evaluate.');
    const count = metrics.passiveVoiceApproxCount ?? 0;
    const ratio = count / metrics.sentenceCount;
    if (ratio > 0.4) return this.check('passive_voice', 'warning', 'Approximate passive-voice detection found frequent passive constructions (heuristic estimate).');
    return this.check('passive_voice', 'passed', 'Passive voice usage looks reasonable (heuristic estimate).');
  }

  private checkScannability(kind: ContentGenerationKind, metrics: ContentReadabilityMetrics, headingCheck: ReadabilityCheck, listCheck: ReadabilityCheck): ReadabilityCheck {
    if (!LONG_FORM_KINDS.has(kind) && !SCRIPT_KINDS.has(kind)) {
      if (metrics.wordCount > 60 && metrics.paragraphCount <= 1) {
        return this.check('scannability', 'warning', 'Content is a single dense block for its length.');
      }
      return this.check('scannability', 'passed', 'Content is easy enough to scan for its length.');
    }
    const structuralSignals = [headingCheck.classification === 'passed', metrics.paragraphCount >= 3, listCheck.classification !== 'failed'].filter(Boolean).length;
    if (metrics.wordCount > 400 && structuralSignals === 0) {
      return this.check('scannability', 'failed', 'Long content lacks headings, paragraph breaks, or lists to help scanning.');
    }
    if (metrics.wordCount > 250 && structuralSignals < 2) {
      return this.check('scannability', 'warning', 'Content could use more structural breaks (headings/paragraphs/lists) for easier scanning.');
    }
    return this.check('scannability', 'passed', 'Content is reasonably easy to scan.');
  }

  private checkOpeningClarity(kind: ContentGenerationKind, sentences: string[], metrics: ContentReadabilityMetrics): ReadabilityCheck {
    if (sentences.length === 0) return this.check('opening_clarity', 'failed', 'No opening content to evaluate.');
    const opening = sentences[0];
    const openingWords = this.countWords(opening);
    if (LONG_FORM_KINDS.has(kind) && metrics.wordCount > 150 && openingWords < 5) {
      return this.check('opening_clarity', 'warning', 'Opening is too brief to meaningfully introduce long-form content.');
    }
    if (openingWords > 45) {
      return this.check('opening_clarity', 'warning', 'Opening sentence is very long, which can be hard to follow.');
    }
    return this.check('opening_clarity', 'passed', 'Opening is reasonably clear.');
  }

  private checkClosingClarity(kind: ContentGenerationKind, sentences: string[], metrics: ContentReadabilityMetrics): ReadabilityCheck {
    if (sentences.length === 0) return this.check('closing_clarity', 'not_applicable', 'No closing content to evaluate.');
    if (!LONG_FORM_KINDS.has(kind)) return this.check('closing_clarity', 'not_applicable', 'Closing structure is not strictly required for short-form content.');
    if (metrics.wordCount < 150) return this.check('closing_clarity', 'not_applicable', 'Content is short enough that a distinct closing is not expected.');
    const closing = sentences[sentences.length - 1];
    const closingWords = this.countWords(closing);
    if (closingWords < 4) {
      return this.check('closing_clarity', 'warning', 'Closing section is very abrupt for long-form content.');
    }
    return this.check('closing_clarity', 'passed', 'Content has a reasonable closing.');
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private check(type: ReadabilityCheckType, classification: ReadabilityCheckClassification, reason: string, evidence?: string[]): ReadabilityCheck {
    return { id: randomUUID(), type, classification, reason, evidence: evidence ?? [] };
  }

  private countWords(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
  }

  private round1(value: number): number {
    return Math.round(value * 10) / 10;
  }

  // ---------------------------------------------------------------------
  // Scoring
  // ---------------------------------------------------------------------

  private resolveStatus(score: number): ContentReadabilityStatus {
    if (score >= this.getGoodMin()) return 'readable';
    if (score >= this.getImprovementMin()) return 'needs_improvement';
    return 'difficult';
  }

  private getGoodMin(): number {
    return this.getEnvNumber('CONTENT_READABILITY_GOOD_MIN', DEFAULT_GOOD_MIN);
  }

  private getImprovementMin(): number {
    return this.getEnvNumber('CONTENT_READABILITY_IMPROVEMENT_MIN', DEFAULT_IMPROVEMENT_MIN);
  }

  private getLongSentenceWords(): number {
    return this.getEnvNumber('READABILITY_LONG_SENTENCE_WORDS', DEFAULT_LONG_SENTENCE_WORDS);
  }

  private getVeryLongSentenceWords(): number {
    return this.getEnvNumber('READABILITY_VERY_LONG_SENTENCE_WORDS', DEFAULT_VERY_LONG_SENTENCE_WORDS);
  }

  private getLongParagraphWords(): number {
    return this.getEnvNumber('READABILITY_LONG_PARAGRAPH_WORDS', DEFAULT_LONG_PARAGRAPH_WORDS);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  // ---------------------------------------------------------------------
  // Mapping
  // ---------------------------------------------------------------------

  private toResponse(doc: ContentReadabilityResultDocument): ContentReadabilityResultResponse {
    return {
      contentVersionId: doc.contentVersionId.toString(),
      artifactId: doc.artifactId.toString(),
      organizationId: doc.organizationId.toString(),
      productId: doc.productId.toString(),
      campaignId: doc.campaignId.toString(),
      status: doc.status,
      score: doc.score,
      checks: doc.checks.map((c) => ({ id: c.id, type: c.type, classification: c.classification, score: c.score, reason: c.reason, evidence: c.evidence })),
      passedCount: doc.passedCount,
      warningCount: doc.warningCount,
      failedCount: doc.failedCount,
      metrics: {
        wordCount: doc.metrics.wordCount,
        sentenceCount: doc.metrics.sentenceCount,
        paragraphCount: doc.metrics.paragraphCount,
        averageSentenceWords: doc.metrics.averageSentenceWords,
        averageParagraphWords: doc.metrics.averageParagraphWords,
        longSentenceCount: doc.metrics.longSentenceCount,
        veryLongSentenceCount: doc.metrics.veryLongSentenceCount,
        longParagraphCount: doc.metrics.longParagraphCount,
        passiveVoiceApproxCount: doc.metrics.passiveVoiceApproxCount,
      },
      warnings: doc.warnings,
      reviewedAt: doc.reviewedAt,
    };
  }
}
