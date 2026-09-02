export interface WebsiteFetchResult {
  finalUrl: string;
  statusCode: number;
  contentType?: string;
  body: string;
  contentLength?: number;
  fetchedAt: Date;
}
