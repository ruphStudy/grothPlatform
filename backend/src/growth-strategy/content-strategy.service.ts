import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FunnelStage, FunnelStageStrategy, FunnelStrategyResult } from './types/funnel-strategy.types';
import type { GrowthChannel, GrowthChannelFitResult } from './types/growth-channel-fit.types';
import type { GrowthObjectiveResult } from './types/growth-objective.types';
import type { MessagingPillar, MessagingStrategyResult } from './types/messaging-strategy.types';
import type { ContentFormat, ContentFormatRecommendation, ContentPillar, ContentStrategyResult, ContentTopicDirection } from './types/content-strategy.types';
import type { StrategySignal, StrategySignalResult } from './types/strategy-signal.types';

const DEFAULT_MAX_PILLARS = 6;
const DEFAULT_MAX_FORMATS = 8;
const DEFAULT_MAX_TOPIC_DIRECTIONS = 20;
const DEFAULT_MAX_KEYWORDS_PER_TOPIC = 5;

const DISCLAIMER =
  'Content strategy recommendations are evidence-based planning directions, not verified search-demand or performance predictions.';
const CASE_STUDY_MISSING_EVIDENCE = 'Customer proof/case-study evidence is unavailable; case-study content was not recommended.';

interface PillarRuleResult {
  theme: string;
  title: string;
  messagingPillar: MessagingPillar;
  extraKeywordSignals: StrategySignal[];
  reasons: string[];
}

interface Context {
  byCategory: Map<string, StrategySignal[]>;
  keywordSignals: StrategySignal[];
  keywordByValue: Map<string, StrategySignal>;
  messagingByTheme: Map<string, MessagingPillar>;
  stagesByName: Map<FunnelStage, FunnelStageStrategy>;
  channelByName: Map<GrowthChannel, GrowthChannelFitResult['channels'][number]>;
}

const FORMAT_RULES: { format: ContentFormat; channels: GrowthChannel[]; stages: FunnelStage[]; pillarThemes: string[] }[] = [
  { format: 'blog', channels: ['seo', 'content'], stages: ['awareness', 'consideration'], pillarThemes: ['problem_education', 'category_education', 'use_case_education'] },
  { format: 'guide', channels: ['seo', 'content', 'community'], stages: ['awareness', 'consideration', 'activation'], pillarThemes: ['category_education', 'use_case_education', 'activation_how_to'] },
  { format: 'landing_page', channels: ['seo', 'paid_search'], stages: ['consideration', 'conversion'], pillarThemes: ['product_value_education', 'comparison_evaluation'] },
  { format: 'comparison_page', channels: ['paid_search'], stages: ['consideration', 'conversion'], pillarThemes: ['comparison_evaluation', 'differentiation'] },
  { format: 'faq', channels: ['seo', 'content', 'product_led'], stages: ['consideration', 'conversion', 'activation'], pillarThemes: ['buyer_enablement', 'activation_how_to'] },
  { format: 'social_post', channels: ['organic_social', 'paid_social'], stages: ['awareness'], pillarThemes: ['problem_education', 'category_education'] },
  { format: 'short_video', channels: ['organic_social'], stages: ['awareness'], pillarThemes: ['problem_education', 'use_case_education'] },
  { format: 'webinar', channels: ['community'], stages: ['consideration'], pillarThemes: ['buyer_enablement', 'use_case_education'] },
  { format: 'email', channels: ['email'], stages: ['conversion', 'activation'], pillarThemes: ['buyer_enablement', 'activation_how_to'] },
  { format: 'checklist', channels: ['product_led'], stages: ['activation'], pillarThemes: ['activation_how_to'] },
  { format: 'documentation', channels: ['product_led'], stages: ['activation'], pillarThemes: ['activation_how_to'] },
];

const TOPIC_INTENT_BY_THEME: Record<string, string> = {
  problem_education: 'informational',
  category_education: 'informational',
  use_case_education: 'audience_specific',
  product_value_education: 'commercial',
  comparison_evaluation: 'comparison',
  differentiation: 'comparison',
  buyer_enablement: 'comparison',
  activation_how_to: 'informational',
};

const TOPIC_STAGE_BY_THEME: Record<string, FunnelStage> = {
  problem_education: 'awareness',
  category_education: 'awareness',
  use_case_education: 'consideration',
  product_value_education: 'consideration',
  comparison_evaluation: 'consideration',
  differentiation: 'consideration',
  buyer_enablement: 'conversion',
  activation_how_to: 'activation',
};

export interface ContentStrategyInput {
  signals: StrategySignalResult;
  objectives: GrowthObjectiveResult;
  channels: GrowthChannelFitResult;
  funnel: FunnelStrategyResult;
  messaging: MessagingStrategyResult;
}

@Injectable()
export class ContentStrategyService {
  constructor(private readonly configService: ConfigService) {}

  build(input: ContentStrategyInput): ContentStrategyResult {
    const ctx = this.buildContext(input);

    const rawPillars = [
      this.pillarFromMessaging(ctx, 'pain_relief', 'problem_education', (v) => `${v} — Problem Education Content`),
      this.pillarFromMessaging(ctx, 'category_education', 'category_education', (v) => `${v} Category Education`),
      this.pillarFromMessaging(ctx, 'use_case_effectiveness', 'use_case_education', (v) => `${v} — Use-Case Education`),
      this.pillarFromMessaging(ctx, 'core_value_outcome', 'product_value_education', (v) => `${v} — Product/Value Education`),
      this.pillarFromMessaging(ctx, 'differentiation', 'differentiation', (v) => `${v} — Differentiation Content`),
      this.pillarFromMessaging(ctx, 'buyer_confidence', 'buyer_enablement', (v) => `${v} — Buyer Enablement Content`),
      this.pillarFromMessaging(ctx, 'ease_activation', 'activation_how_to', (v) => `${v} — Activation / How-To Content`),
      this.pillarComparisonEvaluation(ctx),
    ].filter((r): r is PillarRuleResult => r !== null);

    const pillars = rawPillars
      .map((r) => this.finalizePillar(ctx, r))
      .sort((a, b) => b.priorityScore - a.priorityScore || b.confidenceScore - a.confidenceScore || a.id.localeCompare(b.id))
      .slice(0, this.getMaxPillars());

    const primaryPillarId = pillars[0]?.id;

    const formats = this.buildFormats(ctx, pillars);
    const topicDirections = this.buildTopicDirections(ctx, pillars);

    const missingEvidence = [CASE_STUDY_MISSING_EVIDENCE];
    if (pillars.length === 0) missingEvidence.push('No strong content-pillar evidence was found from current messaging/signal evidence.');

    const confidenceScores = [...pillars.map((p) => p.confidenceScore), ...formats.map((f) => f.confidenceScore), ...topicDirections.map((t) => t.confidenceScore)];
    const confidenceScore = confidenceScores.length ? Math.round(this.mean(confidenceScores)) : 0;

    return {
      pillars,
      formats,
      topicDirections,
      primaryPillarId,
      confidenceScore,
      missingEvidence,
      warnings: [DISCLAIMER],
      generatedAt: new Date(),
    };
  }

  // ---------------------------------------------------------------------
  // Context
  // ---------------------------------------------------------------------

  private buildContext(input: ContentStrategyInput): Context {
    const byCategory = new Map<string, StrategySignal[]>();
    for (const s of input.signals.signals) {
      const list = byCategory.get(s.category) ?? [];
      list.push(s);
      byCategory.set(s.category, list);
    }
    const keywordSignals = byCategory.get('keyword') ?? [];
    const keywordByValue = new Map(keywordSignals.map((s) => [s.value, s]));
    const messagingByTheme = new Map(input.messaging.pillars.map((p) => [p.theme, p]));
    const stagesByName = new Map(input.funnel.stages.map((s) => [s.stage, s]));
    const channelByName = new Map(input.channels.channels.map((c) => [c.channel, c]));

    return { byCategory, keywordSignals, keywordByValue, messagingByTheme, stagesByName, channelByName };
  }

  private keywordSignalsFor(ctx: Context, pattern: RegExp): StrategySignal[] {
    return ctx.keywordSignals.filter((s) => pattern.test(s.value.toLowerCase()));
  }

  // ---------------------------------------------------------------------
  // Pillar rules — operationalize an existing 12D messaging pillar rather
  // than re-deriving evidence from scratch.
  // ---------------------------------------------------------------------

  private pillarFromMessaging(ctx: Context, messagingTheme: string, contentTheme: string, titleFn: (anchorValue: string) => string): PillarRuleResult | null {
    const messagingPillar = ctx.messagingByTheme.get(messagingTheme);
    if (!messagingPillar) return null;

    const anchorValue = messagingPillar.title.replace(/^[^:]+:\s*/, '');
    return {
      theme: contentTheme,
      title: titleFn(anchorValue),
      messagingPillar,
      extraKeywordSignals: [],
      reasons: [`Operationalizes the "${messagingPillar.title}" messaging pillar into content.`],
    };
  }

  private pillarComparisonEvaluation(ctx: Context): PillarRuleResult | null {
    const comparisonKeywords = this.keywordSignalsFor(ctx, /\b(best|vs|versus|alternatives?|comparison)\b/);
    const anchor = ctx.messagingByTheme.get('buyer_confidence') ?? ctx.messagingByTheme.get('differentiation');
    if (comparisonKeywords.length === 0 || !anchor) return null;

    return {
      theme: 'comparison_evaluation',
      title: `${anchor.title.replace(/^[^:]+:\s*/, '')} — Comparison & Evaluation Content`,
      messagingPillar: anchor,
      extraKeywordSignals: comparisonKeywords,
      reasons: ['Comparison-intent keyword evidence combined with buyer/differentiation messaging supports evaluation-stage content.'],
    };
  }

  // ---------------------------------------------------------------------
  // Pillar scoring
  // ---------------------------------------------------------------------

  private finalizePillar(ctx: Context, raw: PillarRuleResult): ContentPillar {
    const mp = raw.messagingPillar;
    const keywordSignals = this.dedupe([...mp.supportingKeywords, ...raw.extraKeywordSignals.map((s) => s.value)])
      .map((v) => ctx.keywordByValue.get(v))
      .filter((s): s is StrategySignal => !!s);

    const funnelStages = mp.relatedFunnelStages.filter((s): s is FunnelStage => ctx.stagesByName.has(s as FunnelStage));

    const dims: { weight: number; value: number }[] = [{ weight: 0.3, value: mp.priorityScore }];
    if (keywordSignals.length > 0) dims.push({ weight: 0.25, value: this.mean(keywordSignals.map((s) => s.strengthScore)) });
    if (funnelStages.length > 0) dims.push({ weight: 0.2, value: this.mean(funnelStages.map((s) => ctx.stagesByName.get(s)!.priorityScore)) });
    if (mp.targetAudienceSegmentIds.length > 0) dims.push({ weight: 0.15, value: mp.priorityScore }); // proxy: audience linkage strength via the messaging pillar itself
    dims.push({ weight: 0.1, value: mp.priorityScore });
    const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0);
    const priorityScore = this.clamp(Math.round(dims.reduce((sum, d) => sum + d.weight * d.value, 0) / totalWeight), 0, 100);

    const distinctSources = new Set(['messaging', ...(keywordSignals.length ? ['keyword'] : []), ...(funnelStages.length ? ['funnel'] : [])]).size;
    const confidenceScore = this.clamp(
      Math.round(
        (mp.confidenceScore * 0.6 + (keywordSignals.length ? this.mean(keywordSignals.map((s) => s.confidenceScore)) : mp.confidenceScore) * 0.2) +
          Math.min(20, distinctSources * 7),
      ),
      0,
      100,
    );

    return {
      id: raw.theme.replace(/_/g, '-'),
      title: raw.title,
      theme: raw.theme,
      priorityScore,
      confidenceScore,
      targetAudienceSegmentIds: [...mp.targetAudienceSegmentIds],
      relatedObjectiveIds: [...mp.relatedObjectiveIds],
      relatedFunnelStages: funnelStages,
      relatedMessagingPillarIds: [mp.id],
      supportingKeywords: this.dedupe(keywordSignals.map((s) => s.value)).slice(0, this.getMaxKeywordsPerTopic() * 2),
      supportingSignalIds: this.dedupe([...mp.supportingSignalIds, ...keywordSignals.map((s) => s.id)]),
      reasons: raw.reasons,
      warnings: [],
    };
  }

  // ---------------------------------------------------------------------
  // Format recommendations
  // ---------------------------------------------------------------------

  private buildFormats(ctx: Context, pillars: ContentPillar[]): ContentFormatRecommendation[] {
    const results: ContentFormatRecommendation[] = [];

    for (const rule of FORMAT_RULES) {
      const channels = rule.channels.map((c) => ctx.channelByName.get(c)).filter((c): c is GrowthChannelFitResult['channels'][number] => !!c);
      if (channels.length === 0) continue;

      const stages = rule.stages.filter((s) => ctx.stagesByName.has(s));
      const relatedPillars = pillars.filter((p) => rule.pillarThemes.includes(p.theme));

      const dims: { weight: number; value: number }[] = [{ weight: 0.45, value: this.mean(channels.map((c) => c.fitScore)) }];
      if (stages.length > 0) dims.push({ weight: 0.3, value: this.mean(stages.map((s) => ctx.stagesByName.get(s)!.priorityScore)) });
      if (relatedPillars.length > 0) dims.push({ weight: 0.25, value: this.mean(relatedPillars.map((p) => p.priorityScore)) });
      const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0);
      const priorityScore = this.clamp(Math.round(dims.reduce((sum, d) => sum + d.weight * d.value, 0) / totalWeight), 0, 100);

      const confidenceScore = this.clamp(
        Math.round(
          this.mean(channels.map((c) => c.confidenceScore)) * 0.6 +
            (relatedPillars.length ? this.mean(relatedPillars.map((p) => p.confidenceScore)) : 0) * 0.2 +
            Math.min(20, (stages.length + relatedPillars.length) * 5),
        ),
        0,
        100,
      );

      results.push({
        format: rule.format,
        priorityScore,
        confidenceScore,
        targetFunnelStages: stages,
        targetAudienceSegmentIds: this.dedupe(relatedPillars.flatMap((p) => p.targetAudienceSegmentIds)),
        relatedContentPillarIds: relatedPillars.map((p) => p.id),
        reasons: [`Supported by channel(s): ${channels.map((c) => c.channel).join(', ')}.`],
      });
    }

    return results
      .sort((a, b) => b.priorityScore - a.priorityScore || a.format.localeCompare(b.format))
      .slice(0, this.getMaxFormats());
  }

  // ---------------------------------------------------------------------
  // Topic directions
  // ---------------------------------------------------------------------

  private buildTopicDirections(ctx: Context, pillars: ContentPillar[]): ContentTopicDirection[] {
    const directions: ContentTopicDirection[] = [];

    for (const pillar of pillars) {
      const anchorValue = pillar.title.replace(/\s*—.*$/, '').replace(/ Category Education$/, '');
      const title = this.topicTitleFor(pillar.theme, anchorValue);
      if (!title) continue;

      const funnelStage = pillar.relatedFunnelStages.find((s) => s === TOPIC_STAGE_BY_THEME[pillar.theme]) ?? pillar.relatedFunnelStages[0];
      if (!funnelStage) continue;

      const keywords = pillar.supportingKeywords.slice(0, this.getMaxKeywordsPerTopic());
      const keywordSignals = keywords.map((v) => ctx.keywordByValue.get(v)).filter((s): s is StrategySignal => !!s);
      const stageEntry = ctx.stagesByName.get(funnelStage as FunnelStage);

      const dims: { weight: number; value: number }[] = [{ weight: 0.35, value: pillar.priorityScore }];
      if (keywordSignals.length > 0) dims.push({ weight: 0.3, value: this.mean(keywordSignals.map((s) => s.strengthScore)) });
      if (stageEntry) dims.push({ weight: 0.2, value: stageEntry.priorityScore });
      if (pillar.targetAudienceSegmentIds.length > 0) dims.push({ weight: 0.15, value: pillar.priorityScore });
      const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0);
      const priorityScore = this.clamp(Math.round(dims.reduce((sum, d) => sum + d.weight * d.value, 0) / totalWeight), 0, 100);

      const confidenceScore = this.clamp(
        Math.round(pillar.confidenceScore * 0.7 + (keywordSignals.length ? this.mean(keywordSignals.map((s) => s.confidenceScore)) : pillar.confidenceScore) * 0.3),
        0,
        100,
      );

      directions.push({
        id: `${pillar.id}-topic-${directions.length + 1}`,
        title,
        contentPillarId: pillar.id,
        intent: TOPIC_INTENT_BY_THEME[pillar.theme] ?? 'informational',
        funnelStage,
        audienceSegmentIds: pillar.targetAudienceSegmentIds,
        keywords,
        priorityScore,
        confidenceScore,
        reasons: [`Derived from content pillar "${pillar.title}".`],
      });
    }

    return directions
      .sort((a, b) => b.priorityScore - a.priorityScore || a.title.localeCompare(b.title))
      .slice(0, this.getMaxTopicDirections());
  }

  private topicTitleFor(theme: string, anchorValue: string): string | null {
    switch (theme) {
      case 'problem_education':
        return `How to address: ${anchorValue}`;
      case 'category_education':
        return `Understanding ${anchorValue}: what it is and how it helps`;
      case 'use_case_education':
        return `How to get the most out of ${anchorValue}`;
      case 'product_value_education':
        return `${anchorValue}: core value and outcomes`;
      case 'comparison_evaluation':
        return `Comparing manual vs. structured approaches: ${anchorValue}`;
      case 'differentiation':
        return `What makes ${anchorValue} different`;
      case 'buyer_enablement':
        return `What buyers should evaluate: ${anchorValue}`;
      case 'activation_how_to':
        return `Getting started with ${anchorValue}`;
      default:
        return null;
    }
  }

  // ---------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------

  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private dedupe(items: string[]): string[] {
    return Array.from(new Set(items.filter((i) => i && i.trim())));
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private getMaxPillars(): number {
    return this.getEnvNumber('CONTENT_STRATEGY_MAX_PILLARS', DEFAULT_MAX_PILLARS);
  }

  private getMaxFormats(): number {
    return this.getEnvNumber('CONTENT_STRATEGY_MAX_FORMATS', DEFAULT_MAX_FORMATS);
  }

  private getMaxTopicDirections(): number {
    return this.getEnvNumber('CONTENT_STRATEGY_MAX_TOPIC_DIRECTIONS', DEFAULT_MAX_TOPIC_DIRECTIONS);
  }

  private getMaxKeywordsPerTopic(): number {
    return this.getEnvNumber('CONTENT_STRATEGY_MAX_KEYWORDS_PER_TOPIC', DEFAULT_MAX_KEYWORDS_PER_TOPIC);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
