import type { MarketCategoryResult } from '../../market-intelligence/types/market-category.types';
import type { ProductWebsiteKnowledge } from '../../website-intelligence/product-website-knowledge.types';

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

export interface AudienceSignalProductInput {
  name: string;
  shortDescription?: string;
  productType?: string;
  primaryGoal?: string;
  targetMarkets?: string[];
}

export interface AudienceSignalExtractionInput {
  product: AudienceSignalProductInput;
  websiteKnowledge?: ProductWebsiteKnowledge;
  marketCategory?: MarketCategoryResult;
  positioningAudienceSignals?: string[];
}
