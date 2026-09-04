import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AcquisitionPath, AcquisitionStrategyResult } from './types/acquisition-strategy.types';
import type { ContentStrategyResult } from './types/content-strategy.types';
import type {
  ConversionAction,
  ConversionActionType,
  ConversionFriction,
  ConversionFrictionType,
  ConversionPath,
  ConversionProofNeed,
  ConversionStrategyResult,
} from './types/conversion-strategy.types';
import type { FunnelStage, FunnelStageStrategy, FunnelStrategyResult } from './types/funnel-strategy.types';
import type { GrowthChannelFitResult } from './types/growth-channel-fit.types';
import type { GrowthObjective, GrowthObjectiveResult, GrowthObjectiveType } from './types/growth-objective.types';
import type { MessagingPillar, MessagingStrategyResult } from './types/messaging-strategy.types';
import type { StrategySignal, StrategySignalResult } from './types/strategy-signal.types';

const DEFAULT_MAX_ACTIONS = 6;
const DEFAULT_MAX_FRICTIONS = 8;
const DEFAULT_MAX_PROOF_NEEDS = 8;
const DEFAULT_MAX_PATHS = 8;

const DISCLAIMER =
  'Conversion strategy items are evidence-based hypotheses and do not predict conversion-rate lift, revenue impact, or customer behavior. Friction items are hypotheses, not confirmed customer objections.';

const FRICTION_BASE_SEVERITY: Record<ConversionFrictionType, number> = {
  unclear_value: 65,
  weak_differentiation: 60,
  insufficient_proof: 70,
  pricing_uncertainty: 60,
  action_uncertainty: 55,
  buyer_risk: 65,
  implementation_uncertainty: 55,
  trust_gap: 60,
  onboarding_friction: 55,
};

interface RawAction {
  type: ConversionActionType;
  label: string;
  funnelStage: FunnelStage;
  objectives: GrowthObjective[];
  supportingSignals: StrategySignal[];
  keywordSignals: StrategySignal[];
  audienceSignal?: StrategySignal;
  reasons: string[];
}

interface RawFriction {
  type: ConversionFrictionType;
  title: string;
  hypothesis: string;
  funnelStage: FunnelStage;
  audienceSignal?: StrategySignal;
  evidence: string[];
  recommendedResponses: string[];
}

interface Context {
  byCategory: Map<string, StrategySignal[]>;
  keywordSignals: StrategySignal[];
  objectiveByType: Map<GrowthObjectiveType, GrowthObjective>;
  stagesByName: Map<FunnelStage, FunnelStageStrategy>;
  messagingByTheme: Map<string, MessagingPillar>;
  acquisitionPaths: AcquisitionPath[];
  hasProductLedMotion: boolean;
  overallConfidence: number;
}

export interface ConversionStrategyInput {
  signals: StrategySignalResult;
  objectives: GrowthObjectiveResult;
  channels: GrowthChannelFitResult;
  funnel: FunnelStrategyResult;
  messaging: MessagingStrategyResult;
  contentStrategy: ContentStrategyResult;
  acquisitionStrategy: AcquisitionStrategyResult;
}

@Injectable()
export class ConversionStrategyService {
  constructor(private readonly configService: ConfigService) {}

  build(input: ConversionStrategyInput): ConversionStrategyResult {
    const ctx = this.buildContext(input);

    const actions = this.buildActions(ctx);
    const finalActions = actions
      .sort((a, b) => b.priorityScore - a.priorityScore || b.confidenceScore - a.confidenceScore || a.id.localeCompare(b.id))
      .slice(0, this.getMaxActions());
    const primaryActionId = finalActions[0]?.id;

    const frictions = this.buildFrictions(ctx)
      .sort((a, b) => b.severityScore - a.severityScore || a.id.localeCompare(b.id))
      .slice(0, this.getMaxFrictions());

    const proofNeeds = this.buildProofNeeds(ctx, frictions)
      .sort((a, b) => b.priorityScore - a.priorityScore || a.id.localeCompare(b.id))
      .slice(0, this.getMaxProofNeeds());

    const paths = this.buildPaths(ctx, finalActions, frictions, proofNeeds);
    const primaryPathId = paths[0]?.id;

    const missingEvidence: string[] = [];
    if (!finalActions.some((a) => a.type === 'trial')) missingEvidence.push('No trial evidence was found; a trial action was not recommended.');
    if (!finalActions.some((a) => a.type === 'purchase')) missingEvidence.push('No direct purchase/e-commerce evidence was found; a purchase action was not recommended.');
    if (frictions.some((f) => f.type === 'insufficient_proof')) missingEvidence.push('Customer proof/case-study evidence is unavailable; proof needs recommend collecting real proof, not fabricating it.');

    const confidenceScores = [...finalActions.map((a) => a.confidenceScore), ...frictions.map((f) => f.confidenceScore), ...proofNeeds.map((p) => p.confidenceScore), ...paths.map((p) => p.confidenceScore)];
    const confidenceScore = confidenceScores.length ? Math.round(this.mean(confidenceScores)) : 0;

    return {
      actions: finalActions,
      frictions,
      proofNeeds,
      paths,
      primaryActionId,
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

  private buildContext(input: ConversionStrategyInput): Context {
    const byCategory = new Map<string, StrategySignal[]>();
    for (const s of input.signals.signals) {
      const list = byCategory.get(s.category) ?? [];
      list.push(s);
      byCategory.set(s.category, list);
    }
    return {
      byCategory,
      keywordSignals: byCategory.get('keyword') ?? [],
      objectiveByType: new Map(input.objectives.objectives.map((o) => [o.type, o])),
      stagesByName: new Map(input.funnel.stages.map((s) => [s.stage, s])),
      messagingByTheme: new Map(input.messaging.pillars.map((p) => [p.theme, p])),
      acquisitionPaths: input.acquisitionStrategy.paths,
      hasProductLedMotion: input.acquisitionStrategy.motions.some((m) => m.type === 'product_led'),
      overallConfidence: input.signals.confidenceScore,
    };
  }

  private find(ctx: Context, category: string, title: string): StrategySignal | undefined {
    return (ctx.byCategory.get(category) ?? []).find((s) => s.title === title);
  }

  private keywordSignalsFor(ctx: Context, pattern: RegExp): StrategySignal[] {
    return ctx.keywordSignals.filter((s) => pattern.test(s.value.toLowerCase()));
  }

  private hasAcquisitionMotion(ctx: Context, channels: string[]): boolean {
    return ctx.acquisitionPaths.some((p) => channels.includes(p.entryChannel));
  }

  /**
   * The "bottom-most" funnel stage actually returned by funnel-strategy —
   * never fabricates a stage (e.g. 'activation') that wasn't evidenced.
   * Returns undefined only if the funnel has no stages at all.
   */
  private resolveConversionStage(ctx: Context): FunnelStage | undefined {
    const preference: FunnelStage[] = ['conversion', 'activation', 'consideration', 'awareness', 'retention'];
    return preference.find((s) => ctx.stagesByName.has(s));
  }

  // ---------------------------------------------------------------------
  // Conversion actions
  // ---------------------------------------------------------------------

  private buildActions(ctx: Context): ConversionAction[] {
    const raws: RawAction[] = [];
    const conversionObjective = ctx.objectiveByType.get('conversion');
    const leadGenObjective = ctx.objectiveByType.get('lead_generation');
    const buyerEnablementObjective = ctx.objectiveByType.get('buyer_enablement');
    const activationObjective = ctx.objectiveByType.get('activation');
    const buyerSignal = this.find(ctx, 'commercial', 'Buyer Role');
    const hasConversionStage = ctx.stagesByName.has('conversion');
    // Only fall back to a stage that is actually present in the funnel —
    // never fabricate 'activation' (or any stage) that funnel-strategy
    // itself omitted for lack of evidence.
    const conversionStage = this.resolveConversionStage(ctx);

    // SIGNUP — only with actual self-service/product-led evidence.
    if (ctx.hasProductLedMotion && activationObjective && conversionStage) {
      raws.push({
        type: 'signup',
        label: 'Signup',
        funnelStage: conversionStage,
        objectives: [activationObjective],
        supportingSignals: [],
        keywordSignals: [],
        reasons: ['Product-led/self-service evidence supports a direct signup action.'],
      });
    }

    // TRIAL — only with explicit trial keyword evidence.
    const trialKeywords = this.keywordSignalsFor(ctx, /\btrial\b/);
    if (trialKeywords.length > 0 && conversionStage) {
      raws.push({
        type: 'trial',
        label: 'Trial',
        funnelStage: conversionStage,
        objectives: conversionObjective ? [conversionObjective] : [],
        supportingSignals: [],
        keywordSignals: trialKeywords,
        reasons: ['Explicit trial-intent keyword evidence supports a trial action.'],
      });
    }

    // DEMO — buyer evidence + a sales-led acquisition motion.
    if (buyerSignal && this.hasAcquisitionMotion(ctx, ['outbound', 'email']) && conversionStage) {
      raws.push({
        type: 'demo',
        label: 'Demo',
        funnelStage: conversionStage,
        objectives: leadGenObjective ? [leadGenObjective] : [],
        supportingSignals: [buyerSignal],
        keywordSignals: [],
        audienceSignal: buyerSignal,
        reasons: [`Buyer-role evidence ("${buyerSignal.value}") with sales-led acquisition support suggests a demo action.`],
      });
    }

    // LEAD_CAPTURE — lead-gen objective + buyer evidence.
    if (leadGenObjective && buyerSignal && conversionStage) {
      raws.push({
        type: 'lead_capture',
        label: 'Lead Capture',
        funnelStage: conversionStage,
        objectives: [leadGenObjective],
        supportingSignals: [buyerSignal],
        keywordSignals: [],
        audienceSignal: buyerSignal,
        reasons: [`Lead-generation objective with buyer-role evidence supports a lead-capture action.`],
      });
    }

    // PURCHASE — only with direct purchase/e-commerce evidence.
    const purchaseKeywords = this.keywordSignalsFor(ctx, /\b(buy|purchase|checkout|order)\b/);
    const ecommerceSignal = this.find(ctx, 'product', 'Business Model');
    const isEcommerce = !!ecommerceSignal && /ecommerce|e-commerce|marketplace/i.test(ecommerceSignal.value);
    if ((purchaseKeywords.length > 0 || isEcommerce) && conversionStage) {
      raws.push({
        type: 'purchase',
        label: 'Purchase',
        funnelStage: conversionStage,
        objectives: conversionObjective ? [conversionObjective] : [],
        supportingSignals: ecommerceSignal && isEcommerce ? [ecommerceSignal] : [],
        keywordSignals: purchaseKeywords,
        reasons: ['Direct purchase/e-commerce evidence supports a purchase action.'],
      });
    }

    // CONTACT — buyer evidence + buyer-enablement objective.
    if (buyerSignal && buyerEnablementObjective && conversionStage) {
      raws.push({
        type: 'contact',
        label: 'Contact Sales',
        funnelStage: conversionStage,
        objectives: [buyerEnablementObjective],
        supportingSignals: [buyerSignal],
        keywordSignals: [],
        audienceSignal: buyerSignal,
        reasons: [`Buyer-role evidence with a buyer-enablement objective supports a contact-sales action.`],
      });
    }

    // ACTIVATION — activation funnel stage + activation objective.
    if (activationObjective && ctx.stagesByName.has('activation')) {
      const useCaseSignal = this.find(ctx, 'audience', 'Primary Use Case');
      raws.push({
        type: 'activation',
        label: 'Activation',
        funnelStage: 'activation',
        objectives: [activationObjective],
        supportingSignals: useCaseSignal ? [useCaseSignal] : [],
        keywordSignals: [],
        audienceSignal: useCaseSignal,
        reasons: ['Activation funnel-stage evidence supports an in-product activation action.'],
      });
    }

    const strongTypes = new Set(raws.map((r) => r.type));

    // PRODUCT_EXPLORATION — fallback for consideration when nothing stronger fired.
    const considerationObjective = ctx.objectiveByType.get('consideration');
    if (considerationObjective && !strongTypes.has('signup') && !strongTypes.has('trial') && !strongTypes.has('purchase')) {
      const audienceSignal = this.find(ctx, 'audience', 'Primary Audience') ?? this.find(ctx, 'audience', 'Primary Use Case');
      raws.push({
        type: 'product_exploration',
        label: 'Product Exploration',
        funnelStage: 'consideration',
        objectives: [considerationObjective],
        supportingSignals: audienceSignal ? [audienceSignal] : [],
        keywordSignals: [],
        audienceSignal,
        reasons: ['Consideration-stage evidence without a proven stronger conversion model supports a safe product-exploration action.'],
      });
    }

    // GENERIC_CONVERSION — fallback when conversion intent exists but the model is unknown.
    if (
      hasConversionStage &&
      (conversionObjective || leadGenObjective) &&
      !strongTypes.has('signup') &&
      !strongTypes.has('trial') &&
      !strongTypes.has('demo') &&
      !strongTypes.has('lead_capture') &&
      !strongTypes.has('purchase') &&
      !strongTypes.has('contact')
    ) {
      raws.push({
        type: 'generic_conversion',
        label: 'Generic Conversion Action',
        funnelStage: 'conversion',
        objectives: [conversionObjective, leadGenObjective].filter((o): o is GrowthObjective => !!o),
        supportingSignals: [],
        keywordSignals: [],
        reasons: ['Conversion intent exists but the exact conversion model is not confirmed by current evidence.'],
      });
    }

    return raws.map((r) => this.finalizeAction(ctx, r));
  }

  private finalizeAction(ctx: Context, raw: RawAction): ConversionAction {
    const stageEntry = ctx.stagesByName.get(raw.funnelStage);
    const acqPaths = ctx.acquisitionPaths.filter((p) => p.entryFunnelStage === raw.funnelStage);

    const dims: { weight: number; value: number }[] = [];
    if (raw.objectives.length > 0) dims.push({ weight: 0.3, value: this.mean(raw.objectives.map((o) => o.priorityScore)) });
    if (stageEntry) dims.push({ weight: 0.25, value: stageEntry.priorityScore });
    if (acqPaths.length > 0) dims.push({ weight: 0.2, value: this.mean(acqPaths.map((p) => p.priorityScore)) });
    if (raw.audienceSignal) dims.push({ weight: 0.15, value: raw.audienceSignal.strengthScore });
    if (raw.keywordSignals.length > 0) dims.push({ weight: 0.1, value: this.mean(raw.keywordSignals.map((s) => s.strengthScore)) });
    const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0);
    const priorityScore = totalWeight > 0 ? this.clamp(Math.round(dims.reduce((sum, d) => sum + d.weight * d.value, 0) / totalWeight), 0, 100) : 50;

    const allEvidence = [...raw.supportingSignals, ...raw.keywordSignals];
    const distinctSources = new Set(['objective', ...(stageEntry ? ['funnel'] : []), ...(acqPaths.length ? ['acquisition'] : []), ...(allEvidence.length ? ['signal'] : [])]).size;
    const confidenceScore = this.clamp(
      Math.round(
        (raw.objectives.length ? this.mean(raw.objectives.map((o) => o.confidenceScore)) : 50) * 0.4 +
          (allEvidence.length ? this.mean(allEvidence.map((s) => s.confidenceScore)) : 50) * 0.3 +
          Math.min(30, distinctSources * 8),
      ),
      0,
      100,
    );

    return {
      id: raw.type.replace(/_/g, '-'),
      type: raw.type,
      label: raw.label,
      priorityScore,
      confidenceScore,
      funnelStage: raw.funnelStage,
      targetAudienceSegmentIds: this.dedupe(raw.audienceSignal?.relatedSegmentIds ?? []),
      relatedObjectiveIds: this.dedupe(raw.objectives.map((o) => o.id)),
      relatedAcquisitionPathIds: acqPaths.map((p) => p.id),
      supportingSignalIds: this.dedupe(allEvidence.map((s) => s.id)),
      supportingKeywords: this.dedupe(raw.keywordSignals.map((s) => s.value)),
      reasons: raw.reasons,
      warnings: [],
    };
  }

  // ---------------------------------------------------------------------
  // Frictions
  // ---------------------------------------------------------------------

  private buildFrictions(ctx: Context): ConversionFriction[] {
    const raws: RawFriction[] = [];

    const valueSignal = this.find(ctx, 'positioning', 'Value Proposition') ?? this.find(ctx, 'positioning', 'Suggested Positioning');
    if (!valueSignal || valueSignal.confidenceScore < 50) {
      raws.push({
        type: 'unclear_value',
        title: 'Unclear Value Proposition',
        hypothesis: 'Prospects may not clearly understand the core value before being asked to convert.',
        funnelStage: 'consideration',
        evidence: valueSignal ? [`Existing value-proposition evidence is weak (confidence ${valueSignal.confidenceScore}).`] : ['No strong value-proposition evidence was found.'],
        recommendedResponses: ['Clarify and validate the core value proposition before the conversion step.'],
      });
    }

    const differentiationSignals = ctx.byCategory.get('differentiation') ?? [];
    if (differentiationSignals.length === 0) {
      raws.push({
        type: 'weak_differentiation',
        title: 'Weak Differentiation',
        hypothesis: 'Prospects may not see a clear reason to choose this product over alternatives.',
        funnelStage: 'consideration',
        evidence: ['No differentiation evidence was found relative to competitors.'],
        recommendedResponses: ['Identify and validate concrete differentiators before conversion-stage messaging.'],
      });
    }

    // Insufficient proof — no customer-proof/case-study evidence source exists anywhere upstream.
    raws.push({
      type: 'insufficient_proof',
      title: 'Insufficient Proof',
      hypothesis: 'Prospects may hesitate to convert without independent proof of results or credibility.',
      funnelStage: 'conversion',
      evidence: ['Customer proof/case-study evidence is unavailable from current product, market, or audience evidence.'],
      recommendedResponses: ['Collect and validate real customer proof (testimonials, results, references) before using it in conversion messaging.'],
    });

    const pricingKeywords = this.keywordSignalsFor(ctx, /\b(pricing|price|plans?|cost)\b/);
    if (pricingKeywords.length === 0) {
      raws.push({
        type: 'pricing_uncertainty',
        title: 'Pricing Uncertainty',
        hypothesis: 'Prospects may hesitate to convert without clarity on pricing.',
        funnelStage: 'conversion',
        evidence: ['No pricing-related evidence was found in current product/keyword evidence.'],
        recommendedResponses: ['Clarify pricing/packaging information ahead of the conversion step.'],
      });
    }

    const buyerSignal = this.find(ctx, 'commercial', 'Buyer Role');
    if (buyerSignal && differentiationSignals.length === 0) {
      raws.push({
        type: 'buyer_risk',
        title: 'Buyer Risk',
        hypothesis: 'A B2B buyer may perceive purchase risk without strong differentiation or evaluation proof.',
        funnelStage: 'conversion',
        audienceSignal: buyerSignal,
        evidence: [`Buyer-role evidence ("${buyerSignal.value}") exists, but differentiation/evaluation proof is weak or absent.`],
        recommendedResponses: ['Provide evaluation-stage proof and differentiation evidence to reduce buyer-perceived risk.'],
      });
    }

    if (buyerSignal && !ctx.hasProductLedMotion) {
      raws.push({
        type: 'implementation_uncertainty',
        title: 'Implementation Uncertainty',
        hypothesis: 'A technical/B2B buyer may be uncertain about implementation effort without onboarding/documentation evidence.',
        funnelStage: 'conversion',
        audienceSignal: buyerSignal,
        evidence: ['No strong self-service/onboarding evidence was found alongside B2B buyer evidence.'],
        recommendedResponses: ['Provide implementation/onboarding guidance to reduce perceived technical risk.'],
      });
    }

    if (differentiationSignals.length === 0 && !this.find(ctx, 'market', 'Common Market Capability')) {
      raws.push({
        type: 'trust_gap',
        title: 'Trust Gap',
        hypothesis: 'Prospects may lack sufficient credibility signals to trust the product/category claims.',
        funnelStage: 'consideration',
        evidence: ['Limited category-credibility or differentiation evidence was found.'],
        recommendedResponses: ['Build category-credibility and proof evidence before asking for conversion.'],
      });
    }

    const activationObjective = ctx.objectiveByType.get('activation');
    const useCaseSignal = this.find(ctx, 'audience', 'Primary Use Case');
    if (activationObjective && ctx.stagesByName.has('activation') && (!useCaseSignal || useCaseSignal.strengthScore < 60)) {
      raws.push({
        type: 'onboarding_friction',
        title: 'Onboarding Friction',
        hypothesis: 'New users may struggle to reach first value without clear onboarding guidance.',
        funnelStage: 'activation',
        audienceSignal: useCaseSignal,
        evidence: ['Activation evidence exists, but primary use-case clarity for onboarding is weak or absent.'],
        recommendedResponses: ['Strengthen onboarding guidance around the primary use case.'],
      });
    }

    return raws.map((r) => this.finalizeFriction(ctx, r));
  }

  private finalizeFriction(ctx: Context, raw: RawFriction): ConversionFriction {
    const base = FRICTION_BASE_SEVERITY[raw.type];
    const stageEntry = ctx.stagesByName.get(raw.funnelStage);
    const affectedPaths = ctx.acquisitionPaths.filter((p) => p.entryFunnelStage === raw.funnelStage).length;

    const dims = [
      { weight: 0.4, value: stageEntry?.priorityScore ?? base },
      { weight: 0.3, value: base },
      { weight: 0.3, value: base },
    ];
    const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0);
    let severityScore = this.clamp(Math.round(dims.reduce((sum, d) => sum + d.weight * d.value, 0) / totalWeight), 0, 100);
    severityScore = this.clamp(severityScore + Math.min(10, affectedPaths * 3), 0, 100);

    const confidenceScore = this.clamp(Math.round(40 + ctx.overallConfidence * 0.4), 0, 100);

    return {
      id: raw.type.replace(/_/g, '-'),
      type: raw.type,
      title: raw.title,
      hypothesis: raw.hypothesis,
      severityScore,
      confidenceScore,
      funnelStage: raw.funnelStage,
      audienceSegmentIds: this.dedupe(raw.audienceSignal?.relatedSegmentIds ?? []),
      supportingSignalIds: this.dedupe(raw.audienceSignal ? [raw.audienceSignal.id] : []),
      evidence: raw.evidence,
      recommendedResponses: raw.recommendedResponses,
      warnings: ['This is a hypothesis, not confirmed customer behavior.'],
    };
  }

  // ---------------------------------------------------------------------
  // Proof needs
  // ---------------------------------------------------------------------

  private buildProofNeeds(ctx: Context, frictions: ConversionFriction[]): ConversionProofNeed[] {
    const map: Partial<Record<ConversionFrictionType, { title: string; type: string; direction: string[] }>> = {
      unclear_value: { title: 'Product Walkthrough / Value Demonstration', type: 'product_walkthrough', direction: ['Show a clear product walkthrough that demonstrates the core value.'] },
      weak_differentiation: { title: 'Comparison / Differentiation Evidence', type: 'comparison_evidence', direction: ['Provide validated comparison or differentiation evidence.'] },
      insufficient_proof: { title: 'Customer Proof', type: 'customer_proof', direction: ['Collect and validate real customer proof before using it in messaging; do not fabricate testimonials or case studies.'] },
      pricing_uncertainty: { title: 'Pricing Clarity', type: 'pricing_clarity', direction: ['Clarify pricing/packaging information.'] },
      buyer_risk: { title: 'Feature/Capability Proof for Buyer Evaluation', type: 'feature_proof', direction: ['Provide feature-level proof to support buyer evaluation.'] },
      implementation_uncertainty: { title: 'Implementation Guidance', type: 'implementation_guidance', direction: ['Provide implementation/technical guidance.'] },
      onboarding_friction: { title: 'Onboarding / Workflow Explanation', type: 'process_workflow_explanation', direction: ['Explain the onboarding workflow clearly for new users.'] },
    };

    return frictions
      .map((f) => {
        const entry = map[f.type];
        if (!entry) return null;
        return {
          id: `proof-${f.id}`,
          title: entry.title,
          type: entry.type,
          priorityScore: f.severityScore,
          confidenceScore: f.confidenceScore,
          funnelStage: f.funnelStage,
          audienceSegmentIds: f.audienceSegmentIds,
          evidenceSources: f.evidence,
          recommendedProofDirection: entry.direction,
          warnings: f.type === 'insufficient_proof' ? ['Do not fabricate testimonials, case studies, or results.'] : [],
        };
      })
      .filter((p): p is ConversionProofNeed => p !== null);
  }

  // ---------------------------------------------------------------------
  // Conversion paths
  // ---------------------------------------------------------------------

  private buildPaths(ctx: Context, actions: ConversionAction[], frictions: ConversionFriction[], proofNeeds: ConversionProofNeed[]): ConversionPath[] {
    const seen = new Set<string>();
    const paths: ConversionPath[] = [];
    // Never fabricate a stage the funnel didn't evidence — if nothing
    // beyond the entry stage exists, the path honestly terminates there.
    const conversionStage = this.resolveConversionStage(ctx);

    for (const acqPath of ctx.acquisitionPaths) {
      const pathConversionStage: FunnelStage = conversionStage ?? (acqPath.entryFunnelStage as FunnelStage);
      const audienceKey = acqPath.targetAudienceSegmentIds.join(',') || 'general';
      const key = `${audienceKey}|${acqPath.entryFunnelStage}|${pathConversionStage}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const relevantFrictions = frictions.filter((f) => f.funnelStage === pathConversionStage || f.funnelStage === acqPath.entryFunnelStage);
      const relevantProof = proofNeeds.filter((p) => p.funnelStage === pathConversionStage || p.funnelStage === acqPath.entryFunnelStage);
      const matchingActions = actions.filter((a) => a.funnelStage === pathConversionStage);
      const primaryAction = matchingActions.sort((a, b) => b.priorityScore - a.priorityScore)[0];

      const messagingPillar = acqPath.messagingPillarIds.map((id) => [...ctx.messagingByTheme.values()].find((p) => p.id === id)).find((p): p is MessagingPillar => !!p);
      const messageDirection = this.messageDirectionFor(pathConversionStage, primaryAction, messagingPillar);

      const dims: { weight: number; value: number }[] = [{ weight: 0.25, value: acqPath.priorityScore }];
      const stageEntry = ctx.stagesByName.get(pathConversionStage);
      if (stageEntry) dims.push({ weight: 0.2, value: stageEntry.priorityScore });
      if (primaryAction) dims.push({ weight: 0.25, value: primaryAction.priorityScore });
      if (messagingPillar || relevantProof.length) dims.push({ weight: 0.15, value: messagingPillar?.priorityScore ?? this.mean(relevantProof.map((p) => p.priorityScore)) });
      if (acqPath.targetAudienceSegmentIds.length) dims.push({ weight: 0.15, value: acqPath.priorityScore });
      const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0);
      const priorityScore = this.clamp(Math.round(dims.reduce((sum, d) => sum + d.weight * d.value, 0) / totalWeight), 0, 100);

      const confidenceScore = this.clamp(
        Math.round(acqPath.confidenceScore * 0.4 + (primaryAction?.confidenceScore ?? acqPath.confidenceScore) * 0.4 + (stageEntry?.confidenceScore ?? acqPath.confidenceScore) * 0.2),
        0,
        100,
      );

      paths.push({
        id: `conv-path-${paths.length + 1}`,
        title: `${acqPath.title.split(' → ')[0]} → ${this.labelize(acqPath.entryFunnelStage)} → ${messageDirection[0] ?? 'core message'} → ${relevantFrictions[0]?.title ?? 'no major friction'} → ${relevantProof[0]?.title ?? 'supporting proof'} → ${primaryAction?.label ?? 'appropriate conversion action'}`,
        audienceSegmentIds: acqPath.targetAudienceSegmentIds,
        acquisitionPathId: acqPath.id,
        entryStage: acqPath.entryFunnelStage,
        conversionStage: pathConversionStage,
        messageDirection,
        proofNeeds: relevantProof.map((p) => p.id),
        frictionIds: relevantFrictions.map((f) => f.id),
        primaryActionId: primaryAction?.id,
        priorityScore,
        confidenceScore,
        reasons: [`Connects the ${acqPath.entryChannel} acquisition path through ${this.labelize(pathConversionStage)} toward ${primaryAction?.label.toLowerCase() ?? 'an appropriate conversion action'}.`],
      });
    }

    return paths
      .sort((a, b) => b.priorityScore - a.priorityScore || a.id.localeCompare(b.id))
      .slice(0, this.getMaxPaths());
  }

  private messageDirectionFor(stage: FunnelStage, action: ConversionAction | undefined, pillar: MessagingPillar | undefined): string[] {
    if (stage === 'awareness') return pillar ? [pillar.title] : ['Educational framing (no hard conversion CTA)'];
    if (stage === 'consideration') return ['Explore the product', 'Compare options', 'Evaluate capabilities'];
    if (stage === 'activation') return ['Start onboarding', 'Complete the first-value action'];
    // conversion stage
    if (action && action.type !== 'generic_conversion' && action.type !== 'product_exploration') return [action.label];
    return ['Appropriate conversion action'];
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

  private getMaxActions(): number {
    return this.getEnvNumber('CONVERSION_MAX_ACTIONS', DEFAULT_MAX_ACTIONS);
  }

  private getMaxFrictions(): number {
    return this.getEnvNumber('CONVERSION_MAX_FRICTIONS', DEFAULT_MAX_FRICTIONS);
  }

  private getMaxProofNeeds(): number {
    return this.getEnvNumber('CONVERSION_MAX_PROOF_NEEDS', DEFAULT_MAX_PROOF_NEEDS);
  }

  private getMaxPaths(): number {
    return this.getEnvNumber('CONVERSION_MAX_PATHS', DEFAULT_MAX_PATHS);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
