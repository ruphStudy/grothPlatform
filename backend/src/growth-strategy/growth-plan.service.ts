import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AcquisitionMotion, AcquisitionMotionType, AcquisitionStrategyResult } from './types/acquisition-strategy.types';
import type { ContentPillar, ContentStrategyResult } from './types/content-strategy.types';
import type { ConversionStrategyResult } from './types/conversion-strategy.types';
import type { FunnelStrategyResult } from './types/funnel-strategy.types';
import type { GrowthChannelFitResult } from './types/growth-channel-fit.types';
import type { GrowthObjective, GrowthObjectiveResult } from './types/growth-objective.types';
import type { GrowthInitiative, GrowthInitiativeType, GrowthPlanMilestone, GrowthPlanPhase, GrowthPlanPhaseSummary, GrowthPlanResult } from './types/growth-plan.types';
import type { MessagingPillar, MessagingStrategyResult } from './types/messaging-strategy.types';
import type { StrategySignal, StrategySignalResult } from './types/strategy-signal.types';

const DEFAULT_MAX_INITIATIVES_PER_PHASE = 8;
const DEFAULT_MAX_TOP_PRIORITIES = 6;
const DEFAULT_MAX_ACTIONS_PER_INITIATIVE = 5;
const DEFAULT_MAX_MILESTONES_PER_PHASE = 3;

const DISCLAIMERS = [
  '30/60/90-day growth plans are evidence-based execution hypotheses and should be adjusted using actual performance, customer feedback, available resources, and business constraints.',
  'Priority scores represent strategic sequencing, not expected financial impact.',
];

const PHASE_THEME: Record<GrowthPlanPhase, { theme: string; objective: string }> = {
  days_1_30: { theme: 'Foundation + Validation', objective: 'Resolve critical evidence gaps and validate the core strategy before scaling execution.' },
  days_31_60: { theme: 'Launch + Learn', objective: 'Execute the strategies already supported by evidence and learn from early signals.' },
  days_61_90: { theme: 'Optimize + Scale', objective: 'Expand directions that demonstrate stronger validated performance and prepare data-informed strategy adjustments.' },
};

// Domain-informed urgency weight per initiative type — foundation/validation
// work that unblocks later execution is weighted higher than scale/optimize
// work, independent of any single upstream priority score.
const URGENCY_BY_TYPE: Record<GrowthInitiativeType, number> = {
  foundation: 85,
  validation: 82,
  audience: 85,
  proof: 85,
  conversion: 80,
  measurement: 55,
  messaging: 70,
  content: 60,
  seo: 60,
  acquisition: 55,
  activation: 55,
  optimization: 40,
};

interface RawInitiative {
  phase: GrowthPlanPhase;
  type: GrowthInitiativeType;
  title: string;
  objective: string;
  relatedObjectives: GrowthObjective[];
  relatedChannelIds: string[];
  relatedContentPillarIds: string[];
  relatedAcquisitionMotionIds: string[];
  relatedConversionActionIds: string[];
  audienceSegmentIds: string[];
  funnelStages: string[];
  supportingSignals: StrategySignal[];
  actions: string[];
  expectedLearning: string[];
  dependsOn: string[]; // raw initiative titles, resolved to phase-tagged strings after generation
  successSignals: string[];
  reasons: string[];
  confidenceInputs: number[];
}

interface Context {
  byCategory: Map<string, StrategySignal[]>;
  objectives: GrowthObjective[];
  channels: GrowthChannelFitResult;
  funnel: FunnelStrategyResult;
  messaging: MessagingStrategyResult;
  contentStrategy: ContentStrategyResult;
  acquisitionStrategy: AcquisitionStrategyResult;
  conversionStrategy: ConversionStrategyResult;
  motionByType: Map<AcquisitionMotionType, AcquisitionMotion>;
}

export interface GrowthPlanInput {
  signals: StrategySignalResult;
  objectives: GrowthObjectiveResult;
  channels: GrowthChannelFitResult;
  funnel: FunnelStrategyResult;
  messaging: MessagingStrategyResult;
  contentStrategy: ContentStrategyResult;
  acquisitionStrategy: AcquisitionStrategyResult;
  conversionStrategy: ConversionStrategyResult;
}

@Injectable()
export class GrowthPlanService {
  constructor(private readonly configService: ConfigService) {}

  build(input: GrowthPlanInput): GrowthPlanResult {
    const ctx = this.buildContext(input);

    const raw = [
      ...this.phase1Initiatives(ctx),
      ...this.phase2Initiatives(ctx),
      ...this.phase3Initiatives(ctx),
    ];

    const firedTitles = new Set(raw.map((r) => r.title));
    const initiatives = raw.map((r, i) => this.finalizeInitiative(r, i, firedTitles));

    const maxPerPhase = this.getMaxInitiativesPerPhase();
    const boundedByPhase = new Map<GrowthPlanPhase, GrowthInitiative[]>();
    for (const phase of ['days_1_30', 'days_31_60', 'days_61_90'] as GrowthPlanPhase[]) {
      const phaseInitiatives = initiatives
        .filter((i) => i.phase === phase)
        .sort((a, b) => b.priorityScore - a.priorityScore || a.id.localeCompare(b.id))
        .slice(0, maxPerPhase);
      boundedByPhase.set(phase, phaseInitiatives);
    }
    const finalInitiatives = ([] as GrowthInitiative[]).concat(...boundedByPhase.values());

    const milestones = this.buildMilestones(boundedByPhase);
    const phases = this.buildPhaseSummaries(boundedByPhase, milestones);

    const topPriorityInitiativeIds = [...finalInitiatives]
      .sort((a, b) => b.priorityScore - a.priorityScore || a.id.localeCompare(b.id))
      .slice(0, this.getMaxTopPriorities())
      .map((i) => i.id);

    const missingEvidence: string[] = [];
    if (!finalInitiatives.some((i) => i.type === 'activation')) {
      missingEvidence.push('No activation/product-led evidence was found; no activation initiative was planned.');
    }
    missingEvidence.push('No retention evidence was found; no retention initiative was planned.');

    const confidenceScore = finalInitiatives.length
      ? Math.round(this.mean(finalInitiatives.map((i) => i.confidenceScore)))
      : 0;

    return {
      phases,
      initiatives: finalInitiatives,
      milestones,
      topPriorityInitiativeIds,
      confidenceScore,
      missingEvidence,
      warnings: [...DISCLAIMERS],
      generatedAt: new Date(),
    };
  }

  // ---------------------------------------------------------------------
  // Context
  // ---------------------------------------------------------------------

  private buildContext(input: GrowthPlanInput): Context {
    const byCategory = new Map<string, StrategySignal[]>();
    for (const s of input.signals.signals) {
      const list = byCategory.get(s.category) ?? [];
      list.push(s);
      byCategory.set(s.category, list);
    }
    return {
      byCategory,
      objectives: input.objectives.objectives,
      channels: input.channels,
      funnel: input.funnel,
      messaging: input.messaging,
      contentStrategy: input.contentStrategy,
      acquisitionStrategy: input.acquisitionStrategy,
      conversionStrategy: input.conversionStrategy,
      motionByType: new Map(input.acquisitionStrategy.motions.map((m) => [m.type, m])),
    };
  }

  private find(ctx: Context, category: string, title: string): StrategySignal | undefined {
    return (ctx.byCategory.get(category) ?? []).find((s) => s.title === title);
  }

  private hasFriction(ctx: Context, type: string): boolean {
    return ctx.conversionStrategy.frictions.some((f) => f.type === type);
  }

  // ---------------------------------------------------------------------
  // Phase 1 — Foundation + Validation
  // ---------------------------------------------------------------------

  private phase1Initiatives(ctx: Context): RawInitiative[] {
    const out: RawInitiative[] = [];

    const audienceSignal = this.find(ctx, 'audience', 'Primary Audience') ?? this.find(ctx, 'audience', 'Ideal Customer Profile');
    const hasAnyBaselineContext = ctx.funnel.stages.length > 0 || ctx.objectives.length > 0 || ctx.byCategory.size > 0;
    if (!audienceSignal && hasAnyBaselineContext) {
      out.push({
        phase: 'days_1_30',
        type: 'audience',
        title: 'Clarify Primary Audience / ICP',
        objective: 'Establish a clear primary audience or ideal-customer-profile hypothesis before targeted execution.',
        relatedObjectives: [],
        relatedChannelIds: [],
        relatedContentPillarIds: [],
        relatedAcquisitionMotionIds: [],
        relatedConversionActionIds: [],
        audienceSegmentIds: [],
        funnelStages: [],
        supportingSignals: [],
        actions: ['Review existing audience/product evidence for a clearer primary-audience signal', 'Validate the strongest audience hypothesis with direct customer input'],
        expectedLearning: ['Whether a single primary audience segment can be confidently identified'],
        dependsOn: [],
        successSignals: ['Audience response', 'Qualitative validation feedback'],
        reasons: ['No clear primary audience or ICP evidence was found upstream.'],
        confidenceInputs: [40],
      });
    }

    const messagingPillar = ctx.messaging.pillars[0];
    const unclearValue = this.hasFriction(ctx, 'unclear_value');
    const weakDifferentiation = this.hasFriction(ctx, 'weak_differentiation');
    if (messagingPillar || unclearValue || weakDifferentiation) {
      out.push({
        phase: 'days_1_30',
        type: 'messaging',
        title: 'Validate Core Positioning / Messaging Pillar',
        objective: messagingPillar
          ? `Validate that the "${messagingPillar.title}" messaging pillar resonates with the target audience.`
          : 'Validate a clear core value proposition before scaling consideration-stage content.',
        relatedObjectives: ctx.objectives.filter((o) => o.type === 'consideration' || o.type === 'positioning'),
        relatedChannelIds: [],
        relatedContentPillarIds: [],
        relatedAcquisitionMotionIds: [],
        relatedConversionActionIds: [],
        audienceSegmentIds: messagingPillar?.targetAudienceSegmentIds ?? [],
        funnelStages: ['consideration'],
        supportingSignals: [],
        actions: ['Test the core messaging pillar with the target audience', 'Clarify the value proposition where evidence is weak'],
        expectedLearning: ['Whether the primary audience responds to the current positioning'],
        dependsOn: [],
        successSignals: ['Audience response', 'Engagement'],
        reasons: unclearValue || weakDifferentiation ? ['Unclear value or weak differentiation evidence was found in conversion-strategy frictions.'] : ['A messaging pillar exists and should be validated before scaling.'],
        confidenceInputs: messagingPillar ? [messagingPillar.confidenceScore] : [45],
      });
    }

    if (this.hasFriction(ctx, 'insufficient_proof')) {
      out.push({
        phase: 'days_1_30',
        type: 'proof',
        title: 'Collect and Validate Customer Proof',
        objective: 'Collect and validate real customer proof before relying on it in buyer-facing conversion messaging.',
        relatedObjectives: ctx.objectives.filter((o) => o.type === 'buyer_enablement' || o.type === 'lead_generation'),
        relatedChannelIds: [],
        relatedContentPillarIds: [],
        relatedAcquisitionMotionIds: [],
        relatedConversionActionIds: ctx.conversionStrategy.actions.filter((a) => a.type === 'demo' || a.type === 'contact').map((a) => a.id),
        audienceSegmentIds: [],
        funnelStages: ['conversion'],
        supportingSignals: [],
        actions: ['Identify early customers/users who can provide real feedback or results', 'Validate and document real proof before using it in messaging'],
        expectedLearning: ['Whether real customer proof exists and how it should be positioned'],
        dependsOn: [],
        successSignals: ['Proof collected', 'Evaluation confidence'],
        reasons: ['No customer proof/case-study evidence is currently available.'],
        confidenceInputs: [50],
      });
    }

    if (this.hasFriction(ctx, 'pricing_uncertainty') || this.hasFriction(ctx, 'action_uncertainty')) {
      out.push({
        phase: 'days_1_30',
        type: 'conversion',
        title: 'Resolve Pricing and Conversion-Action Clarity',
        objective: 'Clarify pricing/packaging and the exact conversion action before scaling paid or buyer-focused acquisition.',
        relatedObjectives: ctx.objectives.filter((o) => o.type === 'conversion' || o.type === 'lead_generation'),
        relatedChannelIds: [],
        relatedContentPillarIds: [],
        relatedAcquisitionMotionIds: [],
        relatedConversionActionIds: ctx.conversionStrategy.actions.map((a) => a.id),
        audienceSegmentIds: [],
        funnelStages: ['conversion'],
        supportingSignals: [],
        actions: ['Clarify pricing/packaging information', 'Confirm the exact supported conversion action (signup, demo, contact, etc.)'],
        expectedLearning: ['Whether pricing clarity reduces conversion-stage friction'],
        dependsOn: [],
        successSignals: ['CTA completion', 'Conversion-path clarity'],
        reasons: ['Pricing or conversion-action uncertainty was found in conversion-strategy frictions.'],
        confidenceInputs: [50],
      });
    }

    const contentPillar = ctx.contentStrategy.pillars[0];
    if (contentPillar) {
      out.push({
        phase: 'days_1_30',
        type: 'content',
        title: `Establish Priority Content Foundation`,
        objective: `Establish a foundation for the "${contentPillar.title}" content pillar before broader distribution.`,
        relatedObjectives: [],
        relatedChannelIds: [],
        relatedContentPillarIds: [contentPillar.id],
        relatedAcquisitionMotionIds: [],
        relatedConversionActionIds: [],
        audienceSegmentIds: contentPillar.targetAudienceSegmentIds,
        funnelStages: contentPillar.relatedFunnelStages,
        supportingSignals: [],
        actions: ['Outline the priority content pillar structure', 'Prepare initial supporting assets for the strongest topic directions'],
        expectedLearning: ['Whether priority content themes generate meaningful engagement once launched'],
        dependsOn: [],
        successSignals: ['Content readiness', 'Engagement'],
        reasons: [`A strong content pillar ("${contentPillar.title}") exists and should be prepared before launch.`],
        confidenceInputs: [contentPillar.confidenceScore],
      });
    }

    if (ctx.funnel.stages.length > 0) {
      out.push({
        phase: 'days_1_30',
        type: 'measurement',
        title: 'Prepare Measurement Requirements',
        objective: 'Prepare measurement requirements for the funnel stages and success signals the strategy depends on.',
        relatedObjectives: [],
        relatedChannelIds: [],
        relatedContentPillarIds: [],
        relatedAcquisitionMotionIds: [],
        relatedConversionActionIds: [],
        audienceSegmentIds: [],
        funnelStages: ctx.funnel.stages.map((s) => s.stage),
        supportingSignals: [],
        actions: ['Define what qualified traffic/engagement/conversion look like for this product', 'Confirm measurement is in place before execution begins'],
        expectedLearning: ['Whether current measurement can capture the success signals this plan depends on'],
        dependsOn: [],
        successSignals: ['Measurement readiness'],
        reasons: ['Funnel-stage evidence exists and requires measurement readiness before execution.'],
        confidenceInputs: [55],
      });
    }

    return out;
  }

  // ---------------------------------------------------------------------
  // Phase 2 — Launch + Learn
  // ---------------------------------------------------------------------

  private phase2Initiatives(ctx: Context): RawInitiative[] {
    const out: RawInitiative[] = [];
    const organicSearch = ctx.motionByType.get('organic_search');
    const contentFoundationExists = ctx.contentStrategy.pillars.length > 0;
    const messagingValidationExists = ctx.messaging.pillars.length > 0 || this.hasFriction(ctx, 'unclear_value') || this.hasFriction(ctx, 'weak_differentiation');

    if (organicSearch) {
      const deps: string[] = [];
      if (contentFoundationExists) deps.push('Establish Priority Content Foundation');
      if (messagingValidationExists) deps.push('Validate Core Positioning / Messaging Pillar');
      out.push({
        phase: 'days_31_60',
        type: 'seo',
        title: 'Launch Organic Search Acquisition Foundation',
        objective: 'Launch the strongest organic-search acquisition motion using validated content and messaging.',
        relatedObjectives: ctx.objectives.filter((o) => ['awareness', 'consideration', 'education'].includes(o.type)),
        relatedChannelIds: organicSearch.relatedChannels,
        relatedContentPillarIds: organicSearch.relatedContentPillarIds,
        relatedAcquisitionMotionIds: [organicSearch.id],
        relatedConversionActionIds: [],
        audienceSegmentIds: organicSearch.targetAudienceSegmentIds,
        funnelStages: organicSearch.relatedFunnelStages,
        supportingSignals: [],
        actions: organicSearch.recommendedActions,
        expectedLearning: ['Whether commercial/informational search intent leads to qualified product exploration'],
        dependsOn: deps,
        successSignals: ['Qualified traffic', 'Search visibility'],
        reasons: ['A strong organic-search acquisition motion is supported by current evidence.'],
        confidenceInputs: [organicSearch.confidenceScore],
      });
    }

    const topicDirection = ctx.contentStrategy.topicDirections[0];
    if (topicDirection) {
      out.push({
        phase: 'days_31_60',
        type: 'content',
        title: 'Launch Validated High-Priority Topic Coverage',
        objective: `Launch supporting content for the "${topicDirection.title}" topic direction.`,
        relatedObjectives: [],
        relatedChannelIds: [],
        relatedContentPillarIds: [topicDirection.contentPillarId],
        relatedAcquisitionMotionIds: [],
        relatedConversionActionIds: [],
        audienceSegmentIds: topicDirection.audienceSegmentIds,
        funnelStages: [topicDirection.funnelStage],
        supportingSignals: [],
        actions: ['Produce content for the highest-priority topic direction(s)', 'Distribute across supported owned/organic channels'],
        expectedLearning: ['Whether priority topic content generates engagement and progression toward consideration'],
        dependsOn: contentFoundationExists ? ['Establish Priority Content Foundation'] : [],
        successSignals: ['Engagement', 'Funnel progression'],
        reasons: [`A validated topic direction ("${topicDirection.title}") is ready for launch.`],
        confidenceInputs: [topicDirection.confidenceScore],
      });
    }

    for (const type of ['content_distribution', 'organic_social', 'community'] as AcquisitionMotionType[]) {
      const motion = ctx.motionByType.get(type);
      if (!motion) continue;
      out.push({
        phase: 'days_31_60',
        type: 'acquisition',
        title: `Activate ${this.labelize(type)} Distribution`,
        objective: `Activate the supported ${this.labelize(type)} acquisition motion for initial validation.`,
        relatedObjectives: [],
        relatedChannelIds: motion.relatedChannels,
        relatedContentPillarIds: motion.relatedContentPillarIds,
        relatedAcquisitionMotionIds: [motion.id],
        relatedConversionActionIds: [],
        audienceSegmentIds: motion.targetAudienceSegmentIds,
        funnelStages: motion.relatedFunnelStages,
        supportingSignals: [],
        actions: motion.recommendedActions,
        expectedLearning: [`Whether ${this.labelize(type)} distribution produces meaningful audience response`],
        dependsOn: [],
        successSignals: ['Audience response', 'Engagement'],
        reasons: [`The ${this.labelize(type)} acquisition motion is supported by current evidence.`],
        confidenceInputs: [motion.confidenceScore],
      });
    }

    const outbound = ctx.motionByType.get('outbound');
    const proofExists = this.hasFriction(ctx, 'insufficient_proof'); // proof-collection initiative always exists when this is true
    if (outbound) {
      const deps: string[] = [];
      if (proofExists) deps.push('Collect and Validate Customer Proof');
      if (messagingValidationExists) deps.push('Validate Core Positioning / Messaging Pillar');
      out.push({
        phase: 'days_31_60',
        type: 'acquisition',
        title: 'Test Supported B2B Acquisition Path',
        objective: 'Test the supported outbound B2B acquisition path with a small, validated audience.',
        relatedObjectives: ctx.objectives.filter((o) => o.type === 'lead_generation' || o.type === 'buyer_enablement'),
        relatedChannelIds: outbound.relatedChannels,
        relatedContentPillarIds: outbound.relatedContentPillarIds,
        relatedAcquisitionMotionIds: [outbound.id],
        relatedConversionActionIds: ctx.conversionStrategy.actions.filter((a) => a.type === 'demo' || a.type === 'contact' || a.type === 'lead_capture').map((a) => a.id),
        audienceSegmentIds: outbound.targetAudienceSegmentIds,
        funnelStages: outbound.relatedFunnelStages,
        supportingSignals: [],
        actions: outbound.recommendedActions,
        expectedLearning: ['Whether buyer proof and messaging reduce evaluation uncertainty in outbound conversations'],
        dependsOn: deps,
        successSignals: ['Lead generation', 'Qualified conversations'],
        reasons: ['B2B ICP and buyer-role evidence support a small outbound test.'],
        confidenceInputs: [outbound.confidenceScore],
      });
    }

    for (const type of ['paid_search', 'paid_social'] as AcquisitionMotionType[]) {
      const motion = ctx.motionByType.get(type);
      if (!motion) continue;
      const pricingUncertain = this.hasFriction(ctx, 'pricing_uncertainty') || this.hasFriction(ctx, 'action_uncertainty');
      const deps: string[] = [];
      if (pricingUncertain) deps.push('Resolve Pricing and Conversion-Action Clarity');
      out.push({
        phase: 'days_31_60',
        type: 'acquisition',
        title: `Test Supported ${this.labelize(type)} Path`,
        objective: `Test the supported ${this.labelize(type)} acquisition path with a clear conversion direction.`,
        relatedObjectives: ctx.objectives.filter((o) => o.type === 'conversion' || o.type === 'lead_generation'),
        relatedChannelIds: motion.relatedChannels,
        relatedContentPillarIds: motion.relatedContentPillarIds,
        relatedAcquisitionMotionIds: [motion.id],
        relatedConversionActionIds: ctx.conversionStrategy.actions.map((a) => a.id),
        audienceSegmentIds: motion.targetAudienceSegmentIds,
        funnelStages: motion.relatedFunnelStages,
        supportingSignals: [],
        actions: motion.recommendedActions,
        expectedLearning: [`Whether ${this.labelize(type)} traffic converts toward the supported conversion action`],
        dependsOn: deps,
        successSignals: ['CTA completion', 'Lead generation'],
        reasons: [`The ${this.labelize(type)} acquisition motion is supported by current evidence.`],
        confidenceInputs: [motion.confidenceScore],
      });
    }

    if (ctx.conversionStrategy.actions.length > 0 || ctx.conversionStrategy.paths.length > 0) {
      out.push({
        phase: 'days_31_60',
        type: 'conversion',
        title: 'Improve Consideration/Conversion Journey',
        objective: 'Implement the supported conversion path, proof, and CTA direction across consideration and conversion stages.',
        relatedObjectives: ctx.objectives.filter((o) => o.type === 'conversion' || o.type === 'consideration'),
        relatedChannelIds: [],
        relatedContentPillarIds: [],
        relatedAcquisitionMotionIds: [],
        relatedConversionActionIds: ctx.conversionStrategy.actions.map((a) => a.id),
        audienceSegmentIds: [],
        funnelStages: ['consideration', 'conversion'],
        supportingSignals: [],
        actions: ['Implement the supported conversion action(s) with proof/FAQ support', 'Reduce friction identified in conversion-strategy hypotheses'],
        expectedLearning: ['Whether the supported conversion path improves progression from consideration to conversion'],
        dependsOn: [],
        successSignals: ['CTA completion', 'Funnel progression'],
        reasons: ['Supported conversion actions/paths exist and are ready for implementation.'],
        confidenceInputs: [ctx.conversionStrategy.confidenceScore],
      });
    }

    if (ctx.conversionStrategy.proofNeeds.length > 0) {
      out.push({
        phase: 'days_31_60',
        type: 'proof',
        title: 'Implement Proof / FAQ / Evaluation Support',
        objective: 'Implement the specific proof and evaluation-support materials identified by the conversion strategy.',
        relatedObjectives: [],
        relatedChannelIds: [],
        relatedContentPillarIds: [],
        relatedAcquisitionMotionIds: [],
        relatedConversionActionIds: [],
        audienceSegmentIds: [],
        funnelStages: ['consideration', 'conversion'],
        supportingSignals: [],
        actions: ctx.conversionStrategy.proofNeeds.flatMap((p) => p.recommendedProofDirection).slice(0, 5),
        expectedLearning: ['Whether the added proof/evaluation support reduces evaluation uncertainty'],
        dependsOn: [],
        successSignals: ['Evaluation confidence', 'Funnel progression'],
        reasons: ['Specific proof needs were identified by the conversion strategy.'],
        confidenceInputs: [this.mean(ctx.conversionStrategy.proofNeeds.map((p) => p.confidenceScore))],
      });
    }

    const activationAction = ctx.conversionStrategy.actions.find((a) => a.type === 'activation');
    const productLed = ctx.motionByType.get('product_led');
    if (activationAction || productLed) {
      out.push({
        phase: 'days_31_60',
        type: 'activation',
        title: 'Activate In-Product First-Value Path',
        objective: 'Activate the supported onboarding/first-value path for new users.',
        relatedObjectives: ctx.objectives.filter((o) => o.type === 'activation'),
        relatedChannelIds: productLed?.relatedChannels ?? [],
        relatedContentPillarIds: productLed?.relatedContentPillarIds ?? [],
        relatedAcquisitionMotionIds: productLed ? [productLed.id] : [],
        relatedConversionActionIds: activationAction ? [activationAction.id] : [],
        audienceSegmentIds: activationAction?.targetAudienceSegmentIds ?? [],
        funnelStages: ['activation'],
        supportingSignals: [],
        actions: ['Implement onboarding/first-value guidance', 'Reduce friction in the initial product experience'],
        expectedLearning: ['Whether new users reach first value with the supported onboarding path'],
        dependsOn: [],
        successSignals: ['Activation', 'Product exploration'],
        reasons: ['Activation/product-led evidence supports launching an onboarding path.'],
        confidenceInputs: [activationAction?.confidenceScore ?? productLed?.confidenceScore ?? 50],
      });
    }

    if (ctx.funnel.stages.length > 0) {
      out.push({
        phase: 'days_31_60',
        type: 'measurement',
        title: 'Measure Early Engagement and Conversion Signals',
        objective: 'Measure early engagement, funnel-progression, and conversion signals from phase-2 execution.',
        relatedObjectives: [],
        relatedChannelIds: [],
        relatedContentPillarIds: [],
        relatedAcquisitionMotionIds: [],
        relatedConversionActionIds: [],
        audienceSegmentIds: [],
        funnelStages: ctx.funnel.stages.map((s) => s.stage),
        supportingSignals: [],
        actions: ['Track qualified traffic, engagement, and CTA completion for launched initiatives', 'Review early signals before scaling further'],
        expectedLearning: ['Which launched directions show early validated engagement'],
        dependsOn: ['Prepare Measurement Requirements'],
        successSignals: ['Qualified traffic', 'Engagement', 'CTA completion'],
        reasons: ['Phase-2 execution requires early measurement before scaling.'],
        confidenceInputs: [55],
      });
    }

    return out;
  }

  // ---------------------------------------------------------------------
  // Phase 3 — Optimize + Scale
  // ---------------------------------------------------------------------

  private phase3Initiatives(ctx: Context): RawInitiative[] {
    const out: RawInitiative[] = [];
    const hasAnyExecution = ctx.acquisitionStrategy.motions.length > 0 || ctx.contentStrategy.pillars.length > 0 || ctx.conversionStrategy.actions.length > 0;
    if (!hasAnyExecution) return out;

    if (ctx.contentStrategy.pillars.length > 0) {
      out.push({
        phase: 'days_61_90',
        type: 'content',
        title: 'Expand Content Directions That Demonstrate Stronger Validated Performance',
        objective: 'Expand the content directions that demonstrate stronger validated performance, based on phase-2 learnings.',
        relatedObjectives: [],
        relatedChannelIds: [],
        relatedContentPillarIds: ctx.contentStrategy.pillars.map((p) => p.id),
        relatedAcquisitionMotionIds: [],
        relatedConversionActionIds: [],
        audienceSegmentIds: [],
        funnelStages: [],
        supportingSignals: [],
        actions: ['Broaden coverage for content directions that show stronger validated engagement', 'Retire or revise directions that underperform'],
        expectedLearning: ['Which content pillars are worth expanding versus revising'],
        dependsOn: ['Launch Validated High-Priority Topic Coverage'],
        successSignals: ['Engagement', 'Funnel progression'],
        reasons: ['Content pillars exist and phase-2 launch provides a basis for expansion.'],
        confidenceInputs: [this.mean(ctx.contentStrategy.pillars.map((p) => p.confidenceScore))],
      });
    }

    const organicSearch = ctx.motionByType.get('organic_search');
    if (organicSearch) {
      out.push({
        phase: 'days_61_90',
        type: 'seo',
        title: 'Expand SEO Directions That Demonstrate Stronger Validated Performance',
        objective: 'Broaden validated keyword/topic coverage for the organic-search motion.',
        relatedObjectives: [],
        relatedChannelIds: organicSearch.relatedChannels,
        relatedContentPillarIds: organicSearch.relatedContentPillarIds,
        relatedAcquisitionMotionIds: [organicSearch.id],
        relatedConversionActionIds: [],
        audienceSegmentIds: organicSearch.targetAudienceSegmentIds,
        funnelStages: organicSearch.relatedFunnelStages,
        supportingSignals: [],
        actions: ['Broaden keyword/topic coverage in directions with stronger validated performance'],
        expectedLearning: ['Which keyword/topic themes are worth broader investment'],
        dependsOn: ['Launch Organic Search Acquisition Foundation'],
        successSignals: ['Qualified traffic', 'Search visibility'],
        reasons: ['The organic-search motion was launched in phase 2 and can now be expanded.'],
        confidenceInputs: [organicSearch.confidenceScore],
      });
    }

    const otherMotions = ctx.acquisitionStrategy.motions.filter((m) => m.type !== 'organic_search');
    if (otherMotions.length > 0) {
      out.push({
        phase: 'days_61_90',
        type: 'acquisition',
        title: 'Scale Acquisition Paths That Demonstrate Stronger Validated Performance',
        objective: 'Scale the acquisition paths that demonstrate stronger validated performance from phase-2 testing.',
        relatedObjectives: [],
        relatedChannelIds: this.dedupe(otherMotions.flatMap((m) => m.relatedChannels)),
        relatedContentPillarIds: [],
        relatedAcquisitionMotionIds: otherMotions.map((m) => m.id),
        relatedConversionActionIds: [],
        audienceSegmentIds: this.dedupe(otherMotions.flatMap((m) => m.targetAudienceSegmentIds)),
        funnelStages: [],
        supportingSignals: [],
        actions: ['Expand investment in acquisition paths with stronger validated performance', 'Pause or revise paths with weak validated performance'],
        expectedLearning: ['Which acquisition motions are worth scaling versus revising'],
        dependsOn: [],
        successSignals: ['Qualified traffic', 'Lead generation', 'Audience response'],
        reasons: ['Multiple acquisition motions were tested in phase 2 and can now be evaluated for scale.'],
        confidenceInputs: [this.mean(otherMotions.map((m) => m.confidenceScore))],
      });
    }

    if (ctx.conversionStrategy.actions.length > 0 || ctx.conversionStrategy.frictions.length > 0) {
      out.push({
        phase: 'days_61_90',
        type: 'optimization',
        title: 'Deepen Conversion Optimization',
        objective: 'Deepen conversion optimization using validated learnings from phase-2 execution.',
        relatedObjectives: [],
        relatedChannelIds: [],
        relatedContentPillarIds: [],
        relatedAcquisitionMotionIds: [],
        relatedConversionActionIds: ctx.conversionStrategy.actions.map((a) => a.id),
        audienceSegmentIds: [],
        funnelStages: ['conversion'],
        supportingSignals: [],
        actions: ['Resolve remaining conversion-friction hypotheses using observed behavior', 'Refine the supported conversion action based on validated learnings'],
        expectedLearning: ['Which friction hypotheses were validated and which proof reduced them'],
        dependsOn: ['Improve Consideration/Conversion Journey'],
        successSignals: ['CTA completion', 'Funnel progression'],
        reasons: ['Conversion actions/frictions exist and phase-2 execution provides a basis for optimization.'],
        confidenceInputs: [ctx.conversionStrategy.confidenceScore],
      });
    }

    if (ctx.messaging.pillars.length > 0) {
      out.push({
        phase: 'days_61_90',
        type: 'optimization',
        title: 'Refine Messaging Using Observed Performance',
        objective: 'Refine messaging pillars using observed engagement and conversion signals from phases 1–2.',
        relatedObjectives: [],
        relatedChannelIds: [],
        relatedContentPillarIds: [],
        relatedAcquisitionMotionIds: [],
        relatedConversionActionIds: [],
        audienceSegmentIds: this.dedupe(ctx.messaging.pillars.flatMap((p) => p.targetAudienceSegmentIds)),
        funnelStages: [],
        supportingSignals: [],
        actions: ['Refine messaging pillars that show weaker validated resonance', 'Prepare strategy adjustments from real usage and conversion data'],
        expectedLearning: ['Which messaging directions resonate most with the validated audience'],
        dependsOn: ['Validate Core Positioning / Messaging Pillar'],
        successSignals: ['Audience response', 'Funnel progression'],
        reasons: ['Messaging pillars exist and phase-1/2 execution provides a basis for refinement.'],
        confidenceInputs: [this.mean(ctx.messaging.pillars.map((p) => p.confidenceScore))],
      });
    }

    return out;
  }

  // ---------------------------------------------------------------------
  // Finalization / scoring
  // ---------------------------------------------------------------------

  private finalizeInitiative(raw: RawInitiative, index: number, firedTitles: Set<string>): GrowthInitiative {
    const urgency = URGENCY_BY_TYPE[raw.type];

    const dims: { weight: number; value: number }[] = [{ weight: 0.25, value: urgency }];
    if (raw.relatedObjectives.length > 0) dims.push({ weight: 0.25, value: this.mean(raw.relatedObjectives.map((o) => o.priorityScore)) });
    else dims.push({ weight: 0.25, value: urgency });
    if (raw.confidenceInputs.length > 0) dims.push({ weight: 0.2, value: this.mean(raw.confidenceInputs) });
    if (raw.audienceSegmentIds.length > 0 || raw.funnelStages.length > 0) dims.push({ weight: 0.15, value: this.mean(raw.confidenceInputs) || 50 });
    if (raw.supportingSignals.length > 0) dims.push({ weight: 0.15, value: this.mean(raw.supportingSignals.map((s) => s.strengthScore)) });
    const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0);
    const priorityScore = this.clamp(Math.round(dims.reduce((sum, d) => sum + d.weight * d.value, 0) / totalWeight), 0, 100);

    const confidenceScore = this.clamp(
      Math.round((raw.confidenceInputs.length ? this.mean(raw.confidenceInputs) : 50) * 0.7 + Math.min(30, (raw.relatedObjectives.length + raw.supportingSignals.length + (raw.dependsOn.length ? 1 : 0)) * 8)),
      0,
      100,
    );

    const resolvedDependencies = raw.dependsOn.filter((d) => firedTitles.has(d)).map((d) => `Depends on: ${d}`);

    return {
      id: `initiative-${index + 1}-${raw.type}`,
      phase: raw.phase,
      type: raw.type,
      title: raw.title,
      objective: raw.objective,
      priorityScore,
      confidenceScore,
      relatedObjectiveIds: this.dedupe(raw.relatedObjectives.map((o) => o.id)),
      relatedChannelIds: this.dedupe(raw.relatedChannelIds),
      relatedContentPillarIds: this.dedupe(raw.relatedContentPillarIds),
      relatedAcquisitionMotionIds: this.dedupe(raw.relatedAcquisitionMotionIds),
      relatedConversionActionIds: this.dedupe(raw.relatedConversionActionIds),
      audienceSegmentIds: this.dedupe(raw.audienceSegmentIds),
      funnelStages: this.dedupe(raw.funnelStages),
      actions: raw.actions.slice(0, this.getMaxActionsPerInitiative()),
      expectedLearning: raw.expectedLearning,
      dependencies: resolvedDependencies,
      successSignals: this.dedupe(raw.successSignals),
      reasons: raw.reasons,
      warnings: [],
    };
  }

  // ---------------------------------------------------------------------
  // Milestones / phase summaries
  // ---------------------------------------------------------------------

  private buildMilestones(byPhase: Map<GrowthPlanPhase, GrowthInitiative[]>): GrowthPlanMilestone[] {
    const templates: Record<GrowthPlanPhase, { title: string; outcome: string; signals: string[] }> = {
      days_1_30: {
        title: 'Target Milestone: Strategy Foundation Ready for Execution',
        outcome: 'Foundation gaps addressed and validated positioning ready to support execution.',
        signals: ['Audience/ICP clarity confirmed', 'Core messaging validated', 'Conversion path clarified'],
      },
      days_31_60: {
        title: 'Target Milestone: Primary Acquisition Paths Launched for Validation',
        outcome: 'Supported acquisition and content paths launched and generating early signal.',
        signals: ['Qualified traffic observed', 'Early engagement observed', 'Early conversion signals observed'],
      },
      days_61_90: {
        title: 'Target Milestone: Validated Growth Directions Ready for Optimization',
        outcome: 'Directions with stronger validated performance identified and ready for continued investment.',
        signals: ['Validated performance differences observed', 'Optimization priorities identified'],
      },
    };

    const milestones: GrowthPlanMilestone[] = [];
    for (const phase of ['days_1_30', 'days_31_60', 'days_61_90'] as GrowthPlanPhase[]) {
      const initiatives = byPhase.get(phase) ?? [];
      if (initiatives.length === 0) continue;
      const template = templates[phase];
      milestones.push({
        id: `milestone-${phase}`,
        phase,
        title: template.title,
        initiativeIds: initiatives.slice(0, this.getMaxMilestonesPerPhase() * 3).map((i) => i.id),
        outcomeDirection: template.outcome,
        validationSignals: template.signals,
        confidenceScore: Math.round(this.mean(initiatives.map((i) => i.confidenceScore))),
      });
    }
    return milestones;
  }

  private buildPhaseSummaries(byPhase: Map<GrowthPlanPhase, GrowthInitiative[]>, milestones: GrowthPlanMilestone[]): GrowthPlanPhaseSummary[] {
    return (['days_1_30', 'days_31_60', 'days_61_90'] as GrowthPlanPhase[]).map((phase) => {
      const initiatives = byPhase.get(phase) ?? [];
      const phaseMilestones = milestones.filter((m) => m.phase === phase);
      return {
        phase,
        theme: PHASE_THEME[phase].theme,
        objective: PHASE_THEME[phase].objective,
        initiativeIds: initiatives.map((i) => i.id),
        milestoneIds: phaseMilestones.map((m) => m.id),
        confidenceScore: initiatives.length ? Math.round(this.mean(initiatives.map((i) => i.confidenceScore))) : 0,
      };
    });
  }

  // ---------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------

  private labelize(value: string): string {
    return value.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

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

  private getMaxInitiativesPerPhase(): number {
    return this.getEnvNumber('GROWTH_PLAN_MAX_INITIATIVES_PER_PHASE', DEFAULT_MAX_INITIATIVES_PER_PHASE);
  }

  private getMaxTopPriorities(): number {
    return this.getEnvNumber('GROWTH_PLAN_MAX_TOP_PRIORITIES', DEFAULT_MAX_TOP_PRIORITIES);
  }

  private getMaxActionsPerInitiative(): number {
    return this.getEnvNumber('GROWTH_PLAN_MAX_ACTIONS_PER_INITIATIVE', DEFAULT_MAX_ACTIONS_PER_INITIATIVE);
  }

  private getMaxMilestonesPerPhase(): number {
    return this.getEnvNumber('GROWTH_PLAN_MAX_MILESTONES_PER_PHASE', DEFAULT_MAX_MILESTONES_PER_PHASE);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
