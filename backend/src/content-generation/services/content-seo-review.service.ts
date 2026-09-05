import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model, Types } from 'mongoose';
import { ContentSeoReviewResult, ContentSeoReviewResultDocument } from '../schemas/content-seo-review-result.schema';
import { findRepeatedNormalizedSentences, matchEvidence, normalizeText, splitSentences } from '../shared/content-claim-parsing.util';
import type { ContentGenerationKind } from '../types/content-generation.types';
import type { ContentVersionGroundingEvidenceSnapshot } from '../types/content-grounding.types';
import type {
  ContentSeoReviewResultResponse,
  ContentSeoReviewStatus,
  ContentSeoReviewSummary,
  ReviewContentVersionInput,
  SeoReviewCheck,
  SeoReviewCheckClassification,
  SeoReviewCheckType,
} from '../types/content-seo-review.types';
import type { ContentVersionGenerationOptions, ContentVersionPayload } from '../types/content-versioning.types';

const DEFAULT_OPTIMIZED_MIN = 85;
const DEFAULT_IMPROVEMENT_MIN = 60;

// Only these kinds get the full long-form structural treatment (headings,
// introduction, content depth, metadata readiness). Everything else still
// gets keyword/topic/funnel/CTA/repetition checks, with the blog-specific
// ones reported as not_applicable rather than penalized.
const BLOG_LIKE_KINDS = new Set<ContentGenerationKind>(['blog', 'newsletter']);

const CLASSIFICATION_SCORE: Record<Exclude<SeoReviewCheckClassification, 'not_applicable'>, number> = {
  passed: 100,
  warning: 50,
  failed: 0,
};

// Sums to 100 across the checks that actually move the score. `title`,
// `duplicate_heading`, and `metadata_readiness` are informational-only
// (weight 0) — they still appear in `checks` but never affect `score`.
const CHECK_WEIGHTS: Partial<Record<SeoReviewCheckType, number>> = {
  topic_alignment: 20,
  keyword_usage: 15,
  keyword_stuffing: 10,
  heading_structure: 15,
  content_depth: 15,
  introduction: 10,
  funnel_alignment: 5,
  cta_alignment: 5,
  excessive_repetition: 5,
};

const HARD_SELL_PATTERN = /\b(buy now|limited time|act now|don'?t miss out|100% off|discount code|sale ends|order today)\b/i;

@Injectable()
export class ContentSeoReviewService {
  private readonly logger = new Logger(ContentSeoReviewService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(ContentSeoReviewResult.name) private readonly seoReviewModel: Model<ContentSeoReviewResultDocument>,
  ) {}

  /**
   * Deterministic, non-AI SEO review of an already-generated version against
   * its own persisted evidence snapshot. Persists (upserts) one current
   * result per contentVersionId.
   */
  async reviewContentVersion(input: ReviewContentVersionInput): Promise<ContentSeoReviewResultResponse> {
    const checks = this.reviewText({ kind: input.kind, payload: input.payload, text: input.text, evidence: input.evidence, generationOptions: input.generationOptions });

    const passedCount = checks.filter((c) => c.classification === 'passed').length;
    const warningCount = checks.filter((c) => c.classification === 'warning').length;
    const failedCount = checks.filter((c) => c.classification === 'failed').length;

    const applicable = checks.filter((c) => c.classification !== 'not_applicable' && (CHECK_WEIGHTS[c.type] ?? 0) > 0);
    const totalWeight = applicable.reduce((sum, c) => sum + (CHECK_WEIGHTS[c.type] ?? 0), 0);

    const warnings: string[] = [];
    let score: number;
    if (totalWeight === 0) {
      score = 100;
      warnings.push('No checkable SEO signals were detected.');
    } else {
      const weightedSum = applicable.reduce((sum, c) => sum + (CHECK_WEIGHTS[c.type] ?? 0) * CLASSIFICATION_SCORE[c.classification as Exclude<SeoReviewCheckClassification, 'not_applicable'>], 0);
      score = Math.round(weightedSum / totalWeight);
    }

    const severeStuffing = checks.find((c) => c.type === 'keyword_stuffing')?.classification === 'failed';
    const severeTopicMismatch = checks.find((c) => c.type === 'topic_alignment')?.classification === 'failed';
    if (severeStuffing || severeTopicMismatch) {
      score = Math.min(score, this.getOptimizedMin() - 1);
    }

    let status = this.resolveStatus(score);
    if ((severeStuffing || severeTopicMismatch) && status === 'optimized') status = 'needs_improvement';

    const reviewedAt = new Date();
    const doc = await this.seoReviewModel.findOneAndUpdate(
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
        warnings,
        reviewedAt,
      },
      { upsert: true, new: true },
    );

    this.logger.log(
      `contentVersionId=${input.contentVersionId} kind=seo_review score=${score} status=${status} passed=${passedCount} warning=${warningCount} failed=${failedCount} success=true`,
    );

    return this.toResponse(doc);
  }

  async getResult(contentVersionId: string): Promise<ContentSeoReviewResultResponse | null> {
    const doc = await this.seoReviewModel.findOne({ contentVersionId: new Types.ObjectId(contentVersionId) });
    return doc ? this.toResponse(doc) : null;
  }

  async getSummary(contentVersionId: string): Promise<ContentSeoReviewSummary | undefined> {
    const doc = await this.seoReviewModel.findOne({ contentVersionId: new Types.ObjectId(contentVersionId) }).select('status score warningCount failedCount');
    if (!doc) return undefined;
    return { status: doc.status, score: doc.score, warningCount: doc.warningCount, failedCount: doc.failedCount };
  }

  async getSummariesByVersionIds(contentVersionIds: string[]): Promise<Map<string, ContentSeoReviewSummary>> {
    if (contentVersionIds.length === 0) return new Map();
    const docs = await this.seoReviewModel
      .find({ contentVersionId: { $in: contentVersionIds.map((id) => new Types.ObjectId(id)) } })
      .select('contentVersionId status score warningCount failedCount');
    return new Map(docs.map((d) => [d.contentVersionId.toString(), { status: d.status, score: d.score, warningCount: d.warningCount, failedCount: d.failedCount }]));
  }

  // ---------------------------------------------------------------------
  // Pure review logic — no I/O, unit-testable.
  // ---------------------------------------------------------------------

  reviewText(input: {
    kind: ContentGenerationKind;
    payload: ContentVersionPayload;
    text: string;
    evidence?: ContentVersionGroundingEvidenceSnapshot;
    generationOptions?: ContentVersionGenerationOptions;
  }): SeoReviewCheck[] {
    const { kind, payload, text, evidence, generationOptions } = input;
    const headings = this.extractHeadings(payload.content);
    const wordCount = payload.wordCount ?? this.countWords(text);
    const titleAndContent = [payload.title, payload.subjectLine, text].filter((v): v is string => !!v).join('\n');
    const topicTerms = this.buildTopicEvidence(evidence);

    return [
      this.checkTitle(kind, payload, topicTerms),
      this.checkKeywordUsage(text, evidence),
      this.checkKeywordStuffing(text, evidence),
      this.checkHeadingStructure(kind, headings, wordCount),
      this.checkDuplicateHeadings(kind, headings),
      this.checkIntroduction(kind, payload.content, topicTerms),
      this.checkContentDepth(kind, wordCount),
      this.checkTopicAlignment(titleAndContent, topicTerms),
      this.checkFunnelAlignment(evidence?.funnelStage, text),
      this.checkCtaAlignment(evidence, generationOptions, text),
      this.checkExcessiveRepetition(text),
      this.checkMetadataReadiness(kind, payload, evidence),
    ];
  }

  private checkTitle(kind: ContentGenerationKind, payload: ContentVersionPayload, topicTerms: string[]): SeoReviewCheck {
    if (!BLOG_LIKE_KINDS.has(kind)) return this.check('title', 'not_applicable', 'Title check applies to long-form content only.');
    const title = kind === 'newsletter' ? payload.subjectLine : payload.title;
    if (!title || title.trim().length < 8) {
      return this.check('title', 'failed', 'Title is missing or too short to be descriptive.');
    }
    if (topicTerms.length > 0 && matchEvidence(title, topicTerms).strength === 'none') {
      return this.check('title', 'warning', 'Title does not clearly reference the known topic/keywords.', [title]);
    }
    return this.check('title', 'passed', 'Title is descriptive and aligned to the topic.', [title]);
  }

  private checkKeywordUsage(text: string, evidence: ContentVersionGroundingEvidenceSnapshot | undefined): SeoReviewCheck {
    const keywords = evidence?.keywords ?? [];
    if (keywords.length === 0) return this.check('keyword_usage', 'not_applicable', 'No keyword evidence available to check against.');
    const normalizedText = normalizeText(text);
    const used = keywords.filter((k) => normalizedText.includes(normalizeText(k)));
    if (used.length === 0) return this.check('keyword_usage', 'warning', 'None of the known keywords appear in the content.', keywords);
    return this.check('keyword_usage', 'passed', `Uses ${used.length} of ${keywords.length} known keyword(s) naturally.`, used);
  }

  private checkKeywordStuffing(text: string, evidence: ContentVersionGroundingEvidenceSnapshot | undefined): SeoReviewCheck {
    const keywords = evidence?.keywords ?? [];
    if (keywords.length === 0) return this.check('keyword_stuffing', 'not_applicable', 'No keyword evidence available to check against.');
    const normalizedText = normalizeText(text);
    const totalWords = Math.max(normalizedText.split(/\s+/).filter(Boolean).length, 1);
    const stuffed: string[] = [];
    for (const keyword of keywords) {
      const normalizedKeyword = normalizeText(keyword);
      if (!normalizedKeyword) continue;
      const occurrences = this.countOccurrences(normalizedText, normalizedKeyword);
      const density = occurrences / totalWords;
      if (occurrences >= 5 && density > 0.03) stuffed.push(keyword);
    }
    if (stuffed.length > 0) return this.check('keyword_stuffing', 'failed', `Keyword density is unnaturally high for: ${stuffed.join(', ')}.`, stuffed);
    return this.check('keyword_stuffing', 'passed', 'Keyword usage density looks natural.');
  }

  private checkHeadingStructure(kind: ContentGenerationKind, headings: string[], wordCount: number): SeoReviewCheck {
    if (!BLOG_LIKE_KINDS.has(kind)) return this.check('heading_structure', 'not_applicable', 'Heading structure applies to long-form content only.');
    if (wordCount < 300) return this.check('heading_structure', 'not_applicable', 'Content is short enough that heading structure is not required.');
    if (headings.length === 0) return this.check('heading_structure', 'failed', 'No headings found in long-form content.');
    const duplicates = this.findDuplicates(headings);
    if (duplicates.length > 0) return this.check('heading_structure', 'warning', 'Duplicate headings reduce structural clarity.', duplicates);
    if (headings.length > 15) return this.check('heading_structure', 'warning', 'Excessive number of headings for the content length.');
    return this.check('heading_structure', 'passed', `Found ${headings.length} well-structured heading(s).`, headings.slice(0, 5));
  }

  private checkDuplicateHeadings(kind: ContentGenerationKind, headings: string[]): SeoReviewCheck {
    if (!BLOG_LIKE_KINDS.has(kind) || headings.length === 0) return this.check('duplicate_heading', 'not_applicable', 'No headings to check.');
    const duplicates = this.findDuplicates(headings);
    if (duplicates.length > 0) return this.check('duplicate_heading', 'failed', `Duplicate headings found: ${duplicates.join(', ')}.`, duplicates);
    return this.check('duplicate_heading', 'passed', 'No duplicate headings found.');
  }

  private checkIntroduction(kind: ContentGenerationKind, content: string | undefined, topicTerms: string[]): SeoReviewCheck {
    if (!BLOG_LIKE_KINDS.has(kind)) return this.check('introduction', 'not_applicable', 'Introduction check applies to long-form content only.');
    if (!content) return this.check('introduction', 'failed', 'No content to evaluate.');
    const firstSection = content.split(/\n{2,}/)[0] ?? '';
    const introWordCount = firstSection.split(/\s+/).filter(Boolean).length;
    if (introWordCount < 20) return this.check('introduction', 'warning', 'Opening section is too short to introduce the topic.');
    if (topicTerms.length > 0 && matchEvidence(firstSection, topicTerms).strength === 'none') {
      return this.check('introduction', 'warning', 'Opening section does not clearly reference the topic.');
    }
    return this.check('introduction', 'passed', 'Opening section reasonably introduces the topic.');
  }

  private checkContentDepth(kind: ContentGenerationKind, wordCount: number): SeoReviewCheck {
    if (!BLOG_LIKE_KINDS.has(kind)) return this.check('content_depth', 'not_applicable', 'Content depth check applies to long-form content only.');
    if (wordCount < 250) return this.check('content_depth', 'failed', `Content is very short (${wordCount} words) for long-form SEO content.`);
    if (wordCount < 500) return this.check('content_depth', 'warning', `Content is on the shorter side (${wordCount} words) for thorough topic coverage.`);
    return this.check('content_depth', 'passed', `Content length (${wordCount} words) supports reasonable topic coverage.`);
  }

  private checkTopicAlignment(titleAndContent: string, topicTerms: string[]): SeoReviewCheck {
    if (topicTerms.length === 0) return this.check('topic_alignment', 'not_applicable', 'No topic/keyword evidence available to check against.');
    const match = matchEvidence(titleAndContent, topicTerms);
    if (match.strength === 'strong') return this.check('topic_alignment', 'passed', 'Content aligns clearly with the known topic/keywords.', match.refs);
    if (match.strength === 'partial') return this.check('topic_alignment', 'warning', 'Content only partially overlaps with the known topic/keywords.', match.refs);
    return this.check('topic_alignment', 'failed', 'Content does not clearly align with the known topic/keywords.');
  }

  private checkFunnelAlignment(funnelStage: string | undefined, text: string): SeoReviewCheck {
    if (!funnelStage) return this.check('funnel_alignment', 'not_applicable', 'No funnel stage evidence available.');
    if (funnelStage.toLowerCase().includes('awareness') && HARD_SELL_PATTERN.test(text)) {
      return this.check('funnel_alignment', 'warning', 'Awareness-stage content contains aggressive hard-sell language.');
    }
    return this.check('funnel_alignment', 'passed', `Content tone is broadly consistent with the ${funnelStage} funnel stage.`);
  }

  private checkCtaAlignment(
    evidence: ContentVersionGroundingEvidenceSnapshot | undefined,
    generationOptions: ContentVersionGenerationOptions | undefined,
    text: string,
  ): SeoReviewCheck {
    if (generationOptions?.includeCTA === false) return this.check('cta_alignment', 'not_applicable', 'CTA was intentionally disabled for this generation.');
    const suggestedCTA = evidence?.suggestedCTA;
    if (!suggestedCTA) return this.check('cta_alignment', 'not_applicable', 'No supported CTA evidence available.');
    if (generationOptions?.includeCTA !== true) return this.check('cta_alignment', 'not_applicable', 'CTA was not explicitly requested for this generation.');
    const present = matchEvidence(text, [suggestedCTA]).strength !== 'none';
    if (!present) return this.check('cta_alignment', 'warning', 'CTA was requested but the supported CTA direction is not clearly present.', [suggestedCTA]);
    return this.check('cta_alignment', 'passed', 'Supported CTA direction is present as requested.', [suggestedCTA]);
  }

  private checkExcessiveRepetition(text: string): SeoReviewCheck {
    const sentences = splitSentences(text)
      .map((s) => normalizeText(s))
      .filter((s) => s.length > 15);
    if (sentences.length < 2) return this.check('excessive_repetition', 'passed', 'Not enough content to assess repetition.');
    const repeated = findRepeatedNormalizedSentences(text);
    if (repeated.length > 0) return this.check('excessive_repetition', 'failed', `Found ${repeated.length} repeated sentence(s)/paragraph(s).`, repeated.slice(0, 3));
    return this.check('excessive_repetition', 'passed', 'No significant repeated sentences or paragraphs detected.');
  }

  private checkMetadataReadiness(kind: ContentGenerationKind, payload: ContentVersionPayload, evidence: ContentVersionGroundingEvidenceSnapshot | undefined): SeoReviewCheck {
    if (kind !== 'blog') return this.check('metadata_readiness', 'not_applicable', 'Metadata readiness applies to blog content only.');
    const missing = [
      !payload.title && 'title',
      !(evidence?.topic || evidence?.pillar) && 'topic/pillar',
      !(evidence?.keywords && evidence.keywords.length > 0) && 'keyword evidence',
      !(payload.content && payload.content.trim().length > 0) && 'content',
    ].filter((v): v is string => !!v);
    if (missing.length > 0) return this.check('metadata_readiness', 'warning', `Missing inputs for later SEO metadata generation: ${missing.join(', ')}.`);
    return this.check('metadata_readiness', 'passed', 'Sufficient inputs available for later SEO metadata generation.');
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private check(type: SeoReviewCheckType, classification: SeoReviewCheckClassification, reason: string, evidence?: string[]): SeoReviewCheck {
    return { id: randomUUID(), type, classification, reason, evidence: evidence ?? [] };
  }

  private buildTopicEvidence(evidence: ContentVersionGroundingEvidenceSnapshot | undefined): string[] {
    if (!evidence) return [];
    return [evidence.topic, evidence.pillar, ...(evidence.keywords ?? [])].filter((v): v is string => !!v);
  }

  private extractHeadings(content: string | undefined): string[] {
    if (!content) return [];
    return [...content.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => m[1].trim()).filter(Boolean);
  }

  private findDuplicates(items: string[]): string[] {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const item of items) {
      const key = normalizeText(item);
      if (seen.has(key)) dupes.add(item);
      seen.add(key);
    }
    return [...dupes];
  }

  private countOccurrences(haystack: string, needle: string): number {
    if (!needle) return 0;
    return haystack.split(needle).length - 1;
  }

  private countWords(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
  }

  // ---------------------------------------------------------------------
  // Scoring
  // ---------------------------------------------------------------------

  private resolveStatus(score: number): ContentSeoReviewStatus {
    if (score >= this.getOptimizedMin()) return 'optimized';
    if (score >= this.getImprovementMin()) return 'needs_improvement';
    return 'poor';
  }

  private getOptimizedMin(): number {
    return this.getEnvNumber('CONTENT_SEO_OPTIMIZED_MIN', DEFAULT_OPTIMIZED_MIN);
  }

  private getImprovementMin(): number {
    return this.getEnvNumber('CONTENT_SEO_IMPROVEMENT_MIN', DEFAULT_IMPROVEMENT_MIN);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  // ---------------------------------------------------------------------
  // Mapping
  // ---------------------------------------------------------------------

  private toResponse(doc: ContentSeoReviewResultDocument): ContentSeoReviewResultResponse {
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
      warnings: doc.warnings,
      reviewedAt: doc.reviewedAt,
    };
  }
}
