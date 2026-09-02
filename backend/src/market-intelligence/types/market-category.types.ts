import type { ProductWebsiteKnowledge } from '../../website-intelligence/product-website-knowledge.types';

export interface MarketCategoryProductInput {
  name: string;
  shortDescription?: string;
  productType?: string;
  primaryGoal?: string;
  targetMarkets?: string[];
}

export interface MarketCategoryDiscoveryInput {
  product: MarketCategoryProductInput;
  websiteKnowledge?: ProductWebsiteKnowledge;
}

export interface MarketCategoryEvidence {
  productMetadata: string[];
  websiteKnowledge: string[];
}

export interface MarketCategoryResult {
  primaryCategory?: string;
  subcategories: string[];
  categoryTerms: string[];
  descriptors: string[];
  confidenceScore: number;
  evidence: MarketCategoryEvidence;
  missingSignals: string[];
  warnings: string[];
}
