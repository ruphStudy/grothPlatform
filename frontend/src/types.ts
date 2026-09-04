export interface User {
  id: string;
  name: string;
  email: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export const PRODUCT_TYPES = [
  'saas',
  'service',
  'ecommerce',
  'mobile_app',
  'website',
  'local_business',
  'creator',
  'other',
] as const;

export const PRIMARY_GOALS = ['leads', 'signups', 'sales', 'traffic', 'awareness', 'engagement', 'other'] as const;

export interface Product {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  websiteUrl?: string;
  shortDescription?: string;
  productType?: (typeof PRODUCT_TYPES)[number];
  primaryGoal?: (typeof PRIMARY_GOALS)[number];
  targetMarkets: string[];
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface TargetAudience {
  name: string;
  description: string;
  painPoints: string[];
  goals: string[];
}

export interface WebsitePreviewSource {
  configuredUrl: string;
  finalUrl: string;
  contentType?: string;
  fetchedAt: string;
}

export interface WebsitePreview {
  productId: string;
  websiteUrl: string;
  finalUrl: string;
  title?: string;
  metaDescription?: string;
  headings: {
    h1: string[];
    h2: string[];
    h3: string[];
  };
  paragraphs: string[];
  listItems: string[];
  ctas: string[];
  textContentPreview: string;
  extraction: {
    originalCharacters: number;
    extractedCharacters: number;
    truncated: boolean;
  };
  contentQuality: 'good' | 'limited' | 'empty';
  contentWarning?: string;
  source: WebsitePreviewSource;
  fetchedAt: string;
}

export interface ProductKnowledgePageRef {
  url: string;
  category: string;
  fetchedAt: string;
}

export interface ProductKnowledgeFailure {
  url: string;
  category: string;
  reason: string;
}

export interface ProductKnowledgeFaqItem {
  question: string;
  answer?: string;
}

export interface ProductKnowledgeAssessment {
  confidenceScore: number;
  coverage: {
    identity: number;
    features: number;
    pricing: number;
    faq: number;
    documentation: number;
  };
  missingInformation: string[];
  warnings: string[];
  quality: 'high' | 'medium' | 'low';
}

export interface ProductWebsiteKnowledgePreview {
  productId: string;
  source: {
    configuredUrl: string;
    finalHomepageUrl: string;
    homepageFetchedAt: string;
  };
  pagesAnalyzed: ProductKnowledgePageRef[];
  identity: {
    title?: string;
    metaDescription?: string;
    keyStatements: string[];
  };
  features: string[];
  pricing: {
    signals: string[];
  };
  faqs: ProductKnowledgeFaqItem[];
  documentation: {
    topics: string[];
    technicalFacts: string[];
  };
  callsToAction: string[];
  assessment: ProductKnowledgeAssessment;
  extractionStats: {
    discoveredPages: number;
    selectedPages: number;
    attemptedPages: number;
    successfulPages: number;
    failedPages: number;
  };
  failures: ProductKnowledgeFailure[];
  combinedTextPreview: string;
  combinedTextLength: number;
  combinedTextTruncated: boolean;
}

// --- Sprint 9: Competitive Intelligence ---

export interface MarketCategoryResult {
  primaryCategory?: string;
  subcategories: string[];
  categoryTerms: string[];
  descriptors: string[];
  confidenceScore: number;
  evidence: { productMetadata: string[]; websiteKnowledge: string[] };
  missingSignals: string[];
  warnings: string[];
}

export interface CompetitorWebsiteAnalysis {
  name: string;
  url: string;
  domain: string;
  relevanceScore: number;
  reasons: string[];
  sourceQueries: string[];
  finalUrl?: string;
  confidenceScore: number;
  quality: 'high' | 'medium' | 'low';
  title?: string;
  metaDescription?: string;
  keyStatements: string[];
  features: string[];
  pricingSignals: string[];
  faqs: ProductKnowledgeFaqItem[];
  documentation: { topics: string[]; technicalFacts: string[] };
  callsToAction: string[];
  pagesAnalyzed: ProductKnowledgePageRef[];
  missingInformation: string[];
  warnings: string[];
  failures: ProductKnowledgeFailure[];
  analyzedAt: string;
}

export interface CompetitorAnalysisFailure {
  name: string;
  domain: string;
  url: string;
  reason: string;
}

export interface SharedCapability {
  productFeature: string;
  competitorFeature: string;
  similarityScore: number;
}

export interface CompetitorFeatureComparison {
  competitorName: string;
  competitorDomain: string;
  competitorConfidenceScore: number;
  sharedCapabilities: SharedCapability[];
  competitorOnlyCapabilities: string[];
  productOnlyCapabilities: string[];
  similarityScore: number;
}

export interface PossibleFeatureGap {
  capability: string;
  competitorCount: number;
  competitors: string[];
  importanceScore: number;
}

export interface CompetitorFeatureComparisonResult {
  marketCategory?: string;
  productFeatures: string[];
  competitors: CompetitorFeatureComparison[];
  commonCapabilities: string[];
  productDifferentiators: string[];
  possibleFeatureGaps: PossibleFeatureGap[];
  confidenceScore: number;
  warnings: string[];
  stats: { discoveredCompetitors: number; analyzedCompetitors: number; competitorsUsed: number; productFeatureCount: number };
  comparedAt: string;
}

export interface ProductPositioningProfile {
  positioningStatements: string[];
  valueThemes: string[];
  audienceSignals: string[];
  pricingPosition: string[];
  ctaThemes: string[];
}

export interface CompetitorPositioningProfile extends ProductPositioningProfile {
  competitorName: string;
  competitorDomain: string;
  confidenceScore: number;
}

export interface PositioningOverlap {
  theme: string;
  productEvidence: string[];
  competitorCount: number;
  competitors: string[];
}

export interface PositioningOpportunity {
  theme: string;
  reason: string;
  supportingCompetitors: string[];
  confidenceScore: number;
}

export interface CompetitorPositioningAnalysisResult {
  marketCategory?: string;
  productPositioning: ProductPositioningProfile;
  competitorPositioning: CompetitorPositioningProfile[];
  commonPositioningThemes: string[];
  overlap: PositioningOverlap[];
  opportunities: PositioningOpportunity[];
  confidenceScore: number;
  warnings: string[];
  stats: { discoveredCompetitors: number; analyzedCompetitors: number; competitorsUsed: number; positioningThemesDetected: number };
  analyzedAt: string;
}

export type MarketGapCategory = 'capability' | 'positioning' | 'audience' | 'pricing' | 'go-to-market' | 'differentiation';

export type MarketGapOpportunityType =
  | 'possible_product_gap'
  | 'differentiation_opportunity'
  | 'positioning_gap'
  | 'audience_opportunity'
  | 'pricing_opportunity'
  | 'go_to_market_opportunity';

export interface MarketGapEvidence {
  type: string;
  description: string;
  competitors: string[];
  supportingCount: number;
}

export interface MarketGapOpportunity {
  id: string;
  category: MarketGapCategory;
  title: string;
  description: string;
  opportunityType: MarketGapOpportunityType;
  priorityScore: number;
  confidenceScore: number;
  evidence: MarketGapEvidence[];
  caution: string;
}

export interface CommonMarketPattern {
  category: MarketGapCategory;
  label: string;
  competitorCount: number;
  totalCompetitors: number;
  prevalencePercent: number;
  interpretation: string;
}

export interface MarketGapAnalysisResult {
  marketCategory?: string;
  opportunities: MarketGapOpportunity[];
  strongestOpportunities: MarketGapOpportunity[];
  commonMarketPatterns: CommonMarketPattern[];
  confidenceScore: number;
  warnings: string[];
  stats: {
    discoveredCompetitors: number;
    analyzedCompetitors: number;
    competitorsUsed: number;
    featureGapCount: number;
    positioningOpportunityCount: number;
    totalOpportunities: number;
  };
  analyzedAt: string;
}

export interface CompetitiveIntelligencePreview {
  marketCategory: MarketCategoryResult;
  discovery: { discoveredCompetitors: number; warnings: string[] };
  competitorAnalysis: { competitors: CompetitorWebsiteAnalysis[]; failures: CompetitorAnalysisFailure[] };
  featureComparison: CompetitorFeatureComparisonResult;
  positioning: CompetitorPositioningAnalysisResult;
  marketGaps: MarketGapAnalysisResult;
  stats: {
    discoveredCompetitors: number;
    analyzedCompetitors: number;
    failedCompetitorAnalyses: number;
    productFeatureCount: number;
    totalOpportunities: number;
  };
  warnings: string[];
  generatedAt: string;
}

// --- Sprint 10: Audience Intelligence ---

export type AudienceSignalCategory =
  | 'role'
  | 'user_type'
  | 'company_type'
  | 'company_size'
  | 'industry'
  | 'lifecycle'
  | 'use_case'
  | 'buyer'
  | 'business_model';

export interface AudienceSignal {
  label: string;
  category: AudienceSignalCategory;
  confidenceScore: number;
  evidence: string[];
  sources: string[];
}

export interface AudienceSignalResult {
  signals: AudienceSignal[];
  roles: string[];
  userTypes: string[];
  companyTypes: string[];
  companySizes: string[];
  industries: string[];
  lifecycleStages: string[];
  useCases: string[];
  buyerSignals: string[];
  businessModelSignals: string[];
  confidenceScore: number;
  missingSignals: string[];
  warnings: string[];
}

export type AudienceSegmentType = 'individual' | 'team' | 'business' | 'institution' | 'marketplace_side';

export interface AudienceSegment {
  id: string;
  name: string;
  segmentType: AudienceSegmentType;
  roles: string[];
  userTypes: string[];
  companyTypes: string[];
  companySizes: string[];
  industries: string[];
  useCases: string[];
  lifecycleStages: string[];
  buyerSignals: string[];
  businessModelSignals: string[];
  confidenceScore: number;
  evidence: string[];
  sourceSignals: string[];
  warnings: string[];
}

export interface AudienceSegmentResult {
  segments: AudienceSegment[];
  primarySegmentId?: string;
  confidenceScore: number;
  ungroupedSignals: string[];
  warnings: string[];
  generatedAt: string;
}

export type IcpFitLevel = 'strong' | 'moderate' | 'weak';

export interface IcpCandidate {
  id: string;
  name: string;
  segmentId: string;
  segmentName: string;
  fitScore: number;
  confidenceScore: number;
  fitLevel: IcpFitLevel;
  roles: string[];
  userTypes: string[];
  companyTypes: string[];
  companySizes: string[];
  industries: string[];
  useCases: string[];
  buyerSignals: string[];
  businessModelSignals: string[];
  reasons: string[];
  evidence: string[];
  missingEvidence: string[];
  warnings: string[];
}

export interface IcpResult {
  candidates: IcpCandidate[];
  primaryIcpId?: string;
  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];
  generatedAt: string;
}

export type AudienceCommercialRole =
  | 'end_user'
  | 'primary_user'
  | 'buyer'
  | 'economic_buyer'
  | 'decision_maker'
  | 'influencer'
  | 'administrator'
  | 'beneficiary';

export type BuyerUserRelationshipType = 'buys_for' | 'administers_for' | 'decides_for' | 'influences' | 'uses_with' | 'benefits_from';

export interface BuyerUserEntity {
  segmentId: string;
  segmentName: string;
  roles: string[];
  commercialRoles: AudienceCommercialRole[];
  confidenceScore: number;
  evidence: string[];
  reasons: string[];
  warnings: string[];
}

export interface BuyerUserRelationship {
  fromSegmentId: string;
  toSegmentId: string;
  relationship: BuyerUserRelationshipType;
  confidenceScore: number;
  reasons: string[];
}

export interface BuyerUserMapResult {
  entities: BuyerUserEntity[];
  relationships: BuyerUserRelationship[];
  endUserSegmentIds: string[];
  buyerSegmentIds: string[];
  decisionMakerSegmentIds: string[];
  administratorSegmentIds: string[];
  primaryBuyerSegmentId?: string;
  primaryUserSegmentId?: string;
  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];
  generatedAt: string;
}

export type PainPointCategory =
  | 'efficiency'
  | 'quality'
  | 'consistency'
  | 'visibility'
  | 'learning'
  | 'workflow'
  | 'administration'
  | 'collaboration'
  | 'cost'
  | 'adoption'
  | 'decision_making'
  | 'coordination';

export interface AudiencePainPoint {
  id: string;
  segmentId: string;
  segmentName: string;
  title: string;
  category: PainPointCategory;
  description: string;
  severityScore: number;
  confidenceScore: number;
  evidence: string[];
  reasons: string[];
  relatedUseCases: string[];
  relatedLifecycleStages: string[];
  relatedCommercialRoles: string[];
  caution: string;
}

export interface AudiencePainPointResult {
  painPoints: AudiencePainPoint[];
  bySegment: { segmentId: string; painPointIds: string[] }[];
  strongestPainPointIds: string[];
  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];
  generatedAt: string;
}

export type AudienceJobType = 'functional' | 'outcome' | 'administrative' | 'decision' | 'learning' | 'coordination';

export interface AudienceJob {
  id: string;
  segmentId: string;
  segmentName: string;
  type: AudienceJobType;
  situation: string;
  motivation: string;
  desiredOutcome: string;
  statement: string;
  priorityScore: number;
  confidenceScore: number;
  relatedUseCases: string[];
  relatedPainPointIds: string[];
  relatedCommercialRoles: string[];
  evidence: string[];
  reasons: string[];
  caution: string;
}

export interface AudienceJtbdResult {
  jobs: AudienceJob[];
  bySegment: { segmentId: string; jobIds: string[] }[];
  primaryJobIdBySegment: Record<string, string>;
  strongestJobIds: string[];
  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];
  generatedAt: string;
}

export type AudiencePriorityTier = 'primary' | 'secondary' | 'experimental' | 'insufficient_evidence';

export interface AudiencePriority {
  segmentId: string;
  segmentName: string;
  priorityScore: number;
  confidenceScore: number;
  tier: AudiencePriorityTier;
  icpFitScore?: number;
  roleSummary: string[];
  useCases: string[];
  reasons: string[];
  strengths: string[];
  weaknesses: string[];
  evidence: string[];
  warnings: string[];
}

export interface AudiencePrioritizationResult {
  priorities: AudiencePriority[];
  primarySegmentId?: string;
  secondarySegmentIds: string[];
  experimentalSegmentIds: string[];
  confidenceScore: number;
  rationale: string[];
  missingEvidence: string[];
  warnings: string[];
  generatedAt: string;
}

export interface AudienceIntelligencePreview {
  signals: AudienceSignalResult;
  segments: AudienceSegmentResult;
  icp: IcpResult;
  buyerUserMap: BuyerUserMapResult;
  painPoints: AudiencePainPointResult;
  jtbd: AudienceJtbdResult;
  prioritization: AudiencePrioritizationResult;
  stats: {
    signalCount: number;
    segmentCount: number;
    icpCandidateCount: number;
    relationshipCount: number;
    painPointCount: number;
    jobCount: number;
    prioritizedSegmentCount: number;
  };
  warnings: string[];
  generatedAt: string;
}

export type KeywordSignalSource =
  | 'product_name'
  | 'product_description'
  | 'product_type'
  | 'market_category'
  | 'market_term'
  | 'website_identity'
  | 'feature'
  | 'use_case'
  | 'audience'
  | 'pain_point'
  | 'jtbd'
  | 'pricing'
  | 'competitor_gap';

export type KeywordIntent =
  | 'informational'
  | 'commercial'
  | 'transactional'
  | 'navigational'
  | 'solution'
  | 'problem'
  | 'comparison'
  | 'audience_specific';

export interface KeywordSignal {
  keyword: string;
  normalizedKeyword: string;
  sources: KeywordSignalSource[];
  intent: KeywordIntent[];
  confidenceScore: number;
  evidence: string[];
  relatedSegments?: string[];
  relatedUseCases?: string[];
  warnings: string[];
}

export interface KeywordSignalResult {
  keywords: KeywordSignal[];
  productKeywords: string[];
  featureKeywords: string[];
  audienceKeywords: string[];
  problemKeywords: string[];
  commercialKeywords: string[];
  longTailKeywords: string[];
  confidenceScore: number;
  missingSignals: string[];
  warnings: string[];
  generatedAt: string;
}

export type SearchIntentPrimary =
  | 'informational'
  | 'commercial'
  | 'transactional'
  | 'navigational'
  | 'comparison'
  | 'problem'
  | 'solution'
  | 'audience_specific';

export type KeywordFunnelStage = 'awareness' | 'consideration' | 'decision' | 'mixed';

export interface KeywordIntentProfile {
  keyword: string;
  normalizedKeyword: string;
  primaryIntent: SearchIntentPrimary;
  secondaryIntents: SearchIntentPrimary[];
  funnelStage: KeywordFunnelStage;
  intentScore: number;
  confidenceScore: number;
  reasons: string[];
  warnings: string[];
}

export interface KeywordIntentResult {
  profiles: KeywordIntentProfile[];
  byPrimaryIntent: Record<string, string[]>;
  awarenessKeywords: string[];
  considerationKeywords: string[];
  decisionKeywords: string[];
  confidenceScore: number;
  warnings: string[];
  generatedAt: string;
}

export type KeywordClusterType = 'category' | 'feature' | 'use_case' | 'audience' | 'problem' | 'commercial' | 'brand' | 'mixed';

export interface KeywordCluster {
  id: string;
  name: string;
  type: KeywordClusterType;
  primaryKeyword: string;
  keywords: string[];
  primaryIntent: string;
  intents: string[];
  funnelStages: string[];
  relatedSegments: string[];
  relatedUseCases: string[];
  coherenceScore: number;
  confidenceScore: number;
  reasons: string[];
  warnings: string[];
}

export interface KeywordClusterResult {
  clusters: KeywordCluster[];
  unclusteredKeywords: string[];
  confidenceScore: number;
  warnings: string[];
  generatedAt: string;
}

export type KeywordOpportunityTier = 'high' | 'medium' | 'low' | 'insufficient_evidence';

export interface KeywordOpportunity {
  keyword: string;
  normalizedKeyword: string;
  clusterId?: string;
  opportunityScore: number;
  confidenceScore: number;
  tier: KeywordOpportunityTier;
  primaryIntent: string;
  funnelStage: string;
  reasons: string[];
  strengths: string[];
  weaknesses: string[];
  warnings: string[];
}

export interface KeywordOpportunityResult {
  opportunities: KeywordOpportunity[];
  highOpportunityKeywords: string[];
  mediumOpportunityKeywords: string[];
  confidenceScore: number;
  warnings: string[];
  generatedAt: string;
}

export type CompetitorKeywordGapType = 'missing' | 'weak_coverage' | 'differentiation' | 'shared';

export interface CompetitorKeywordGap {
  keyword: string;
  normalizedKeyword: string;
  gapType: CompetitorKeywordGapType;
  competitorCount: number;
  competitors: string[];
  relatedFeatures: string[];
  relatedUseCases: string[];
  opportunityScore: number;
  confidenceScore: number;
  reasons: string[];
  strengths: string[];
  weaknesses: string[];
  warnings: string[];
}

export interface CompetitorKeywordGapResult {
  gaps: CompetitorKeywordGap[];
  strongestGapKeywords: string[];
  sharedKeywords: string[];
  differentiationKeywords: string[];
  confidenceScore: number;
  warnings: string[];
  generatedAt: string;
}

export type LongTailExpansionType = 'audience' | 'use_case' | 'problem' | 'intent' | 'feature' | 'comparison' | 'competitor_gap';

export interface LongTailKeyword {
  keyword: string;
  normalizedKeyword: string;
  baseKeyword: string;
  expansionType: LongTailExpansionType;
  primaryIntent: string;
  funnelStage: string;
  relatedSegments: string[];
  relatedUseCases: string[];
  opportunityScore: number;
  confidenceScore: number;
  reasons: string[];
  warnings: string[];
}

export interface KeywordLongTailResult {
  keywords: LongTailKeyword[];
  strongestKeywords: string[];
  confidenceScore: number;
  warnings: string[];
  generatedAt: string;
}

export interface KeywordAudienceMatch {
  keyword: string;
  normalizedKeyword: string;
  segmentId: string;
  segmentName: string;
  relevanceScore: number;
  confidenceScore: number;
  primaryIntent: string;
  funnelStage: string;
  relatedUseCases: string[];
  reasons: string[];
  warnings: string[];
}

export interface KeywordAudienceMapResult {
  matches: KeywordAudienceMatch[];
  primaryAudienceByKeyword: Record<string, string>;
  keywordsBySegment: Record<string, string[]>;
  unmappedKeywords: string[];
  confidenceScore: number;
  warnings: string[];
  generatedAt: string;
}

export interface KeywordIntelligencePreviewStats {
  keywordCount: number;
  clusterCount: number;
  highOpportunityCount: number;
  gapCount: number;
  longTailCount: number;
  mappedKeywordCount: number;
}

export interface KeywordIntelligencePreview {
  signals: KeywordSignalResult;
  intents: KeywordIntentResult;
  clusters: KeywordClusterResult;
  opportunities: KeywordOpportunityResult;
  competitorGaps?: CompetitorKeywordGapResult;
  longTail: KeywordLongTailResult;
  audienceMap: KeywordAudienceMapResult;
  stats: KeywordIntelligencePreviewStats;
  warnings: string[];
  generatedAt: string;
}

export type StrategySignalCategory =
  | 'product'
  | 'positioning'
  | 'audience'
  | 'pain'
  | 'jtbd'
  | 'keyword'
  | 'market'
  | 'competitor'
  | 'commercial'
  | 'differentiation'
  | 'evidence_gap';

export interface StrategySignal {
  id: string;
  category: StrategySignalCategory;
  title: string;
  value: string;
  strengthScore: number;
  confidenceScore: number;
  source: string;
  evidence: string[];
  relatedSegmentIds?: string[];
  relatedKeywords?: string[];
  relatedUseCases?: string[];
  warnings: string[];
}

export interface StrategySignalResult {
  signals: StrategySignal[];
  strongestSignalIds: string[];
  productSignals: string[];
  audienceSignals: string[];
  marketSignals: string[];
  keywordSignals: string[];
  differentiationSignals: string[];
  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];
  generatedAt: string;
}

export type GrowthObjectiveType =
  | 'awareness'
  | 'education'
  | 'consideration'
  | 'lead_generation'
  | 'conversion'
  | 'positioning'
  | 'differentiation'
  | 'buyer_enablement'
  | 'retention'
  | 'activation';

export interface GrowthObjective {
  id: string;
  type: GrowthObjectiveType;
  title: string;
  priorityScore: number;
  confidenceScore: number;
  relatedSignalIds: string[];
  relatedAudienceSegmentIds: string[];
  relatedKeywords: string[];
  reasons: string[];
  missingEvidence: string[];
  warnings: string[];
}

export interface GrowthObjectiveResult {
  objectives: GrowthObjective[];
  primaryObjectiveId?: string;
  secondaryObjectiveIds: string[];
  confidenceScore: number;
  warnings: string[];
  generatedAt: string;
}

export type GrowthChannel =
  | 'seo'
  | 'content'
  | 'organic_social'
  | 'paid_search'
  | 'paid_social'
  | 'email'
  | 'community'
  | 'partnerships'
  | 'outbound'
  | 'product_led';

export interface ChannelFit {
  channel: GrowthChannel;
  fitScore: number;
  confidenceScore: number;
  relatedObjectiveIds: string[];
  relatedAudienceSegmentIds: string[];
  relatedKeywords: string[];
  reasons: string[];
  weaknesses: string[];
  warnings: string[];
}

export interface GrowthChannelFitResult {
  channels: ChannelFit[];
  primaryChannel?: GrowthChannel;
  secondaryChannels: GrowthChannel[];
  confidenceScore: number;
  warnings: string[];
  generatedAt: string;
}

export type FunnelStage = 'awareness' | 'consideration' | 'conversion' | 'activation' | 'retention';

export interface FunnelStageStrategy {
  stage: FunnelStage;
  objective: string;
  priorityScore: number;
  confidenceScore: number;
  audienceSegmentIds: string[];
  channels: string[];
  keywordIntents: string[];
  keywords: string[];
  recommendedActions: string[];
  entrySignals: string[];
  successSignals: string[];
  reasons: string[];
  warnings: string[];
}

export interface FunnelStrategyResult {
  stages: FunnelStageStrategy[];
  primaryEntryStage?: FunnelStage;
  primaryConversionPath: FunnelStage[];
  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];
  generatedAt: string;
}

export interface MessagingPillar {
  id: string;
  title: string;
  theme: string;
  priorityScore: number;
  confidenceScore: number;
  targetAudienceSegmentIds: string[];
  relatedObjectiveIds: string[];
  relatedFunnelStages: string[];
  supportingSignalIds: string[];
  supportingKeywords: string[];
  reasons: string[];
  warnings: string[];
}

export interface AudienceMessage {
  audienceSegmentId: string;
  primaryNeed: string;
  valueMessage: string;
  proofFocus: string[];
  objectionFocus: string[];
  confidenceScore: number;
  supportingSignalIds: string[];
}

export interface FunnelMessage {
  stage: string;
  messageGoal: string;
  messageThemes: string[];
  proofFocus: string[];
  ctaDirection: string[];
  confidenceScore: number;
}

export interface MessagingStrategyResult {
  pillars: MessagingPillar[];
  audienceMessages: AudienceMessage[];
  funnelMessages: FunnelMessage[];
  primaryPillarId?: string;
  toneGuidance: string[];
  avoidClaims: string[];
  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];
  generatedAt: string;
}

export type ContentFormat =
  | 'blog'
  | 'landing_page'
  | 'comparison_page'
  | 'case_study'
  | 'guide'
  | 'checklist'
  | 'social_post'
  | 'short_video'
  | 'long_video'
  | 'webinar'
  | 'email'
  | 'faq'
  | 'documentation';

export interface ContentPillar {
  id: string;
  title: string;
  theme: string;
  priorityScore: number;
  confidenceScore: number;
  targetAudienceSegmentIds: string[];
  relatedObjectiveIds: string[];
  relatedFunnelStages: string[];
  relatedMessagingPillarIds: string[];
  supportingKeywords: string[];
  supportingSignalIds: string[];
  reasons: string[];
  warnings: string[];
}

export interface ContentFormatRecommendation {
  format: ContentFormat;
  priorityScore: number;
  confidenceScore: number;
  targetFunnelStages: string[];
  targetAudienceSegmentIds: string[];
  relatedContentPillarIds: string[];
  reasons: string[];
}

export interface ContentTopicDirection {
  id: string;
  title: string;
  contentPillarId: string;
  intent: string;
  funnelStage: string;
  audienceSegmentIds: string[];
  keywords: string[];
  priorityScore: number;
  confidenceScore: number;
  reasons: string[];
}

export interface ContentStrategyResult {
  pillars: ContentPillar[];
  formats: ContentFormatRecommendation[];
  topicDirections: ContentTopicDirection[];
  primaryPillarId?: string;
  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];
  generatedAt: string;
}

export type AcquisitionMotionType =
  | 'organic_search'
  | 'content_distribution'
  | 'organic_social'
  | 'paid_search'
  | 'paid_social'
  | 'outbound'
  | 'email_nurture'
  | 'community'
  | 'partnerships'
  | 'product_led';

export interface AcquisitionMotion {
  id: string;
  type: AcquisitionMotionType;
  title: string;
  priorityScore: number;
  confidenceScore: number;
  targetAudienceSegmentIds: string[];
  relatedObjectiveIds: string[];
  relatedChannels: string[];
  relatedFunnelStages: string[];
  relatedContentPillarIds: string[];
  supportingKeywords: string[];
  supportingSignalIds: string[];
  recommendedActions: string[];
  reasons: string[];
  weaknesses: string[];
  warnings: string[];
}

export interface AcquisitionPath {
  id: string;
  title: string;
  entryChannel: string;
  entryFunnelStage: string;
  targetAudienceSegmentIds: string[];
  contentFormatDirections: string[];
  messagingPillarIds: string[];
  conversionDirection: string;
  priorityScore: number;
  confidenceScore: number;
  reasons: string[];
}

export interface AcquisitionStrategyResult {
  motions: AcquisitionMotion[];
  paths: AcquisitionPath[];
  primaryMotionId?: string;
  primaryPathId?: string;
  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];
  generatedAt: string;
}

export type ConversionActionType =
  | 'signup'
  | 'trial'
  | 'demo'
  | 'lead_capture'
  | 'purchase'
  | 'contact'
  | 'product_exploration'
  | 'activation'
  | 'generic_conversion';

export type ConversionFrictionType =
  | 'unclear_value'
  | 'weak_differentiation'
  | 'insufficient_proof'
  | 'pricing_uncertainty'
  | 'action_uncertainty'
  | 'buyer_risk'
  | 'implementation_uncertainty'
  | 'trust_gap'
  | 'onboarding_friction';

export interface ConversionAction {
  id: string;
  type: ConversionActionType;
  label: string;
  priorityScore: number;
  confidenceScore: number;
  funnelStage: string;
  targetAudienceSegmentIds: string[];
  relatedObjectiveIds: string[];
  relatedAcquisitionPathIds: string[];
  supportingSignalIds: string[];
  supportingKeywords: string[];
  reasons: string[];
  warnings: string[];
}

export interface ConversionFriction {
  id: string;
  type: ConversionFrictionType;
  title: string;
  hypothesis: string;
  severityScore: number;
  confidenceScore: number;
  funnelStage: string;
  audienceSegmentIds: string[];
  supportingSignalIds: string[];
  evidence: string[];
  recommendedResponses: string[];
  warnings: string[];
}

export interface ConversionProofNeed {
  id: string;
  title: string;
  type: string;
  priorityScore: number;
  confidenceScore: number;
  funnelStage: string;
  audienceSegmentIds: string[];
  evidenceSources: string[];
  recommendedProofDirection: string[];
  warnings: string[];
}

export interface ConversionPath {
  id: string;
  title: string;
  audienceSegmentIds: string[];
  acquisitionPathId?: string;
  entryStage: string;
  conversionStage: string;
  messageDirection: string[];
  proofNeeds: string[];
  frictionIds: string[];
  primaryActionId?: string;
  priorityScore: number;
  confidenceScore: number;
  reasons: string[];
}

export interface ConversionStrategyResult {
  actions: ConversionAction[];
  frictions: ConversionFriction[];
  proofNeeds: ConversionProofNeed[];
  paths: ConversionPath[];
  primaryActionId?: string;
  primaryPathId?: string;
  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];
  generatedAt: string;
}

export interface GrowthStrategyOverview {
  signals: StrategySignalResult;
  objectives: GrowthObjectiveResult;
  channels: GrowthChannelFitResult;
  funnel: FunnelStrategyResult;
  messaging: MessagingStrategyResult;
  contentStrategy: ContentStrategyResult;
  acquisitionStrategy: AcquisitionStrategyResult;
  conversionStrategy: ConversionStrategyResult;
  generatedAt: string;
}

export interface ProductIntelligenceProfile {
  id: string;
  organizationId: string;
  productId: string;
  summary: string;
  category: string;
  businessModel: string;
  valueProposition: string;
  coreFeatures: string[];
  problemsSolved: string[];
  targetAudiences: TargetAudience[];
  likelyUseCases: string[];
  differentiators: string[];
  suggestedPositioning: string;
  marketingAngles: string[];
  missingInformation: string[];
  confidenceScore: number;
  aiProvider: string;
  aiModel: string;
  version: number;
  websiteAnalyzed: boolean;
  websiteAnalysisUrl?: string;
  websiteAnalysisFetchedAt?: string;
  websiteContentQuality?: 'good' | 'limited' | 'empty' | 'unavailable';
  createdAt: string;
  updatedAt: string;
}
