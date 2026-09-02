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
import { WebsiteUrlSecurityService } from './website-url-security.service';

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_BYTES = 2_000_000;
const DEFAULT_MAX_REDIRECTS = 5;
const USER_AGENT = 'GIP-WebsiteFetchService/1.0';
const ALLOWED_CONTENT_TYPES = ['text/html', 'text/plain', 'application/xhtml+xml'];
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

@Injectable()
export class WebsiteFetchService {
  private readonly logger = new Logger(WebsiteFetchService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly urlSecurityService: WebsiteUrlSecurityService,
  ) {}

  async fetchWebsite(rawUrl: string): Promise<WebsiteFetchResult> {
    let currentUrl = this.parseUrl(rawUrl);
    this.validateUrlSafety(currentUrl);

    const timeoutMs = this.getTimeoutMs();
    const maxBytes = this.getMaxBytes();
    const maxRedirects = this.getMaxRedirects();

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      await this.urlSecurityService.validateDestination(currentUrl);

      let response: Response;
      let redirectCount = 0;

      for (;;) {
        try {
          response = await fetch(currentUrl.toString(), {
            method: 'GET',
            redirect: 'manual',
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
          this.logger.warn(`Website fetch failed for ${currentUrl.toString()}: ${(err as Error).message}`);
          throw new ServiceUnavailableException('Failed to reach the website');
        }

        if (!REDIRECT_STATUS_CODES.has(response.status)) {
          break;
        }

        // Never read a redirect response body.
        if (response.body) {
          await response.body.cancel().catch(() => undefined);
        }

        redirectCount += 1;
        if (redirectCount > maxRedirects) {
          throw new BadGatewayException('Website fetch exceeded the maximum allowed redirects');
        }

        const location = response.headers.get('location');
        if (!location) {
          throw new BadGatewayException('Website redirect is missing a Location header');
        }

        let nextUrl: URL;
        try {
          nextUrl = new URL(location, currentUrl);
        } catch {
          throw new BadGatewayException('Website redirected to an invalid URL');
        }

        this.validateUrlSafety(nextUrl);
        await this.urlSecurityService.validateDestination(nextUrl);

        currentUrl = nextUrl;
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
        this.logger.warn(`Failed reading website body for ${currentUrl.toString()}: ${(err as Error).message}`);
        throw new ServiceUnavailableException('Failed to read website response');
      }

      const contentLengthHeader = response.headers.get('content-length');
      const parsedContentLength = contentLengthHeader ? Number(contentLengthHeader) : Buffer.byteLength(body, 'utf-8');

      return {
        finalUrl: currentUrl.toString(),
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

  private parseUrl(rawUrl: string): URL {
    try {
      return new URL(rawUrl);
    } catch {
      throw new BadRequestException('Invalid URL');
    }
  }

  private validateUrlSafety(url: URL): void {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new BadRequestException('Only http and https URLs are supported');
    }

    if (url.username || url.password) {
      throw new BadRequestException('URL must not contain embedded credentials');
    }
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

  private getMaxRedirects(): number {
    const value = this.configService.get<string>('WEBSITE_FETCH_MAX_REDIRECTS');
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_MAX_REDIRECTS;
  }
}
