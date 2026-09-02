export type WebsitePageCategory =
  | 'about'
  | 'features'
  | 'product'
  | 'solutions'
  | 'pricing'
  | 'faq'
  | 'docs'
  | 'use-cases'
  | 'customers'
  | 'integrations'
  | 'other';

export interface WebsiteDiscoveredPage {
  url: string;
  path: string;
  label?: string;
  category: WebsitePageCategory;
  score: number;
}

export interface WebsiteSelectedPage extends WebsiteDiscoveredPage {
  priority: number;
  selectionReason: string;
}
