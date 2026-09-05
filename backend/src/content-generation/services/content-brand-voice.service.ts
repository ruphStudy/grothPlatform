import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model, Types } from 'mongoose';
import { ContentBrandVoiceResult, ContentBrandVoiceResultDocument } from '../schemas/content-brand-voice-result.schema';
import { splitSentences } from '../shared/content-claim-parsing.util';
import type {
  BrandVoiceCheck,
  BrandVoiceCheckClassification,
  BrandVoiceCheckType,
  ContentBrandVoiceResultResponse,
  ContentBrandVoiceStatus,
  ContentBrandVoiceSummary,
  ContentVersionBrandVoiceSnapshot,
  ReviewBrandVoiceInput,
} from '../types/content-brand-voice.types';
import type { ContentGenerationKind } from '../types/content-generation.types';
import type { ContentVersionGenerationOptions, ContentVersionPayload } from '../types/content-versioning.types';

const DEFAULT_ALIGNED_MIN = 85;
const DEFAULT_ADJUSTMENT_MIN = 60;

const NO_BRAND_PROFILE_WARNING = 'No explicit brand voice profile was available; review used generation tone and general style constraints.';

const CLASSIFICATION_SCORE: Record<Exclude<BrandVoiceCheckClassification, 'not_applicable'>, number> = {
  passed: 100,
  warning: 50,
  failed: 0,
};

// Sums to 100 across the checks that actually move the score: requested
// tone (requested_tone 20 + professionalism 5 + conversationality 5 = 30),
// avoid rules (20), hype/clickbait (15), platform fit (15), style
// alignment (10), consistency (10). clarity and unsupported_voice_claims
// are informational-only (weight 0) — they still appear in `checks` but
// never affect `score`.
const CHECK_WEIGHTS: Partial<Record<BrandVoiceCheckType, number>> = {
  requested_tone: 20,
  professionalism: 5,
  conversationality: 5,
  avoid_rules: 20,
  hype: 15,
  platform_fit: 15,
  style_alignment: 10,
  consistency: 10,
};

const EMOJI_PATTERN = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu;
const HASHTAG_PATTERN = /#[^\s#]+/gu;
const SLANG_PATTERN = /\b(gonna|wanna|gotta|kinda|sorta|ain'?t|y'?all|lemme|dunno|lol+|omg|btw|tbh)\b/gi;
const HYPE_PATTERN = /\b(revolutionary|game[- ]changing|game[- ]changer|unbelievable|the ultimate|ultimate|best ever|guaranteed|must[- ]have|world[- ]class|unmatched|instantly transform|mind[- ]blowing|life[- ]changing)\b/gi;
const GUARANTEE_PATTERN = /\b(guarantee[sd]?|100%\s*(guarantee|success)|guaranteed\s+(results?|outcome|success))\b/gi;
const CLICKBAIT_PATTERN = /\b(you\s+won'?t\s+believe|this\s+changes\s+everything|the\s+secret\s+(nobody|no one)\s+tells\s+you|the\s+secret\s+to)\b/gi;
const HARD_SELL_PATTERN = /\b(buy now|limited time|act now|don'?t miss out|100% off|discount code|sale ends|order today)\b/gi;
const JARGON_PATTERN = /\b(synergy|synergies|leverage|paradigm|cutting-edge|seamless ecosystem|next-generation|disruptive|transformative)\b/gi;
const AUTHORITY_CLAIM_PATTERN = /\b(as the industry leader|experts agree|everyone knows|proven to|trusted by thousands)\b/gi;
const FORMAL_BUREAUCRATIC_PATTERN = /\b(pursuant to|in accordance with|it is imperative that|hereinafter|aforementioned|heretofore)\b/gi;
const PROFANITY_PATTERN = /\b(damn|hell|crap|shit|fuck|bullshit)\b/gi;
const PASSIVE_VOICE_PATTERN = /\b(is|are|was|were|been|be|being)\s+\w+ed\b/i;

const KNOWN_STYLE_DIMENSIONS = new Set(['concise', 'clear', 'direct', 'structured', 'formal', 'casual']);

interface TextStats {
  wordCount: number;
  sentenceCount: number;
  averageSentenceWords: number;
  emojiCount: number;
  hashtagCount: number;
  exclamationCount: number;
  slangCount: number;
  hypeCount: number;
  clickbaitCount: number;
  hardSellCount: number;
  guaranteeCount: number;
  jargonCount: number;
  authorityClaimCount: number;
  formalCount: number;
  profanityCount: number;
  allCapsRatio: number;
  passiveVoiceRatio: number;
}

@Injectable()
export class ContentBrandVoiceService {
  private readonly logger = new Logger(ContentBrandVoiceService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(ContentBrandVoiceResult.name) private readonly brandVoiceModel: Model<ContentBrandVoiceResultDocument>,
  ) {}

  /**
   * Deterministic, non-AI brand voice review of an already-generated
   * version. Persists (upserts) one current result per contentVersionId.
   */
  async reviewContentVersion(input: ReviewBrandVoiceInput): Promise<ContentBrandVoiceResultResponse> {
    const { checks, warnings: reviewWarnings } = this.reviewText({
      kind: input.kind,
      payload: input.payload,
      text: input.text,
      brandVoiceSnapshot: input.brandVoiceSnapshot,
      generationOptions: input.generationOptions,
    });

    const passedCount = checks.filter((c) => c.classification === 'passed').length;
    const warningCount = checks.filter((c) => c.classification === 'warning').length;
    const failedCount = checks.filter((c) => c.classification === 'failed').length;

    const applicable = checks.filter((c) => c.classification !== 'not_applicable' && (CHECK_WEIGHTS[c.type] ?? 0) > 0);
    const totalWeight = applicable.reduce((sum, c) => sum + (CHECK_WEIGHTS[c.type] ?? 0), 0);

    const warnings = [...reviewWarnings];
    let score: number;
    if (totalWeight === 0) {
      score = 100;
      warnings.push('No checkable brand voice signals were detected.');
    } else {
      const weightedSum = applicable.reduce(
        (sum, c) => sum + (CHECK_WEIGHTS[c.type] ?? 0) * CLASSIFICATION_SCORE[c.classification as Exclude<BrandVoiceCheckClassification, 'not_applicable'>],
        0,
      );
      score = Math.round(weightedSum / totalWeight);
    }

    const severeAvoidViolation = checks.find((c) => c.type === 'avoid_rules')?.classification === 'failed';
    if (severeAvoidViolation) {
      score = Math.min(score, this.getAlignedMin() - 1);
    }

    let status = this.resolveStatus(score);
    if (severeAvoidViolation && status === 'aligned') status = 'needs_adjustment';

    const reviewedAt = new Date();
    const doc = await this.brandVoiceModel.findOneAndUpdate(
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
      `contentVersionId=${input.contentVersionId} kind=brand_voice score=${score} status=${status} passed=${passedCount} warning=${warningCount} failed=${failedCount} success=true`,
    );

    return this.toResponse(doc);
  }

  async getResult(contentVersionId: string): Promise<ContentBrandVoiceResultResponse | null> {
    const doc = await this.brandVoiceModel.findOne({ contentVersionId: new Types.ObjectId(contentVersionId) });
    return doc ? this.toResponse(doc) : null;
  }

  async getSummary(contentVersionId: string): Promise<ContentBrandVoiceSummary | undefined> {
    const doc = await this.brandVoiceModel.findOne({ contentVersionId: new Types.ObjectId(contentVersionId) }).select('status score warningCount failedCount');
    if (!doc) return undefined;
    return { status: doc.status, score: doc.score, warningCount: doc.warningCount, failedCount: doc.failedCount };
  }

  async getSummariesByVersionIds(contentVersionIds: string[]): Promise<Map<string, ContentBrandVoiceSummary>> {
    if (contentVersionIds.length === 0) return new Map();
    const docs = await this.brandVoiceModel
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
    brandVoiceSnapshot?: ContentVersionBrandVoiceSnapshot;
    generationOptions?: ContentVersionGenerationOptions;
  }): { checks: BrandVoiceCheck[]; warnings: string[] } {
    const { kind, payload, text, brandVoiceSnapshot, generationOptions } = input;
    const tone = generationOptions?.tone;
    const stats = this.computeStats(text);

    const warnings: string[] = [];
    const hasExplicitProfile = !!(brandVoiceSnapshot?.style?.length || brandVoiceSnapshot?.avoid?.length);
    if (!hasExplicitProfile) warnings.push(NO_BRAND_PROFILE_WARNING);

    const checks: BrandVoiceCheck[] = [
      this.checkRequestedTone(tone, stats),
      this.checkStyleAlignment(brandVoiceSnapshot?.style, stats),
      this.checkAvoidRules(brandVoiceSnapshot?.avoid, stats),
      this.checkHype(stats),
      this.checkProfessionalism(tone, stats),
      this.checkConversationality(tone, stats),
      this.checkClarity(stats),
      this.checkConsistency(text, stats),
      this.checkUnsupportedVoiceClaims(stats),
      this.checkPlatformFit(kind, payload, stats, generationOptions),
    ];

    return { checks, warnings };
  }

  private computeStats(text: string): TextStats {
    const sentences = splitSentences(text);
    const words = text.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const sentenceCount = sentences.length;
    const averageSentenceWords = sentenceCount > 0 ? Math.round((wordCount / sentenceCount) * 10) / 10 : 0;

    const allCapsWords = words.filter((w) => w.length >= 4 && /[A-Z]/.test(w) && w === w.toUpperCase()).length;
    const passiveVoiceCount = sentences.filter((s) => PASSIVE_VOICE_PATTERN.test(s)).length;

    return {
      wordCount,
      sentenceCount,
      averageSentenceWords,
      emojiCount: this.countMatches(EMOJI_PATTERN, text),
      hashtagCount: this.countMatches(HASHTAG_PATTERN, text),
      exclamationCount: this.countMatches(/!/g, text),
      slangCount: this.countMatches(SLANG_PATTERN, text),
      hypeCount: this.countMatches(HYPE_PATTERN, text),
      clickbaitCount: this.countMatches(CLICKBAIT_PATTERN, text),
      hardSellCount: this.countMatches(HARD_SELL_PATTERN, text),
      guaranteeCount: this.countMatches(GUARANTEE_PATTERN, text),
      jargonCount: this.countMatches(JARGON_PATTERN, text),
      authorityClaimCount: this.countMatches(AUTHORITY_CLAIM_PATTERN, text),
      formalCount: this.countMatches(FORMAL_BUREAUCRATIC_PATTERN, text),
      profanityCount: this.countMatches(PROFANITY_PATTERN, text),
      allCapsRatio: wordCount > 0 ? allCapsWords / wordCount : 0,
      passiveVoiceRatio: sentenceCount > 0 ? passiveVoiceCount / sentenceCount : 0,
    };
  }

  private checkRequestedTone(tone: string | undefined, stats: TextStats): BrandVoiceCheck {
    if (!tone) return this.check('requested_tone', 'not_applicable', 'No requested tone was specified for this generation.');

    switch (tone) {
      case 'professional': {
        if (stats.slangCount >= 3 || stats.emojiCount >= 6) return this.check('requested_tone', 'failed', 'Content is heavy on slang/emojis for a professional tone.');
        if (stats.slangCount >= 1 || stats.emojiCount >= 3) return this.check('requested_tone', 'warning', 'Content has some slang/emoji usage that is less measured than a professional tone.');
        return this.check('requested_tone', 'passed', 'Wording is clear and measured, consistent with a professional tone.');
      }
      case 'conversational': {
        if (stats.formalCount >= 2) return this.check('requested_tone', 'failed', 'Content reads as overly formal/bureaucratic for a conversational tone.');
        if (stats.formalCount >= 1) return this.check('requested_tone', 'warning', 'Content has some formal phrasing that is stiffer than a conversational tone.');
        return this.check('requested_tone', 'passed', 'Sentences read as natural and direct, consistent with a conversational tone.');
      }
      case 'friendly': {
        if (stats.hypeCount >= 2) return this.check('requested_tone', 'warning', 'Enthusiasm reads as exaggerated for a friendly tone.');
        return this.check('requested_tone', 'passed', 'Tone is approachable without exaggerated enthusiasm.');
      }
      case 'educational': {
        if (stats.hypeCount >= 1) return this.check('requested_tone', 'warning', 'Promotional/hype phrasing undercuts an educational tone.');
        return this.check('requested_tone', 'passed', 'Content reads as explanatory with low hype, consistent with an educational tone.');
      }
      case 'thought_leadership': {
        if (stats.authorityClaimCount >= 1) return this.check('requested_tone', 'warning', 'Unsupported authority phrasing undercuts a thought-leadership tone.');
        return this.check('requested_tone', 'passed', 'Content reads as a clear perspective without unsupported authority claims.');
      }
      case 'energetic':
      case 'inspirational': {
        if (stats.hypeCount >= 3) return this.check('requested_tone', 'failed', 'Hype phrasing is excessive even for an energetic/inspirational tone.');
        if (stats.hypeCount >= 1) return this.check('requested_tone', 'warning', 'Some hype phrasing is present; keep enthusiasm free of guarantees/overclaiming.');
        return this.check('requested_tone', 'passed', 'Tone is lively without hype or guarantees.');
      }
      case 'concise': {
        if (stats.averageSentenceWords > 30) return this.check('requested_tone', 'warning', 'Sentences are longer than expected for a concise tone.');
        return this.check('requested_tone', 'passed', 'Sentences are short and direct, consistent with a concise tone.');
      }
      default:
        return this.check('requested_tone', 'not_applicable', `No deterministic profile is defined for the requested tone "${tone}".`);
    }
  }

  private checkStyleAlignment(style: string[] | undefined, stats: TextStats): BrandVoiceCheck {
    if (!style || style.length === 0) return this.check('style_alignment', 'not_applicable', 'No style dimensions were specified for this generation.');

    const normalized = style.map((s) => s.trim().toLowerCase());
    const known = normalized.filter((s) => KNOWN_STYLE_DIMENSIONS.has(s));
    if (known.length === 0) return this.check('style_alignment', 'not_applicable', `Style instruction(s) are not in a recognized deterministic style dimension: ${style.join(', ')}.`);

    const issues: string[] = [];
    if (known.includes('concise') && stats.averageSentenceWords > 25) issues.push('concise');
    if (known.includes('clear') && stats.averageSentenceWords > 30) issues.push('clear');
    if (known.includes('direct') && stats.passiveVoiceRatio > 0.4) issues.push('direct');
    if (known.includes('formal') && (stats.slangCount >= 1 || stats.emojiCount >= 1)) issues.push('formal');
    if (known.includes('casual') && stats.formalCount >= 1) issues.push('casual');

    if (issues.length === 0) return this.check('style_alignment', 'passed', `Content is broadly consistent with the requested style: ${known.join(', ')}.`);
    return this.check('style_alignment', 'warning', `Content does not clearly reflect the requested style dimension(s): ${issues.join(', ')}.`, issues);
  }

  private checkAvoidRules(avoid: string[] | undefined, stats: TextStats): BrandVoiceCheck {
    if (!avoid || avoid.length === 0) return this.check('avoid_rules', 'not_applicable', 'No avoid rules were specified for this generation.');

    const normalized = avoid.map((a) => a.trim().toLowerCase());
    const violations: string[] = [];
    let severe = false;

    if (normalized.includes('hype') && stats.hypeCount >= 1) {
      violations.push(`hype phrasing (${stats.hypeCount} occurrence(s))`);
      if (stats.hypeCount >= 3) severe = true;
    }
    if (normalized.includes('aggressive selling') && stats.hardSellCount >= 1) {
      violations.push(`aggressive-selling phrasing (${stats.hardSellCount} occurrence(s))`);
      if (stats.hardSellCount >= 2) severe = true;
    }
    if (normalized.includes('jargon') && stats.jargonCount >= 1) {
      violations.push(`jargon (${stats.jargonCount} occurrence(s))`);
    }
    if (normalized.includes('slang') && stats.slangCount >= 1) {
      violations.push(`slang (${stats.slangCount} occurrence(s))`);
    }
    if (normalized.includes('excessive emojis') && stats.emojiCount >= 5) {
      violations.push(`excessive emoji usage (${stats.emojiCount})`);
    }
    if (normalized.includes('excessive hashtags') && stats.hashtagCount >= 5) {
      violations.push(`excessive hashtag usage (${stats.hashtagCount})`);
    }
    if (normalized.includes('clickbait') && stats.clickbaitCount >= 1) {
      violations.push(`clickbait phrasing (${stats.clickbaitCount} occurrence(s))`);
      severe = true;
    }
    // Guarantees are a distinct, always-severe violation regardless of
    // general hype density.
    if (normalized.includes('guarantees') && stats.guaranteeCount >= 1) {
      violations.push(`guaranteed-outcome wording (${stats.guaranteeCount} occurrence(s))`);
      severe = true;
    }

    if (violations.length === 0) return this.check('avoid_rules', 'passed', 'No violations of the requested avoid rules were detected.');
    if (severe) return this.check('avoid_rules', 'failed', `Requested avoid rule(s) were violated: ${violations.join('; ')}.`, violations);
    return this.check('avoid_rules', 'warning', `Requested avoid rule(s) may be violated: ${violations.join('; ')}.`, violations);
  }

  private checkHype(stats: TextStats): BrandVoiceCheck {
    const issues = [stats.hypeCount >= 1, stats.clickbaitCount >= 1, stats.allCapsRatio > 0.05, stats.exclamationCount > stats.sentenceCount && stats.sentenceCount > 0].filter(Boolean).length;
    if (stats.hypeCount >= 3 || stats.clickbaitCount >= 2) return this.check('hype', 'failed', 'Promotional/hype and clickbait phrasing is excessive.');
    if (issues >= 1) return this.check('hype', 'warning', 'Some promotional/hype or clickbait signals were detected.');
    return this.check('hype', 'passed', 'No excessive promotional/hype or clickbait phrasing detected.');
  }

  private checkProfessionalism(tone: string | undefined, stats: TextStats): BrandVoiceCheck {
    if (tone !== 'professional') return this.check('professionalism', 'not_applicable', 'Professionalism check applies to professional-tone content only.');
    if (stats.profanityCount >= 1) return this.check('professionalism', 'failed', 'Profanity is present in professional-tone content.');
    const issues = [stats.slangCount >= 1, stats.emojiCount >= 3, stats.exclamationCount >= 3].filter(Boolean).length;
    if (issues >= 2) return this.check('professionalism', 'failed', 'Slang/emoji/exclamation usage is excessive for professional-tone content.');
    if (issues === 1) return this.check('professionalism', 'warning', 'Some slang/emoji/exclamation usage is present in professional-tone content.');
    return this.check('professionalism', 'passed', 'Wording is appropriately professional.');
  }

  private checkConversationality(tone: string | undefined, stats: TextStats): BrandVoiceCheck {
    if (tone !== 'conversational' && tone !== 'friendly') return this.check('conversationality', 'not_applicable', 'Conversationality check applies to conversational/friendly-tone content only.');
    const issues = [stats.formalCount >= 1, stats.passiveVoiceRatio > 0.5, stats.jargonCount >= 2].filter(Boolean).length;
    if (issues >= 2) return this.check('conversationality', 'failed', 'Content is noticeably stiff/formal for a conversational or friendly tone.');
    if (issues === 1) return this.check('conversationality', 'warning', 'Content shows some stiffness for a conversational or friendly tone.');
    return this.check('conversationality', 'passed', 'Content reads as natural and approachable.');
  }

  private checkClarity(stats: TextStats): BrandVoiceCheck {
    if (stats.wordCount === 0) return this.check('clarity', 'not_applicable', 'No content to evaluate.');
    if (stats.jargonCount >= 2) return this.check('clarity', 'warning', 'Frequent corporate jargon reduces clarity.');
    return this.check('clarity', 'passed', 'Wording is reasonably clear.');
  }

  private checkConsistency(text: string, stats: TextStats): BrandVoiceCheck {
    if (stats.wordCount < 40) return this.check('consistency', 'not_applicable', 'Not enough content to assess tone consistency.');
    const mid = Math.floor(text.length / 2);
    const firstHalf = text.slice(0, mid);
    const secondHalf = text.slice(mid);
    const firstEmoji = this.countMatches(EMOJI_PATTERN, firstHalf);
    const secondEmoji = this.countMatches(EMOJI_PATTERN, secondHalf);
    const firstFormal = this.countMatches(FORMAL_BUREAUCRATIC_PATTERN, firstHalf);
    const secondFormal = this.countMatches(FORMAL_BUREAUCRATIC_PATTERN, secondHalf);
    const firstSlang = this.countMatches(SLANG_PATTERN, firstHalf);
    const secondSlang = this.countMatches(SLANG_PATTERN, secondHalf);

    if (Math.abs(firstEmoji - secondEmoji) >= 3) return this.check('consistency', 'warning', 'Emoji usage is uneven across the content.');
    if ((firstFormal >= 1 && secondSlang >= 1) || (secondFormal >= 1 && firstSlang >= 1)) {
      return this.check('consistency', 'warning', 'Tone shifts between formal and casual language across the content.');
    }
    return this.check('consistency', 'passed', 'Tone is consistent across the content.');
  }

  private checkUnsupportedVoiceClaims(stats: TextStats): BrandVoiceCheck {
    if (stats.authorityClaimCount === 0) return this.check('unsupported_voice_claims', 'passed', 'No unsupported authority phrasing detected.');
    return this.check('unsupported_voice_claims', 'warning', `Content uses unsupported authority phrasing (${stats.authorityClaimCount} occurrence(s)).`);
  }

  private checkPlatformFit(kind: ContentGenerationKind, payload: ContentVersionPayload, stats: TextStats, generationOptions: ContentVersionGenerationOptions | undefined): BrandVoiceCheck {
    const issues: string[] = [];
    const hashtagCount = payload.hashtagCount ?? stats.hashtagCount;
    const emojiCount = payload.emojiCount ?? stats.emojiCount;

    if (generationOptions?.includeHashtags === false && hashtagCount > 0) {
      issues.push(`${hashtagCount} hashtag(s) present though hashtags were disabled for this generation`);
    }
    if (generationOptions?.includeEmojis === false && emojiCount > 0) {
      issues.push(`${emojiCount} emoji(s) present though emojis were disabled for this generation`);
    }
    if (kind === 'x' && stats.averageSentenceWords > 30) {
      issues.push('sentences are longer than typical for concise, direct X posts');
    }
    if ((kind === 'blog' || kind === 'newsletter' || kind === 'linkedin') && stats.emojiCount > 5) {
      issues.push('emoji usage is heavier than typical for this content type');
    }
    if (kind === 'video_script' && stats.hashtagCount > 0) {
      issues.push('hashtags are present in spoken narration, which is not natural for a video script');
    }

    if (issues.length === 0) return this.check('platform_fit', 'passed', 'Content style fits the requested platform/content type.');
    if (issues.length >= 2) return this.check('platform_fit', 'failed', `Content does not fit the platform/generation constraints: ${issues.join('; ')}.`);
    return this.check('platform_fit', 'warning', `Content may not fit the platform/generation constraints: ${issues.join('; ')}.`);
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private check(type: BrandVoiceCheckType, classification: BrandVoiceCheckClassification, reason: string, evidence?: string[]): BrandVoiceCheck {
    return { id: randomUUID(), type, classification, reason, evidence: evidence ?? [] };
  }

  private countMatches(pattern: RegExp, text: string): number {
    return text.match(pattern)?.length ?? 0;
  }

  // ---------------------------------------------------------------------
  // Scoring
  // ---------------------------------------------------------------------

  private resolveStatus(score: number): ContentBrandVoiceStatus {
    if (score >= this.getAlignedMin()) return 'aligned';
    if (score >= this.getAdjustmentMin()) return 'needs_adjustment';
    return 'misaligned';
  }

  private getAlignedMin(): number {
    return this.getEnvNumber('CONTENT_BRAND_ALIGNED_MIN', DEFAULT_ALIGNED_MIN);
  }

  private getAdjustmentMin(): number {
    return this.getEnvNumber('CONTENT_BRAND_ADJUSTMENT_MIN', DEFAULT_ADJUSTMENT_MIN);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  // ---------------------------------------------------------------------
  // Mapping
  // ---------------------------------------------------------------------

  private toResponse(doc: ContentBrandVoiceResultDocument): ContentBrandVoiceResultResponse {
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
