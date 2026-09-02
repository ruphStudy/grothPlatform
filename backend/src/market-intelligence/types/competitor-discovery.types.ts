import type { MarketCategoryResult } from './market-category.types';

export interface CompetitorDiscoveryInput {
  productName: string;
  productWebsiteUrl?: string;
  marketCategory: MarketCategoryResult;
}

export interface CompetitorCandidate {
  name: string;
  url: string;
  domain: string;

  title?: string;
  snippet?: string;

  sourceQueries: string[];

  relevanceScore: number;

  reasons: string[];
}

export interface CompetitorDiscoveryResult {
  marketCategory?: string;

  queriesUsed: string[];

  competitors: CompetitorCandidate[];

  excludedResults: number;

  researchedAt: Date;

  warnings: string[];
}
