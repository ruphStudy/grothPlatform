import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AcquisitionMotion, AcquisitionMotionType, AcquisitionPath, AcquisitionStrategyResult } from './types/acquisition-strategy.types';
import type { ContentFormatRecommendation, ContentPillar, ContentStrategyResult } from './types/content-strategy.types';
import type { FunnelStage, FunnelStageStrategy, FunnelStrategyResult } from './types/funnel-strategy.types';
import type { ChannelFit, GrowthChannel, GrowthChannelFitResult } from './types/growth-channel-fit.types';
import type { GrowthObjective, GrowthObjectiveResult, GrowthObjectiveType } from './types/growth-objective.types';
import type { MessagingPillar, MessagingStrategyResult } from './types/messaging-strategy.types';
import type { StrategySignal, StrategySignalResult } from './types/strategy-signal.types';

const DEFAULT_MAX_MOTIONS = 6;
const DEFAULT_MAX_PATHS = 8;
const DEFAULT_MAX_ACTIONS_PER_MOTION = 5;
const DEFAULT_MAX_KEYWORDS_PER_MOTION = 8;

const DISCLAIMER =
  'Acquisition strategy recommendations are evidence-based planning hypotheses and do not predict CAC, ROAS, reach, traffic, lead volume, or revenue.';

const FUNNEL_ORDER: FunnelStage[] = ['awareness', 'consideration', 'conversion', 'activation', 'retention'];

interface RawMotion {
  type: AcquisitionMotionType;
  title: string;
  channels: ChannelFit[];
  objectives: GrowthObjective[];
  audienceSignal?: StrategySignal;
  funnelStages: FunnelStage[];
  keywordSignals: StrategySignal[];
  contentPillars: ContentPillar[];
  messagingPillar?: MessagingPillar;
  supportingSignals: StrategySignal[];
  actions: string[];
  reasons: string[];
  weaknesses: string[];
}

interface Context {
  byCategory: Map<string, StrategySignal[]>;
  keywordSignals: StrategySignal[];
  channelByName: Map<GrowthChannel, ChannelFit>;
  objectiveByType: Map<GrowthObjectiveType, GrowthObjective>;
  stagesByName: Map<FunnelStage, FunnelStageStrategy>;
  messagingByTheme: Map<string, MessagingPillar>;
  contentPillars: ContentPillar[];
  contentFormats: ContentFormatRecommendation[];
}

export interface AcquisitionStrategyInput {
  signals: StrategySignalResult;
  objectives: GrowthObjectiveResult;
  channels: GrowthChannelFitResult;
  funnel: FunnelStrategyResult;
  messaging: MessagingStrategyResult;
  contentStrategy: ContentStrategyResult;
}

@Injectable()
export class AcquisitionStrategyService {
  constructor(private readonly configService: ConfigService) {}

  build(input: AcquisitionStrategyInput): AcquisitionStrategyResult {
    const ctx = this.buildContext(input);

    const raw = [
      this.motionOrganicSearch(ctx),
      this.motionContentDistribution(ctx),
      this.motionOrganicSocial(ctx),
      this.motionPaidSearch(ctx),
      this.motionPaidSocial(ctx),
      this.motionOutbound(ctx),
      this.motionEmailNurture(ctx),
      this.motionCommunity(ctx),
      this.motionPartnerships(ctx),
      this.motionProductLed(ctx),
    ].filter((m): m is RawMotion => m !== null);

    const motions = raw
      .map((r) => this.finalizeMotion(ctx, r))
      .sort((a, b) => b.priorityScore - a.priorityScore || b.confidenceScore - a.confidenceScore || a.id.localeCompare(b.id))
      .slice(0, this.getMaxMotions());

    const primaryMotionId = motions[0]?.id;

    const paths = this.buildPaths(ctx, motions);
    const primaryPathId = paths[0]?.id;

    const missingEvidence: string[] = [];
    if (motions.length === 0) missingEvidence.push('No strong channel/objective evidence was found to support acquisition motions.');
    if (!motions.some((m) => m.type === 'outbound' || m.type === 'email_nurture')) {
      missingEvidence.push('No buyer-relationship evidence was found; outbound/email-nurture motions were omitted.');
    }

    const confidenceScores = [...motions.map((m) => m.confidenceScore), ...paths.map((p) => p.confidenceScore)];
    const confidenceScore = confidenceScores.length ? Math.round(this.mean(confidenceScores)) : 0;

    return {
      motions,
      paths,
      primaryMotionId,
      primaryPathId,
      confidenceScore,
      missingEvidence,
      warnings: [DISCLAIMER],
      generatedAt: new Date(),
    };
  }

  // ---------------------------------------------------------------------
  // Context
  // ---------------------------------------------------------------------

  private buildContext(input: AcquisitionStrategyInput): Context {
    const byCategory = new Map<string, StrategySignal[]>();
    for (const s of input.signals.signals) {
      const list = byCategory.get(s.category) ?? [];
      list.push(s);
      byCategory.set(s.category, list);
    }
    return {
      byCategory,
      keywordSignals: byCategory.get('keyword') ?? [],
      channelByName: new Map(input.channels.channels.map((c) => [c.channel, c])),
      objectiveByType: new Map(input.objectives.objectives.map((o) => [o.type, o])),
      stagesByName: new Map(input.funnel.stages.map((s) => [s.stage, s])),
      messagingByTheme: new Map(input.messaging.pillars.map((p) => [p.theme, p])),
      contentPillars: input.contentStrategy.pillars,
      contentFormats: input.contentStrategy.formats,
    };
  }

  private find(ctx: Context, category: string, title: string): StrategySignal | undefined {
    return (ctx.byCategory.get(category) ?? []).find((s) => s.title === title);
  }

  private objectivesOf(ctx: Context, types: GrowthObjectiveType[]): GrowthObjective[] {
    return types.map((t) => ctx.objectiveByType.get(t)).filter((o): o is GrowthObjective => !!o);
  }

  private stagesOf(ctx: Context, stages: FunnelStage[]): FunnelStage[] {
    return stages.filter((s) => ctx.stagesByName.has(s));
  }

  private keywordSignalsFor(ctx: Context, pattern: RegExp): StrategySignal[] {
    return ctx.keywordSignals.filter((s) => pattern.test(s.value.toLowerCase()));
  }

  private contentPillarsForStages(ctx: Context, stages: FunnelStage[]): ContentPillar[] {
    return ctx.contentPillars.filter((p) => p.relatedFunnelStages.some((s) => stages.includes(s as FunnelStage)));
  }

  // ---------------------------------------------------------------------
  // Motion rules
  // ---------------------------------------------------------------------

  private motionOrganicSearch(ctx: Context): RawMotion | null {
    const channel = ctx.channelByName.get('seo');
    const objectives = this.objectivesOf(ctx, ['awareness', 'consideration']);
    const keywordSignals = ctx.keywordSignals;
    if (!channel || objectives.length === 0 || keywordSignals.length === 0) return null;

    const stages = this.stagesOf(ctx, ['awareness', 'consideration']);
    return {
      type: 'organic_search',
      title: 'Organic Search',
      channels: [channel],
      objectives,
      funnelStages: stages,
      keywordSignals,
      contentPillars: this.contentPillarsForStages(ctx, stages),
      supportingSignals: keywordSignals,
      actions: ['Target high-priority topic clusters', 'Publish intent-aligned educational/use-case content', 'Strengthen search landing coverage'],
      reasons: ['Strong SEO channel fit with keyword evidence and awareness/consideration objectives.'],
      weaknesses: [],
    };
  }

  private motionContentDistribution(ctx: Context): RawMotion | null {
    const channel = ctx.channelByName.get('content');
    if (!channel || ctx.contentPillars.length === 0) return null;

    const stages = this.stagesOf(ctx, ['awareness', 'consideration']);
    return {
      type: 'content_distribution',
      title: 'Content Distribution',
      channels: [channel],
      objectives: this.objectivesOf(ctx, ['awareness', 'education', 'consideration']),
      funnelStages: stages,
      keywordSignals: [],
      contentPillars: ctx.contentPillars,
      supportingSignals: [],
      actions: ['Distribute high-priority educational/use-case assets', 'Reuse content across supported owned/organic channels'],
      reasons: ['Strong content channel fit with established content pillars.'],
      weaknesses: [],
    };
  }

  private motionOrganicSocial(ctx: Context): RawMotion | null {
    const channel = ctx.channelByName.get('organic_social');
    if (!channel) return null;

    const stages = this.stagesOf(ctx, ['awareness']);
    return {
      type: 'organic_social',
      title: 'Organic Social',
      channels: [channel],
      objectives: this.objectivesOf(ctx, ['awareness']),
      funnelStages: stages,
      keywordSignals: [],
      contentPillars: this.contentPillarsForStages(ctx, ['awareness']),
      supportingSignals: [],
      actions: ['Distribute educational/problem/use-case content', 'Reinforce messaging pillars relevant to the audience'],
      reasons: ['Organic social channel fit supports top-of-funnel distribution.'],
      weaknesses: [],
    };
  }

  private motionPaidSearch(ctx: Context): RawMotion | null {
    const channel = ctx.channelByName.get('paid_search');
    const keywordSignals = this.keywordSignalsFor(ctx, /\b(software|platform|tool|solution|service|best|pricing|plans?|buy|trial|sign ?up|vs|versus|alternatives?|comparison)\b/);
    const objectives = this.objectivesOf(ctx, ['consideration', 'conversion']);
    if (!channel || keywordSignals.length === 0 || objectives.length === 0) return null;

    const transactional = this.keywordSignalsFor(ctx, /\b(pricing|plans?|buy|trial|sign ?up)\b/);
    const weaknesses: string[] = [];
    if (transactional.length === 0) weaknesses.push('Limited transactional keyword evidence.');

    const stages = this.stagesOf(ctx, ['consideration', 'conversion']);
    return {
      type: 'paid_search',
      title: 'Paid Search',
      channels: [channel],
      objectives,
      funnelStages: stages,
      keywordSignals,
      contentPillars: this.contentPillarsForStages(ctx, ['consideration', 'conversion']),
      supportingSignals: keywordSignals,
      actions: ['Target high-intent keyword themes', 'Route traffic to relevant landing/evaluation paths'],
      reasons: ['Commercial/transactional/comparison keyword evidence aligns with consideration/conversion objectives.'],
      weaknesses,
    };
  }

  private motionPaidSocial(ctx: Context): RawMotion | null {
    const channel = ctx.channelByName.get('paid_social');
    const audienceSignal = this.find(ctx, 'audience', 'Primary Audience') ?? this.find(ctx, 'audience', 'Ideal Customer Profile');
    if (!channel || !audienceSignal) return null;

    const stages = this.stagesOf(ctx, ['awareness', 'consideration']);
    return {
      type: 'paid_social',
      title: 'Paid Social',
      channels: [channel],
      objectives: this.objectivesOf(ctx, ['awareness', 'lead_generation']),
      audienceSignal,
      funnelStages: stages,
      keywordSignals: [],
      contentPillars: this.contentPillarsForStages(ctx, ['awareness', 'consideration']),
      supportingSignals: [audienceSignal],
      actions: ['Audience-targeted awareness/consideration acquisition', 'Promote supported value/problem themes'],
      reasons: [`Clear audience evidence ("${audienceSignal.value}") supports targeted paid social.`],
      weaknesses: [],
    };
  }

  private motionOutbound(ctx: Context): RawMotion | null {
    const channel = ctx.channelByName.get('outbound');
    const icpSignal = this.find(ctx, 'audience', 'Ideal Customer Profile');
    const buyerSignal = this.find(ctx, 'commercial', 'Buyer Role');
    const objectives = this.objectivesOf(ctx, ['lead_generation', 'buyer_enablement']);
    if (!channel || !icpSignal || !buyerSignal || objectives.length === 0) return null;

    const weaknesses: string[] = [];
    if (buyerSignal.confidenceScore < 60) weaknesses.push('Weak buyer evidence.');

    const stages = this.stagesOf(ctx, ['consideration', 'conversion']);
    return {
      type: 'outbound',
      title: 'Outbound',
      channels: [channel],
      objectives,
      audienceSignal: icpSignal,
      funnelStages: stages,
      keywordSignals: [],
      contentPillars: this.contentPillarsForStages(ctx, ['consideration', 'conversion']),
      supportingSignals: [icpSignal, buyerSignal],
      actions: ['Targeted account/persona outreach', 'Use-case/evaluation messaging', 'Proof/evaluation follow-up'],
      reasons: [`B2B ICP ("${icpSignal.value}") and buyer-role evidence support targeted outbound outreach.`],
      weaknesses,
    };
  }

  private motionEmailNurture(ctx: Context): RawMotion | null {
    const channel = ctx.channelByName.get('email');
    const buyerSignal = this.find(ctx, 'commercial', 'Buyer Role');
    const hasConversionStage = ctx.stagesByName.has('conversion');
    if (!channel || (!buyerSignal && !hasConversionStage)) return null;

    const stages = this.stagesOf(ctx, ['consideration', 'conversion']);
    return {
      type: 'email_nurture',
      title: 'Email Nurture',
      channels: [channel],
      objectives: this.objectivesOf(ctx, ['lead_generation', 'conversion']),
      funnelStages: stages,
      keywordSignals: [],
      contentPillars: this.contentPillarsForStages(ctx, ['consideration', 'conversion']),
      supportingSignals: buyerSignal ? [buyerSignal] : [],
      actions: ['Nurture consideration', 'Evaluation support', 'Conversion follow-up'],
      reasons: ['Existing buyer relationship or conversion-path evidence supports nurture email.'],
      weaknesses: buyerSignal ? [] : ['Limited buyer-relationship evidence; nurture path is inferred from the funnel only.'],
    };
  }

  private motionCommunity(ctx: Context): RawMotion | null {
    const channel = ctx.channelByName.get('community');
    if (!channel) return null;

    const stages = this.stagesOf(ctx, ['awareness', 'consideration']);
    return {
      type: 'community',
      title: 'Community',
      channels: [channel],
      objectives: this.objectivesOf(ctx, ['education', 'awareness', 'consideration']),
      funnelStages: stages,
      keywordSignals: [],
      contentPillars: this.contentPillarsForStages(ctx, ['awareness', 'consideration']),
      supportingSignals: [],
      actions: ['Educational participation', 'Use-case/problem discussions', 'Audience-specific resources'],
      reasons: ['Community channel fit supports peer-driven education and engagement.'],
      weaknesses: [],
    };
  }

  private motionPartnerships(ctx: Context): RawMotion | null {
    const channel = ctx.channelByName.get('partnerships');
    const businessModel = this.find(ctx, 'product', 'Business Model');
    const isB2BLike = !!businessModel && /b2b|marketplace|institution/i.test(businessModel.value);
    if (!channel || !isB2BLike || !businessModel) return null;

    return {
      type: 'partnerships',
      title: 'Partnerships',
      channels: [channel],
      objectives: this.objectivesOf(ctx, ['lead_generation', 'consideration']),
      funnelStages: this.stagesOf(ctx, ['consideration']),
      keywordSignals: [],
      contentPillars: [],
      supportingSignals: [businessModel],
      actions: ['Identify complementary partnership opportunities', 'Co-marketing/content collaboration', 'Referral/integration partnerships'],
      reasons: [`Business-model evidence ("${businessModel.value}") supports a complementary-partnership motion.`],
      weaknesses: [],
    };
  }

  private motionProductLed(ctx: Context): RawMotion | null {
    const channel = ctx.channelByName.get('product_led');
    const objectives = this.objectivesOf(ctx, ['conversion', 'activation']);
    if (!channel || objectives.length === 0) return null;

    const useCaseSignal = this.find(ctx, 'audience', 'Primary Use Case');
    return {
      type: 'product_led',
      title: 'Product-Led',
      channels: [channel],
      objectives,
      audienceSignal: useCaseSignal,
      funnelStages: this.stagesOf(ctx, ['conversion', 'activation']),
      keywordSignals: [],
      contentPillars: this.contentPillarsForStages(ctx, ['activation']),
      supportingSignals: useCaseSignal ? [useCaseSignal] : [],
      actions: ['Lower-friction product entry', 'First-value path', 'In-product activation'],
      reasons: ['Product-led channel fit with conversion/activation objective support.'],
      weaknesses: [],
    };
  }

  // ---------------------------------------------------------------------
  // Motion scoring
  // ---------------------------------------------------------------------

  private finalizeMotion(ctx: Context, raw: RawMotion): AcquisitionMotion {
    const dims: { weight: number; value: number }[] = [{ weight: 0.35, value: this.mean(raw.channels.map((c) => c.fitScore)) }];
    if (raw.objectives.length > 0) dims.push({ weight: 0.25, value: this.mean(raw.objectives.map((o) => o.priorityScore)) });
    if (raw.audienceSignal) dims.push({ weight: 0.15, value: raw.audienceSignal.strengthScore });
    if (raw.funnelStages.length > 0) {
      dims.push({ weight: 0.1, value: this.mean(raw.funnelStages.map((s) => ctx.stagesByName.get(s)?.priorityScore ?? 0)) });
    }
    if (raw.contentPillars.length > 0 || raw.supportingSignals.length > 0) {
      const contentValue = raw.contentPillars.length ? this.mean(raw.contentPillars.map((p) => p.priorityScore)) : this.mean(raw.supportingSignals.map((s) => s.strengthScore));
      dims.push({ weight: 0.1, value: contentValue });
    }
    if (raw.keywordSignals.length > 0) dims.push({ weight: 0.05, value: this.mean(raw.keywordSignals.map((s) => s.strengthScore)) });
    const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0);
    const priorityScore = this.clamp(Math.round(dims.reduce((sum, d) => sum + d.weight * d.value, 0) / totalWeight), 0, 100);

    const allEvidence = [...raw.supportingSignals, ...raw.keywordSignals];
    const distinctSources = new Set(['channel', ...(raw.objectives.length ? ['objective'] : []), ...(allEvidence.length ? ['signal'] : []), ...(raw.contentPillars.length ? ['content'] : [])]).size;
    const confidenceScore = this.clamp(
      Math.round(
        this.mean(raw.channels.map((c) => c.confidenceScore)) * 0.4 +
          (raw.objectives.length ? this.mean(raw.objectives.map((o) => o.confidenceScore)) : 0) * 0.3 +
          (allEvidence.length ? this.mean(allEvidence.map((s) => s.confidenceScore)) : 0) * 0.1 +
          Math.min(20, distinctSources * 6),
      ),
      0,
      100,
    );

    return {
      id: raw.type.replace(/_/g, '-'),
      type: raw.type,
      title: raw.title,
      priorityScore,
      confidenceScore,
      targetAudienceSegmentIds: this.dedupe(raw.audienceSignal?.relatedSegmentIds ?? []),
      relatedObjectiveIds: this.dedupe(raw.objectives.map((o) => o.id)),
      relatedChannels: this.dedupe(raw.channels.map((c) => c.channel)),
      relatedFunnelStages: this.dedupe(raw.funnelStages),
      relatedContentPillarIds: this.dedupe(raw.contentPillars.map((p) => p.id)),
      supportingKeywords: this.dedupe(raw.keywordSignals.map((s) => s.value)).slice(0, this.getMaxKeywordsPerMotion()),
      supportingSignalIds: this.dedupe(allEvidence.map((s) => s.id)),
      recommendedActions: raw.actions.slice(0, this.getMaxActionsPerMotion()),
      reasons: raw.reasons,
      weaknesses: this.dedupe(raw.weaknesses),
      warnings: [],
    };
  }

  // ---------------------------------------------------------------------
  // Paths
  // ---------------------------------------------------------------------

  private buildPaths(ctx: Context, motions: AcquisitionMotion[]): AcquisitionPath[] {
    const seen = new Set<string>();
    const paths: AcquisitionPath[] = [];

    for (const motion of motions) {
      const channel = motion.relatedChannels[0];
      const stage = FUNNEL_ORDER.find((s) => motion.relatedFunnelStages.includes(s));
      if (!channel || !stage) continue;

      const audienceSignal = motion.targetAudienceSegmentIds.length
        ? (ctx.byCategory.get('audience') ?? []).find((s) => (s.relatedSegmentIds ?? []).some((id) => motion.targetAudienceSegmentIds.includes(id)))
        : this.find(ctx, 'audience', 'Primary Audience') ?? this.find(ctx, 'audience', 'Ideal Customer Profile');
      const audienceLabel = audienceSignal?.value ?? 'Target audience';

      const key = `${audienceLabel}|${channel}|${stage}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const messagingPillar = ctx.messagingByTheme.get(this.messagingThemeForMotion(motion.type));
      const contentFormats = ctx.contentFormats.filter((f) => f.targetFunnelStages.includes(stage)).slice(0, 2);

      const conversionDirection = this.conversionDirectionFor(motion);

      const dims: { weight: number; value: number }[] = [{ weight: 0.3, value: motion.priorityScore }];
      if (audienceSignal) dims.push({ weight: 0.2, value: audienceSignal.strengthScore });
      const stageEntry = ctx.stagesByName.get(stage);
      if (stageEntry) dims.push({ weight: 0.2, value: stageEntry.priorityScore });
      if (messagingPillar || contentFormats.length) {
        dims.push({ weight: 0.2, value: messagingPillar?.priorityScore ?? this.mean(contentFormats.map((f) => f.priorityScore)) });
      }
      if (motion.supportingKeywords.length) dims.push({ weight: 0.1, value: motion.priorityScore });
      const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0);
      const priorityScore = this.clamp(Math.round(dims.reduce((sum, d) => sum + d.weight * d.value, 0) / totalWeight), 0, 100);

      const confidenceScore = this.clamp(
        Math.round(motion.confidenceScore * 0.6 + (audienceSignal?.confidenceScore ?? motion.confidenceScore) * 0.2 + (messagingPillar?.confidenceScore ?? motion.confidenceScore) * 0.2),
        0,
        100,
      );

      const contentLabel = contentFormats.length ? contentFormats.map((f) => f.format.replace(/_/g, ' ')).join('/') : 'supporting content';
      const messagingLabel = messagingPillar?.title ?? 'core messaging';

      paths.push({
        id: `path-${paths.length + 1}`,
        title: `${audienceLabel} → ${motion.title} → ${this.labelize(stage)} → ${messagingLabel} → ${contentLabel} → ${conversionDirection}`,
        entryChannel: channel,
        entryFunnelStage: stage,
        targetAudienceSegmentIds: motion.targetAudienceSegmentIds,
        contentFormatDirections: contentFormats.map((f) => f.format),
        messagingPillarIds: messagingPillar ? [messagingPillar.id] : [],
        conversionDirection,
        priorityScore,
        confidenceScore,
        reasons: [`Connects ${audienceLabel} through ${motion.title} at the ${this.labelize(stage)} stage toward ${conversionDirection.toLowerCase()}.`],
      });
    }

    return paths
      .sort((a, b) => b.priorityScore - a.priorityScore || a.id.localeCompare(b.id))
      .slice(0, this.getMaxPaths());
  }

  private messagingThemeForMotion(type: AcquisitionMotionType): string {
    const map: Partial<Record<AcquisitionMotionType, string>> = {
      organic_search: 'category_education',
      content_distribution: 'pain_relief',
      organic_social: 'pain_relief',
      paid_search: 'buyer_confidence',
      paid_social: 'core_value_outcome',
      outbound: 'buyer_confidence',
      email_nurture: 'buyer_confidence',
      community: 'use_case_effectiveness',
      partnerships: 'differentiation',
      product_led: 'ease_activation',
    };
    return map[type] ?? '';
  }

  private conversionDirectionFor(motion: AcquisitionMotion): string {
    if (motion.type === 'product_led') return 'Product exploration / signup direction';
    if (motion.type === 'outbound' || motion.type === 'email_nurture') return 'Lead capture / demo direction';
    if (motion.type === 'paid_search' || motion.type === 'paid_social') return 'Evaluation / conversion action';
    return 'Appropriate conversion action';
  }

  private labelize(value: string): string {
    return value.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
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

  private getMaxMotions(): number {
    return this.getEnvNumber('ACQUISITION_MAX_MOTIONS', DEFAULT_MAX_MOTIONS);
  }

  private getMaxPaths(): number {
    return this.getEnvNumber('ACQUISITION_MAX_PATHS', DEFAULT_MAX_PATHS);
  }

  private getMaxActionsPerMotion(): number {
    return this.getEnvNumber('ACQUISITION_MAX_ACTIONS_PER_MOTION', DEFAULT_MAX_ACTIONS_PER_MOTION);
  }

  private getMaxKeywordsPerMotion(): number {
    return this.getEnvNumber('ACQUISITION_MAX_KEYWORDS_PER_MOTION', DEFAULT_MAX_KEYWORDS_PER_MOTION);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
