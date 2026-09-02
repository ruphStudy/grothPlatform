import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  PayloadTooLargeException,
  RequestTimeoutException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WebsiteFetchResult } from './website-fetch.types';

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_BYTES = 2_000_000;
const USER_AGENT = 'GIP-WebsiteFetchService/1.0';
const ALLOWED_CONTENT_TYPES = ['text/html', 'text/plain', 'application/xhtml+xml'];

@Injectable()
export class WebsiteFetchService {
  private readonly logger = new Logger(WebsiteFetchService.name);

  constructor(private readonly configService: ConfigService) {}

  async fetchWebsite(rawUrl: string): Promise<WebsiteFetchResult> {
    const url = this.parseAndValidateUrl(rawUrl);
    const timeoutMs = this.getTimeoutMs();
    const maxBytes = this.getMaxBytes();

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      let response: Response;
      try {
        response = await fetch(url.toString(), {
          method: 'GET',
          redirect: 'follow',
          credentials: 'omit',
          signal: controller.signal,
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
          },
        });
      } catch (err) {
        if (timedOut) {
          throw new RequestTimeoutException('Website fetch timed out');
        }
        this.logger.warn(`Website fetch failed for ${url.toString()}: ${(err as Error).message}`);
        throw new ServiceUnavailableException('Failed to reach the website');
      }

      const contentType = response.headers.get('content-type');

      if (!this.isAllowedContentType(contentType)) {
        throw new UnsupportedMediaTypeException(`Unsupported content type: ${contentType}`);
      }

      if (!response.ok) {
        throw new BadGatewayException(`Website responded with status ${response.status}`);
      }

      let body: string;
      try {
        body = await this.readBodyWithLimit(response, maxBytes, controller);
      } catch (err) {
        if (err instanceof PayloadTooLargeException) {
          throw err;
        }
        if (timedOut) {
          throw new RequestTimeoutException('Website fetch timed out');
        }
        this.logger.warn(`Failed reading website body for ${url.toString()}: ${(err as Error).message}`);
        throw new ServiceUnavailableException('Failed to read website response');
      }

      const contentLengthHeader = response.headers.get('content-length');
      const parsedContentLength = contentLengthHeader ? Number(contentLengthHeader) : Buffer.byteLength(body, 'utf-8');

      return {
        finalUrl: response.url || url.toString(),
        statusCode: response.status,
        contentType: contentType ?? undefined,
        body,
        contentLength: Number.isFinite(parsedContentLength) ? parsedContentLength : undefined,
        fetchedAt: new Date(),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private parseAndValidateUrl(rawUrl: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new BadRequestException('Invalid URL');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException('Only http and https URLs are supported');
    }

    if (parsed.username || parsed.password) {
      throw new BadRequestException('URL must not contain embedded credentials');
    }

    return parsed;
  }

  private isAllowedContentType(contentType: string | null): boolean {
    if (!contentType) return true;
    const base = contentType.split(';')[0].trim().toLowerCase();
    return ALLOWED_CONTENT_TYPES.includes(base);
  }

  private async readBodyWithLimit(response: Response, maxBytes: number, controller: AbortController): Promise<string> {
    if (!response.body) {
      return '';
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      if (value) {
        receivedBytes += value.byteLength;
        if (receivedBytes > maxBytes) {
          controller.abort();
          reader.cancel().catch(() => undefined);
          throw new PayloadTooLargeException('Website response exceeded the maximum allowed size');
        }
        chunks.push(value);
      }
    }

    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf-8');
  }

  private getTimeoutMs(): number {
    const value = this.configService.get<string>('WEBSITE_FETCH_TIMEOUT_MS');
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
  }

  private getMaxBytes(): number {
    const value = this.configService.get<string>('WEBSITE_FETCH_MAX_BYTES');
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_BYTES;
  }
}
