export type ResearchFreshness = 'day' | 'week' | 'month' | 'year' | 'any';

export interface ResearchSearchRequest {
  query: string;
  maxResults?: number;
  language?: string;
  country?: string;
  freshness?: ResearchFreshness;
  domains?: string[];
  excludeDomains?: string[];
}

export interface ResearchSearchResult {
  title: string;
  url: string;
  snippet?: string;
  publishedAt?: Date;
  sourceDomain?: string;
}

export interface ResearchSearchResponse {
  provider: string;
  query: string;
  results: ResearchSearchResult[];
  searchedAt: Date;
}
