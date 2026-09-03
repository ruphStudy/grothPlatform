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

  generatedAt: Date;
}
