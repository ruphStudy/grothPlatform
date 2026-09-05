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

export type GrowthPlanPhase = 'days_1_30' | 'days_31_60' | 'days_61_90';

export type GrowthInitiativeType =
  | 'foundation'
  | 'validation'
  | 'audience'
  | 'messaging'
  | 'content'
  | 'seo'
  | 'acquisition'
  | 'conversion'
  | 'activation'
  | 'proof'
  | 'measurement'
  | 'optimization';

export interface GrowthInitiative {
  id: string;
  phase: GrowthPlanPhase;
  type: GrowthInitiativeType;
  title: string;
  objective: string;
  priorityScore: number;
  confidenceScore: number;
  relatedObjectiveIds: string[];
  relatedChannelIds: string[];
  relatedContentPillarIds: string[];
  relatedAcquisitionMotionIds: string[];
  relatedConversionActionIds: string[];
  audienceSegmentIds: string[];
  funnelStages: string[];
  actions: string[];
  expectedLearning: string[];
  dependencies: string[];
  successSignals: string[];
  reasons: string[];
  warnings: string[];
}

export interface GrowthPlanMilestone {
  id: string;
  phase: GrowthPlanPhase;
  title: string;
  initiativeIds: string[];
  outcomeDirection: string;
  validationSignals: string[];
  confidenceScore: number;
}

export interface GrowthPlanPhaseSummary {
  phase: GrowthPlanPhase;
  theme: string;
  objective: string;
  initiativeIds: string[];
  milestoneIds: string[];
  confidenceScore: number;
}

export interface GrowthPlanResult {
  phases: GrowthPlanPhaseSummary[];
  initiatives: GrowthInitiative[];
  milestones: GrowthPlanMilestone[];
  topPriorityInitiativeIds: string[];
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
  growthPlan: GrowthPlanResult;
  generatedAt: string;
}

export type GrowthStrategyReviewStatus = 'draft' | 'approved' | 'changes_requested';

export type GrowthStrategySection =
  | 'overview'
  | 'signals'
  | 'objectives'
  | 'channels'
  | 'funnel'
  | 'messaging'
  | 'content'
  | 'acquisition'
  | 'conversion'
  | 'growth_plan';

export type GrowthStrategySectionStatus = 'pending' | 'approved' | 'changes_requested';

export interface GrowthStrategySectionReviewResponse {
  section: GrowthStrategySection;
  status: GrowthStrategySectionStatus;
  note?: string;
  reviewedAt?: string;
}

export interface GrowthStrategyReviewResponse {
  organizationId: string;
  productId: string;
  status: GrowthStrategyReviewStatus;
  sectionReviews: GrowthStrategySectionReviewResponse[];
  overallNote?: string;
  approvedAt?: string;
  changesRequestedAt?: string;
  reviewedStrategyGeneratedAt?: string;
  createdAt?: string;
  updatedAt?: string;
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

// Sprint 13A foundation types — CRUD-only for now; the Campaign Planning UI
// itself belongs to later Sprint 13 steps.
export type CampaignStatus = 'draft' | 'planned' | 'approved' | 'active' | 'paused' | 'completed' | 'archived';

export type CampaignType =
  | 'awareness'
  | 'education'
  | 'consideration'
  | 'lead_generation'
  | 'conversion'
  | 'activation'
  | 'retention'
  | 'product_launch'
  | 'promotion'
  | 'evergreen'
  | 'custom';

export type CampaignPlanningSource = 'manual' | 'strategy_generated';

export interface CampaignStrategyReference {
  reviewedStrategyGeneratedAt?: string;
  strategyReviewId?: string;
}

export interface CampaignPlanningMetadata {
  source: CampaignPlanningSource;
  version: number;
}

// Sprint 13B foundation types — deriving/setting a goal is wired on the
// backend; the Campaign detail UI itself is deferred to Sprint 13E/13F.
export type CampaignGoalType =
  | 'awareness'
  | 'education'
  | 'consideration'
  | 'lead_generation'
  | 'conversion'
  | 'activation'
  | 'retention'
  | 'positioning'
  | 'differentiation'
  | 'buyer_enablement'
  | 'product_launch'
  | 'custom';

export type CampaignGoalSource = 'manual' | 'strategy';

export interface CampaignGoal {
  type: CampaignGoalType;
  title: string;
  description: string;
  priorityScore?: number;
  confidenceScore?: number;
  source: CampaignGoalSource;
  relatedStrategyObjectiveIds: string[];
  relatedFunnelStages: string[];
  relatedConversionActionIds: string[];
  successSignals: string[];
  warnings: string[];
}

// Sprint 13C foundation types — audience/channel mapping is wired on the
// backend; the Campaign detail UI itself is deferred to Sprint 13E/13F.
export type CampaignAudienceChannelSource = 'manual' | 'strategy';

export interface CampaignAudienceRecommendation {
  audienceSegmentId: string;
  label?: string;
  relevanceScore: number;
  confidenceScore: number;
  relatedGoalTypes: string[];
  relatedFunnelStages: string[];
  relatedChannelIds: string[];
  reasons: string[];
  warnings: string[];
}

export interface CampaignChannelRecommendation {
  channel: string;
  fitScore: number;
  confidenceScore: number;
  audienceSegmentIds: string[];
  relatedGoalTypes: string[];
  relatedFunnelStages: string[];
  reasons: string[];
  weaknesses: string[];
  warnings: string[];
}

export interface CampaignAudienceChannelMapping {
  audiences: CampaignAudienceRecommendation[];
  channels: CampaignChannelRecommendation[];
  primaryAudienceSegmentId?: string;
  primaryChannel?: string;
  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];
  source: CampaignAudienceChannelSource;
  generatedAt?: string;
}

// Sprint 13D foundation types — 30-day plan generation is wired on the
// backend; full plan/calendar visualization belongs to Sprint 13E.
export type CampaignActivityType =
  | 'seo'
  | 'blog'
  | 'landing_page'
  | 'social'
  | 'video'
  | 'email'
  | 'outbound'
  | 'community'
  | 'partnership'
  | 'paid_search'
  | 'paid_social'
  | 'conversion'
  | 'activation'
  | 'proof'
  | 'measurement';

export type CampaignActivityStatus = 'planned' | 'approved' | 'completed' | 'skipped';

export interface CampaignActivity {
  id: string;
  day: number;
  week: number;
  type: CampaignActivityType;
  title: string;
  objective: string;
  channel: string;
  audienceSegmentIds: string[];
  funnelStage: string;
  messagingPillarIds: string[];
  contentPillarIds: string[];
  keywordDirections: string[];
  contentFormat?: string;
  recommendedActions: string[];
  conversionDirection?: string;
  priorityScore: number;
  confidenceScore: number;
  dependencies: string[];
  successSignals: string[];
  status: CampaignActivityStatus;
  reasons: string[];
  warnings: string[];
}

export interface CampaignWeekPlan {
  week: number;
  days: number[];
  theme: string;
  objective: string;
  activityIds: string[];
  confidenceScore: number;
}

export interface CampaignPlanResult {
  durationDays: 30;
  weeks: CampaignWeekPlan[];
  activities: CampaignActivity[];
  topPriorityActivityIds: string[];
  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];
  generatedAt?: string;
}

// Sprint 13F foundation types — persisted 1:1 on the campaign, mirroring the
// Growth Strategy review architecture (12I) adapted for an embedded review.
export type CampaignReviewStatus = 'draft' | 'approved' | 'changes_requested';

export type CampaignReviewSection = 'goal' | 'audience_channels' | 'plan' | 'calendar';

export type CampaignSectionReviewStatus = 'pending' | 'approved' | 'changes_requested';

export interface CampaignSectionReview {
  section: CampaignReviewSection;
  status: CampaignSectionReviewStatus;
  note?: string;
  reviewedAt?: string;
}

export interface CampaignReview {
  status: CampaignReviewStatus;
  sectionReviews: CampaignSectionReview[];
  overallNote?: string;
  approvedAt?: string;
  changesRequestedAt?: string;
  reviewedPlanningVersion?: number;
  reviewedPlanGeneratedAt?: string;
}

export interface Campaign {
  id: string;
  organizationId: string;
  productId: string;
  name: string;
  slug: string;
  description?: string;
  status: CampaignStatus;
  type?: CampaignType;
  objectiveIds: string[];
  channelIds: string[];
  audienceSegmentIds: string[];
  funnelStages: string[];
  messagingPillarIds: string[];
  contentPillarIds: string[];
  acquisitionMotionIds: string[];
  conversionActionIds: string[];
  startDate?: string;
  endDate?: string;
  strategyReference?: CampaignStrategyReference;
  planningMetadata: CampaignPlanningMetadata;
  goal?: CampaignGoal;
  audienceChannelMapping?: CampaignAudienceChannelMapping;
  plan?: CampaignPlanResult;
  review: CampaignReview;
  createdBy: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Sprint 14A foundation types — preview-only, not persisted on Campaign yet
// (14B prioritization may refine/reorder ideas before any calendar work).
export type ContentIdeaType =
  | 'educational'
  | 'problem_solution'
  | 'use_case'
  | 'comparison'
  | 'differentiation'
  | 'buyer_enablement'
  | 'conversion_support'
  | 'activation'
  | 'thought_leadership'
  | 'faq'
  | 'proof'
  | 'repurpose';

export interface ContentIdea {
  id: string;
  title: string;
  angle: string;
  type: ContentIdeaType;
  priorityScore: number;
  confidenceScore: number;
  funnelStage: string;
  channel: string;
  formatDirection: string;
  audienceSegmentIds: string[];
  messagingPillarIds: string[];
  contentPillarIds: string[];
  campaignActivityIds: string[];
  keywords: string[];
  objective: string;
  suggestedCTA?: string;
  reasons: string[];
  warnings: string[];
}

export interface ContentIdeaResult {
  ideas: ContentIdea[];
  primaryIdeaIds: string[];
  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];
  generatedAt: string;
}

// Sprint 14B foundation types — preview-only, not persisted (14C content
// pillars may further consolidate/refine topic structure).
export type ContentTopicTier = 'primary' | 'secondary' | 'experimental' | 'deferred';

export interface ContentTopic {
  id: string;
  title: string;
  tier: ContentTopicTier;
  priorityScore: number;
  confidenceScore: number;
  relatedIdeaIds: string[];
  audienceSegmentIds: string[];
  channels: string[];
  funnelStages: string[];
  contentPillarIds: string[];
  messagingPillarIds: string[];
  keywords: string[];
  intentTypes: string[];
  reasons: string[];
  weaknesses: string[];
  warnings: string[];
}

export interface TopicPrioritizationResult {
  topics: ContentTopic[];
  primaryTopicIds: string[];
  secondaryTopicIds: string[];
  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];
  generatedAt: string;
}

// Sprint 14C foundation types — preview-only, not persisted (14D-14F
// calendars will consume this pillar result).
export type CampaignContentPillarTier = 'primary' | 'supporting' | 'experimental';

export interface CampaignContentPillar {
  id: string;
  title: string;
  theme: string;
  tier: CampaignContentPillarTier;
  priorityScore: number;
  confidenceScore: number;
  topicIds: string[];
  audienceSegmentIds: string[];
  channels: string[];
  funnelStages: string[];
  messagingPillarIds: string[];
  strategyContentPillarIds: string[];
  keywords: string[];
  intentTypes: string[];
  purpose: string;
  reasons: string[];
  weaknesses: string[];
  warnings: string[];
}

export interface ContentPillarPlanResult {
  pillars: CampaignContentPillar[];
  primaryPillarIds: string[];
  supportingPillarIds: string[];
  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];
  generatedAt: string;
}

// Sprint 14D foundation types — preview-only, not persisted (14E/14F/14G
// may refine cross-channel scheduling before any persistent workflow).
export type BlogCalendarItemType =
  | 'educational'
  | 'guide'
  | 'use_case'
  | 'comparison'
  | 'differentiation'
  | 'buyer_enablement'
  | 'faq'
  | 'conversion_support'
  | 'activation'
  | 'thought_leadership';

export type BlogCalendarItemStatus = 'planned' | 'approved' | 'completed' | 'skipped';

export interface BlogCalendarItem {
  id: string;
  day: number;
  week: number;
  title: string;
  type: BlogCalendarItemType;
  pillarId: string;
  topicId: string;
  priorityScore: number;
  confidenceScore: number;
  funnelStage: string;
  audienceSegmentIds: string[];
  primaryKeyword?: string;
  supportingKeywords: string[];
  intentTypes: string[];
  objective: string;
  angle: string;
  suggestedCTA?: string;
  relatedCampaignActivityIds: string[];
  dependencies: string[];
  successSignals: string[];
  status: BlogCalendarItemStatus;
  reasons: string[];
  warnings: string[];
}

export interface BlogWeekPlan {
  week: number;
  days: number[];
  theme: string;
  itemIds: string[];
  confidenceScore: number;
}

export interface BlogCalendarResult {
  durationDays: 30;
  weeks: BlogWeekPlan[];
  items: BlogCalendarItem[];
  topPriorityItemIds: string[];
  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];
  generatedAt: string;
}

// Sprint 14E foundation types — preview-only, not persisted (14G will
// create cross-channel repurposing relationships).
export type SocialPlatform = 'linkedin' | 'facebook' | 'instagram' | 'x' | 'generic_social';

export type SocialContentType =
  | 'educational'
  | 'problem_insight'
  | 'use_case'
  | 'differentiation'
  | 'comparison'
  | 'buyer_enablement'
  | 'proof'
  | 'faq'
  | 'conversion_support'
  | 'activation'
  | 'thought_leadership'
  | 'blog_promotion'
  | 'engagement';

export type SocialCalendarItemStatus = 'planned' | 'approved' | 'completed' | 'skipped';

export interface SocialCalendarItem {
  id: string;
  day: number;
  week: number;
  platform: SocialPlatform;
  type: SocialContentType;
  title: string;
  angle: string;
  priorityScore: number;
  confidenceScore: number;
  pillarId: string;
  topicId?: string;
  funnelStage: string;
  audienceSegmentIds: string[];
  messagingPillarIds: string[];
  keywords: string[];
  sourceBlogItemId?: string;
  relatedCampaignActivityIds: string[];
  suggestedCTA?: string;
  recommendedFormat: string;
  dependencies: string[];
  successSignals: string[];
  status: SocialCalendarItemStatus;
  reasons: string[];
  warnings: string[];
}

export interface SocialWeekPlan {
  week: number;
  days: number[];
  theme: string;
  itemIds: string[];
  confidenceScore: number;
}

export interface SocialCalendarResult {
  durationDays: 30;
  weeks: SocialWeekPlan[];
  items: SocialCalendarItem[];
  topPriorityItemIds: string[];
  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];
  generatedAt: string;
}

// Sprint 14F foundation types — preview-only, not persisted (14G will
// consolidate cross-channel repurposing relationships).
export type VideoContentType =
  | 'educational'
  | 'explainer'
  | 'problem_solution'
  | 'use_case'
  | 'comparison'
  | 'differentiation'
  | 'buyer_enablement'
  | 'faq'
  | 'conversion_support'
  | 'activation'
  | 'thought_leadership'
  | 'blog_repurpose'
  | 'social_repurpose';

export type VideoFormatDirection =
  | 'short_video'
  | 'long_video'
  | 'explainer_video'
  | 'demo_direction'
  | 'tutorial_direction'
  | 'talking_head_direction'
  | 'screen_walkthrough_direction'
  | 'faq_video'
  | 'comparison_video';

export type VideoCalendarItemStatus = 'planned' | 'approved' | 'completed' | 'skipped';

export interface VideoCalendarItem {
  id: string;
  day: number;
  week: number;
  title: string;
  type: VideoContentType;
  formatDirection: VideoFormatDirection;
  angle: string;
  priorityScore: number;
  confidenceScore: number;
  pillarId: string;
  topicId?: string;
  funnelStage: string;
  audienceSegmentIds: string[];
  messagingPillarIds: string[];
  keywords: string[];
  sourceBlogItemId?: string;
  sourceSocialItemId?: string;
  relatedCampaignActivityIds: string[];
  suggestedCTA?: string;
  dependencies: string[];
  successSignals: string[];
  status: VideoCalendarItemStatus;
  reasons: string[];
  warnings: string[];
}

export interface VideoWeekPlan {
  week: number;
  days: number[];
  theme: string;
  itemIds: string[];
  confidenceScore: number;
}

export interface VideoCalendarResult {
  durationDays: 30;
  weeks: VideoWeekPlan[];
  items: VideoCalendarItem[];
  topPriorityItemIds: string[];
  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];
  generatedAt: string;
}

// Sprint 14G — cross-channel repurposing plan. Consolidates 14D/14E/14F
// calendars into explicit source→target relationships; preview-only.
export type RepurposingSourceType = 'blog' | 'social' | 'video' | 'campaign_activity';

export type RepurposingTargetType = 'blog' | 'social' | 'video';

export type RepurposingActionType = 'summarize' | 'expand' | 'adapt' | 'extract' | 'promote' | 'sequence' | 'reframe';

export interface RepurposingItem {
  id: string;
  sourceType: RepurposingSourceType;
  sourceId: string;
  sourceTitle: string;
  targetType: RepurposingTargetType;
  actionType: RepurposingActionType;
  targetTitle: string;
  targetFormatDirection: string;
  priorityScore: number;
  confidenceScore: number;
  pillarId?: string;
  topicId?: string;
  funnelStage: string;
  audienceSegmentIds: string[];
  messagingPillarIds: string[];
  keywords: string[];
  sourceDay?: number;
  recommendedTargetDay?: number;
  dependencyIds: string[];
  suggestedCTA?: string;
  isExistingLinkage: boolean;
  reasons: string[];
  warnings: string[];
}

export interface RepurposingChain {
  id: string;
  title: string;
  sourceItemId: string;
  repurposingItemIds: string[];
  channels: string[];
  funnelStages: string[];
  priorityScore: number;
  confidenceScore: number;
  reasons: string[];
}

export interface RepurposingPlanResult {
  items: RepurposingItem[];
  chains: RepurposingChain[];
  topPriorityItemIds: string[];
  primaryChainIds: string[];
  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];
  generatedAt: string;
}

// Sprint 15C — blog draft generation. One paid AI call per explicit
// Generate/Regenerate action; never persisted, never auto-triggered.
export interface BlogGenerationOptions {
  language?: string;
  minWords?: number;
  maxWords?: number;
  outputFormat?: 'markdown' | 'plain_text';
}

export interface BlogDraftUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface BlogDraftCost {
  currency: 'USD';
  estimated: number;
}

export interface BlogDraftSourceContext {
  strategyGeneratedAt?: string;
  campaignPlanningVersion?: number;
  sourceIds?: string[];
}

export interface BlogDraftResult {
  id: string;
  kind: 'blog';
  blogCalendarItemId: string;
  title: string;
  content: string;
  format: 'markdown' | 'plain_text';
  wordCount: number;
  provider: string;
  model: string;
  usage: BlogDraftUsage;
  cost?: BlogDraftCost;
  promptVersion: string;
  sourceContext: BlogDraftSourceContext;
  warnings: string[];
  generatedAt: string;
  // 15J — persisted version identity.
  artifactId: string;
  versionId: string;
  version: number;
}

// Sprint 15D — LinkedIn draft generation. Only explicit `linkedin` items,
// or an explicit user choice on a `generic_social` item, are eligible.
export type LinkedInTone = 'professional' | 'conversational' | 'thought_leadership';
export type LinkedInLength = 'short' | 'medium' | 'long';

export interface LinkedInGenerationOptions {
  language?: string;
  tone?: LinkedInTone;
  length?: LinkedInLength;
  includeCTA?: boolean;
  includeHashtags?: boolean;
  maxHashtags?: number;
}

export interface LinkedInDraftUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface LinkedInDraftCost {
  currency: 'USD';
  estimated: number;
}

export interface LinkedInDraftSourceContext {
  strategyGeneratedAt?: string;
  campaignPlanningVersion?: number;
  sourceIds?: string[];
}

export interface LinkedInDraftResult {
  id: string;
  kind: 'linkedin';
  socialCalendarItemId: string;
  content: string;
  characterCount: number;
  wordCount: number;
  tone: string;
  length: string;
  provider: string;
  model: string;
  usage: LinkedInDraftUsage;
  cost?: LinkedInDraftCost;
  promptVersion: string;
  sourceContext: LinkedInDraftSourceContext;
  warnings: string[];
  generatedAt: string;
  // 15J — persisted version identity.
  artifactId: string;
  versionId: string;
  version: number;
}

// Sprint 15E — X draft generation. Same explicit-target eligibility rule
// as LinkedIn (15D): a `generic_social` item is only ever generated as X
// because the user explicitly chose it, never because the planner assumed it.
export type XMode = 'single_post' | 'thread';
export type XTone = 'concise' | 'professional' | 'conversational' | 'thought_leadership';

export interface XGenerationOptions {
  language?: string;
  mode?: XMode;
  tone?: XTone;
  includeCTA?: boolean;
  includeHashtags?: boolean;
  maxHashtags?: number;
  threadMaxPosts?: number;
}

export interface XDraftUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface XDraftCost {
  currency: 'USD';
  estimated: number;
}

export interface XDraftSourceContext {
  strategyGeneratedAt?: string;
  campaignPlanningVersion?: number;
  sourceIds?: string[];
}

export interface XDraftResult {
  id: string;
  kind: 'x';
  socialCalendarItemId: string;
  mode: XMode;
  content?: string;
  posts?: string[];
  characterCount?: number;
  postCharacterCounts?: number[];
  wordCount: number;
  tone: string;
  provider: string;
  model: string;
  usage: XDraftUsage;
  cost?: XDraftCost;
  promptVersion: string;
  sourceContext: XDraftSourceContext;
  warnings: string[];
  generatedAt: string;
  // 15J — persisted version identity.
  artifactId: string;
  versionId: string;
  version: number;
}

// Sprint 15F — Facebook draft generation. Same explicit-target eligibility
// rule as LinkedIn/X: a `generic_social` item is only ever generated as
// Facebook because the user explicitly chose it.
export type FacebookTone = 'professional' | 'conversational' | 'friendly' | 'educational' | 'thought_leadership';
export type FacebookLength = 'short' | 'medium' | 'long';

export interface FacebookGenerationOptions {
  language?: string;
  tone?: FacebookTone;
  length?: FacebookLength;
  includeCTA?: boolean;
  includeHashtags?: boolean;
  maxHashtags?: number;
}

export interface FacebookDraftUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface FacebookDraftCost {
  currency: 'USD';
  estimated: number;
}

export interface FacebookDraftSourceContext {
  strategyGeneratedAt?: string;
  campaignPlanningVersion?: number;
  sourceIds?: string[];
}

export interface FacebookDraftResult {
  id: string;
  kind: 'facebook';
  socialCalendarItemId: string;
  content: string;
  characterCount: number;
  wordCount: number;
  tone: string;
  length: string;
  provider: string;
  model: string;
  usage: FacebookDraftUsage;
  cost?: FacebookDraftCost;
  promptVersion: string;
  sourceContext: FacebookDraftSourceContext;
  warnings: string[];
  generatedAt: string;
  // 15J — persisted version identity.
  artifactId: string;
  versionId: string;
  version: number;
}

// Sprint 15G — Instagram caption generation. Caption copy only — no image,
// carousel, Reel, or Story asset generation. Same explicit-target
// eligibility rule as LinkedIn/X/Facebook.
export type InstagramTone = 'conversational' | 'friendly' | 'professional' | 'educational' | 'inspirational';
export type InstagramLength = 'short' | 'medium' | 'long';

export interface InstagramGenerationOptions {
  language?: string;
  tone?: InstagramTone;
  length?: InstagramLength;
  includeCTA?: boolean;
  includeHashtags?: boolean;
  maxHashtags?: number;
  includeEmojis?: boolean;
  maxEmojis?: number;
}

export interface InstagramCaptionUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface InstagramCaptionCost {
  currency: 'USD';
  estimated: number;
}

export interface InstagramCaptionSourceContext {
  strategyGeneratedAt?: string;
  campaignPlanningVersion?: number;
  sourceIds?: string[];
}

export interface InstagramCaptionResult {
  id: string;
  kind: 'instagram';
  socialCalendarItemId: string;
  content: string;
  characterCount: number;
  wordCount: number;
  tone: string;
  length: string;
  hashtagCount: number;
  emojiCount: number;
  provider: string;
  model: string;
  usage: InstagramCaptionUsage;
  cost?: InstagramCaptionCost;
  promptVersion: string;
  sourceContext: InstagramCaptionSourceContext;
  warnings: string[];
  generatedAt: string;
  // 15J — persisted version identity.
  artifactId: string;
  versionId: string;
  version: number;
}

// Sprint 15H — newsletter draft generation. No dedicated Newsletter
// Calendar exists — a newsletter is generated from one explicit,
// server-validated planning source (a real blog item, topic, or pillar).
export type NewsletterSourceType = 'blog_calendar_item' | 'content_topic' | 'content_pillar';
export type NewsletterTone = 'professional' | 'conversational' | 'educational' | 'thought_leadership';
export type NewsletterLength = 'short' | 'medium' | 'long';

export interface NewsletterGenerationOptions {
  language?: string;
  tone?: NewsletterTone;
  length?: NewsletterLength;
  includeSubjectLine?: boolean;
  includePreheader?: boolean;
  includeCTA?: boolean;
  outputFormat?: 'markdown' | 'plain_text';
}

export interface NewsletterDraftUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface NewsletterDraftCost {
  currency: 'USD';
  estimated: number;
}

export interface NewsletterDraftSourceContext {
  strategyGeneratedAt?: string;
  campaignPlanningVersion?: number;
  sourceIds?: string[];
}

export interface NewsletterDraftResult {
  id: string;
  kind: 'newsletter';
  sourceType: NewsletterSourceType;
  sourceId: string;
  subjectLine?: string;
  preheader?: string;
  content: string;
  format: 'markdown' | 'plain_text';
  wordCount: number;
  characterCount: number;
  tone: string;
  length: string;
  provider: string;
  model: string;
  usage: NewsletterDraftUsage;
  cost?: NewsletterDraftCost;
  promptVersion: string;
  sourceContext: NewsletterDraftSourceContext;
  warnings: string[];
  generatedAt: string;
  // 15J — persisted version identity.
  artifactId: string;
  versionId: string;
  version: number;
}

// Sprint 15I — video script generation. Script planning copy only — no
// video/media/voiceover/avatar generation. Must originate from a real
// reconstructed 14F VideoCalendarItem, never an arbitrary frontend brief.
export type VideoScriptTone = 'professional' | 'conversational' | 'educational' | 'energetic' | 'thought_leadership';
export type VideoScriptDuration = 'short' | 'medium' | 'long';

export interface VideoScriptGenerationOptions {
  language?: string;
  tone?: VideoScriptTone;
  duration?: VideoScriptDuration;
  includeCTA?: boolean;
  includeHook?: boolean;
  includeSceneDirections?: boolean;
  outputFormat?: 'markdown' | 'plain_text';
}

export interface VideoScriptScene {
  order: number;
  heading?: string;
  narration: string;
  visualDirection?: string;
}

export interface VideoScriptDraftUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface VideoScriptDraftCost {
  currency: 'USD';
  estimated: number;
}

export interface VideoScriptDraftSourceContext {
  strategyGeneratedAt?: string;
  campaignPlanningVersion?: number;
  sourceIds?: string[];
}

export interface VideoScriptDraftResult {
  id: string;
  kind: 'video_script';
  videoCalendarItemId: string;
  title: string;
  hook?: string;
  script: string;
  scenes?: VideoScriptScene[];
  estimatedWordCount: number;
  estimatedDurationSeconds: number;
  tone: string;
  duration: string;
  format: 'markdown' | 'plain_text';
  provider: string;
  model: string;
  usage: VideoScriptDraftUsage;
  cost?: VideoScriptDraftCost;
  promptVersion: string;
  sourceContext: VideoScriptDraftSourceContext;
  warnings: string[];
  generatedAt: string;
  // 15J — persisted version identity.
  artifactId: string;
  versionId: string;
  version: number;
}

// Sprint 15J — content versioning. A ContentArtifact is the stable logical
// identity for one generated content lineage; a ContentVersion is an
// immutable snapshot produced by one successful generation.
export type ContentGenerationKind = 'blog' | 'linkedin' | 'x' | 'facebook' | 'instagram' | 'newsletter' | 'video_script';

export interface ContentVersionUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface ContentVersionCost {
  currency: 'USD';
  estimated: number;
}

export interface ContentVersionSourceContext {
  strategyGeneratedAt?: string;
  campaignPlanningVersion?: number;
  sourceIds?: string[];
}

export interface ContentVersionScene {
  order: number;
  heading?: string;
  narration: string;
  visualDirection?: string;
}

export interface ContentVersionPayload {
  title?: string;
  content?: string;
  format?: string;
  subjectLine?: string;
  preheader?: string;
  posts?: string[];
  postCharacterCounts?: number[];
  hook?: string;
  scenes?: ContentVersionScene[];
  mode?: string;
  wordCount?: number;
  characterCount?: number;
  estimatedWordCount?: number;
  estimatedDurationSeconds?: number;
  hashtagCount?: number;
  emojiCount?: number;
}

export interface ContentVersionGenerationMetadata {
  provider: string;
  model: string;
  promptVersion: string;
  usage?: ContentVersionUsage;
  cost?: ContentVersionCost;
  sourceContext?: ContentVersionSourceContext;
  warnings: string[];
  generatedAt: string;
}

export interface ContentVersionGenerationOptions {
  language?: string;
  tone?: string;
  length?: string;
  duration?: string;
  mode?: string;
  outputFormat?: string;
  includeCTA?: boolean;
  includeHashtags?: boolean;
  includeEmojis?: boolean;
  includeSubjectLine?: boolean;
  includePreheader?: boolean;
  includeHook?: boolean;
  includeSceneDirections?: boolean;
  maxHashtags?: number;
  maxEmojis?: number;
  threadMaxPosts?: number;
}

export interface ContentVersionSourceSnapshot {
  title?: string;
  type?: string;
  pillarId?: string;
  topicId?: string;
}

export interface ContentVersionGroundingEvidenceSnapshot {
  productName?: string;
  productCategory?: string;
  productDescription?: string;
  valueProposition?: string;
  capabilities: string[];
  useCases: string[];
  differentiators: string[];
  pains: string[];
  goals: string[];
  objections: string[];
  proofPoints: string[];
  facts: string[];
  campaignGoal?: string;
  funnelStage?: string;
  suggestedCTA?: string;
  keywords: string[];
  topic?: string;
  pillar?: string;
}

export type GroundingClaimClassification = 'supported' | 'unsupported' | 'uncertain' | 'non_factual';

export type ContentGroundingStatus = 'grounded' | 'partially_grounded' | 'insufficient_evidence';

export interface GroundingClaim {
  id: string;
  text: string;
  classification: GroundingClaimClassification;
  evidenceRefs: string[];
  reason: string;
}

export interface ContentGroundingSummary {
  status: ContentGroundingStatus;
  score: number;
  unsupportedClaimCount: number;
  uncertainClaimCount: number;
}

export interface ContentGroundingResult extends ContentGroundingSummary {
  contentVersionId: string;
  artifactId: string;
  organizationId: string;
  productId: string;
  campaignId: string;
  claims: GroundingClaim[];
  supportedClaimCount: number;
  warnings: string[];
  checkedAt: string;
}

export type FactValidationClaimClassification = 'validated' | 'needs_review' | 'invalid' | 'non_factual';

export type ContentFactValidationStatus = 'validated' | 'needs_review' | 'failed_validation';

export type FactValidationClaimSeverity = 'low' | 'medium' | 'high';

export type FactValidationClaimFactType =
  | 'product_fact'
  | 'capability'
  | 'number'
  | 'pricing'
  | 'comparison'
  | 'proof'
  | 'customer_result'
  | 'integration'
  | 'certification'
  | 'guarantee'
  | 'market_claim'
  | 'other';

export interface FactValidationClaim {
  id: string;
  text: string;
  classification: FactValidationClaimClassification;
  factType: FactValidationClaimFactType;
  evidenceRefs: string[];
  reason: string;
  severity: FactValidationClaimSeverity;
}

export interface ContentFactValidationSummary {
  status: ContentFactValidationStatus;
  score: number;
  reviewClaimCount: number;
  failedClaimCount: number;
}

export interface ContentFactValidationResult extends ContentFactValidationSummary {
  contentVersionId: string;
  artifactId: string;
  organizationId: string;
  productId: string;
  campaignId: string;
  claims: FactValidationClaim[];
  validatedClaimCount: number;
  warnings: string[];
  validatedAt: string;
}

export type SeoReviewCheckType =
  | 'title'
  | 'keyword_usage'
  | 'keyword_stuffing'
  | 'heading_structure'
  | 'introduction'
  | 'content_depth'
  | 'topic_alignment'
  | 'funnel_alignment'
  | 'cta_alignment'
  | 'duplicate_heading'
  | 'excessive_repetition'
  | 'metadata_readiness'
  | 'other';

export type SeoReviewCheckClassification = 'passed' | 'warning' | 'failed' | 'not_applicable';

export type ContentSeoReviewStatus = 'optimized' | 'needs_improvement' | 'poor';

export interface SeoReviewCheck {
  id: string;
  type: SeoReviewCheckType;
  classification: SeoReviewCheckClassification;
  score?: number;
  reason: string;
  evidence?: string[];
}

export interface ContentSeoReviewSummary {
  status: ContentSeoReviewStatus;
  score: number;
  warningCount: number;
  failedCount: number;
}

export interface ContentSeoReviewResult extends ContentSeoReviewSummary {
  contentVersionId: string;
  artifactId: string;
  organizationId: string;
  productId: string;
  campaignId: string;
  checks: SeoReviewCheck[];
  passedCount: number;
  warnings: string[];
  reviewedAt: string;
}

export type ReadabilityCheckType =
  | 'sentence_length'
  | 'paragraph_length'
  | 'sentence_variety'
  | 'paragraph_structure'
  | 'heading_support'
  | 'list_usage'
  | 'repetition'
  | 'complexity'
  | 'passive_voice'
  | 'scannability'
  | 'opening_clarity'
  | 'closing_clarity'
  | 'other';

export type ReadabilityCheckClassification = 'passed' | 'warning' | 'failed' | 'not_applicable';

export type ContentReadabilityStatus = 'readable' | 'needs_improvement' | 'difficult';

export interface ReadabilityCheck {
  id: string;
  type: ReadabilityCheckType;
  classification: ReadabilityCheckClassification;
  score?: number;
  reason: string;
  evidence?: string[];
}

export interface ContentReadabilityMetrics {
  wordCount: number;
  sentenceCount: number;
  paragraphCount: number;
  averageSentenceWords: number;
  averageParagraphWords: number;
  longSentenceCount: number;
  veryLongSentenceCount: number;
  longParagraphCount: number;
  passiveVoiceApproxCount?: number;
}

export interface ContentReadabilitySummary {
  status: ContentReadabilityStatus;
  score: number;
  warningCount: number;
  failedCount: number;
}

export interface ContentReadabilityResult extends ContentReadabilitySummary {
  contentVersionId: string;
  artifactId: string;
  organizationId: string;
  productId: string;
  campaignId: string;
  checks: ReadabilityCheck[];
  passedCount: number;
  metrics: ContentReadabilityMetrics;
  warnings: string[];
  reviewedAt: string;
}

export type BrandVoiceCheckType =
  | 'requested_tone'
  | 'style_alignment'
  | 'avoid_rules'
  | 'hype'
  | 'professionalism'
  | 'conversationality'
  | 'clarity'
  | 'consistency'
  | 'unsupported_voice_claims'
  | 'platform_fit'
  | 'other';

export type BrandVoiceCheckClassification = 'passed' | 'warning' | 'failed' | 'not_applicable';

export type ContentBrandVoiceStatus = 'aligned' | 'needs_adjustment' | 'misaligned';

export interface BrandVoiceCheck {
  id: string;
  type: BrandVoiceCheckType;
  classification: BrandVoiceCheckClassification;
  score?: number;
  reason: string;
  evidence?: string[];
}

export interface ContentBrandVoiceSummary {
  status: ContentBrandVoiceStatus;
  score: number;
  warningCount: number;
  failedCount: number;
}

export interface ContentBrandVoiceResult extends ContentBrandVoiceSummary {
  contentVersionId: string;
  artifactId: string;
  organizationId: string;
  productId: string;
  campaignId: string;
  checks: BrandVoiceCheck[];
  passedCount: number;
  warnings: string[];
  reviewedAt: string;
}

export type OriginalityCheckType =
  | 'internal_repetition'
  | 'sentence_duplication'
  | 'paragraph_duplication'
  | 'phrase_repetition'
  | 'cross_version_similarity'
  | 'cross_artifact_similarity'
  | 'template_repetition'
  | 'other';

export type OriginalityCheckClassification = 'passed' | 'warning' | 'failed' | 'not_applicable';

export type ContentOriginalityStatus = 'original' | 'needs_review' | 'highly_repetitive';

export interface OriginalityCheck {
  id: string;
  type: OriginalityCheckType;
  classification: OriginalityCheckClassification;
  score?: number;
  reason: string;
  matchedVersionId?: string;
  matchedArtifactId?: string;
  evidence?: string[];
}

export interface ContentOriginalitySummary {
  status: ContentOriginalityStatus;
  score: number;
  duplicateSentenceCount: number;
  crossContentMatchCount: number;
}

export interface ContentOriginalityResult extends ContentOriginalitySummary {
  contentVersionId: string;
  artifactId: string;
  organizationId: string;
  productId: string;
  campaignId: string;
  checks: OriginalityCheck[];
  passedCount: number;
  warningCount: number;
  failedCount: number;
  duplicateParagraphCount: number;
  warnings: string[];
  reviewedAt: string;
}

export interface ContentArtifact {
  id: string;
  kind: ContentGenerationKind;
  sourceType: string;
  sourceId: string;
  latestVersion: number;
  latestVersionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContentVersionSummary {
  id: string;
  version: number;
  kind: ContentGenerationKind;
  generatedAt: string;
  provider: string;
  model: string;
  wordCount?: number;
  characterCount?: number;
  cost?: ContentVersionCost;
  warningsCount: number;
  grounding?: ContentGroundingSummary;
  factValidation?: ContentFactValidationSummary;
  seoReview?: ContentSeoReviewSummary;
  readability?: ContentReadabilitySummary;
  brandVoice?: ContentBrandVoiceSummary;
  originality?: ContentOriginalitySummary;
}

export interface ContentVersionDetail extends ContentVersionSummary {
  artifactId: string;
  sourceType: string;
  sourceId: string;
  payload: ContentVersionPayload;
  generationMetadata: ContentVersionGenerationMetadata;
  generationOptions?: ContentVersionGenerationOptions;
  sourceSnapshot?: ContentVersionSourceSnapshot;
  groundingEvidenceSnapshot?: ContentVersionGroundingEvidenceSnapshot;
  isCurrentPlanningVersion?: boolean;
}

export interface ArtifactWithLatestVersion {
  artifact: ContentArtifact;
  latestVersion?: ContentVersionDetail;
}
