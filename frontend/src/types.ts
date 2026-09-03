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
