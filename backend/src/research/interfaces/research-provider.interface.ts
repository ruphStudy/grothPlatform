import type { ResearchSearchRequest, ResearchSearchResponse } from '../types/research.types';

export interface ResearchProvider {
  readonly name: string;
  search(request: ResearchSearchRequest): Promise<ResearchSearchResponse>;
}
