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
  createdAt: string;
  updatedAt: string;
}
