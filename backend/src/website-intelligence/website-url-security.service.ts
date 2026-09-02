import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ipaddr from 'ipaddr.js';
import { promises as dns } from 'node:dns';

const BLOCKED_DESTINATION_MESSAGE = 'Private or internal website destinations are not allowed';

// Explicitly-blocked hostnames beyond the generic localhost/*.localhost rule below,
// most notably cloud metadata endpoints that are commonly abused for SSRF.
const BLOCKED_HOSTNAMES = new Set(['metadata.google.internal', 'metadata.goog']);

/**
 * Validates that a website fetch destination is not a local/private/internal
 * network target, unless private fetching has been explicitly enabled for
 * development use (ALLOW_PRIVATE_WEBSITE_FETCH=true).
 *
 * NOTE: these are application-level SSRF checks (hostname/IP/DNS validation).
 * They reduce risk but are not a substitute for production network-level
 * egress controls (e.g. an outbound proxy/firewall restricting what this
 * process can reach). A malicious server could still change DNS answers
 * between our check and the actual connection (DNS rebinding); validating
 * immediately before each fetch/redirect narrows, but does not eliminate,
 * that window.
 */
@Injectable()
export class WebsiteUrlSecurityService {
  private readonly logger = new Logger(WebsiteUrlSecurityService.name);

  constructor(private readonly configService: ConfigService) {}

  isPrivateFetchAllowed(): boolean {
    const raw = this.configService.get<string>('ALLOW_PRIVATE_WEBSITE_FETCH');
    const value = (raw ?? '').trim().toLowerCase();
    return value === 'true' || value === '1';
  }

  async validateDestination(url: URL): Promise<void> {
    if (this.isPrivateFetchAllowed()) {
      return;
    }

    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');

    if (this.isBlockedHostname(hostname)) {
      throw new BadRequestException(BLOCKED_DESTINATION_MESSAGE);
    }

    if (ipaddr.isValid(hostname)) {
      this.assertPublicIp(hostname);
      return;
    }

    const addresses = await this.resolveHostname(hostname);
    for (const address of addresses) {
      this.assertPublicIp(address);
    }
  }

  private isBlockedHostname(hostname: string): boolean {
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
      return true;
    }
    return BLOCKED_HOSTNAMES.has(hostname);
  }

  private assertPublicIp(ip: string): void {
    let address: ReturnType<typeof ipaddr.process>;
    try {
      address = ipaddr.process(ip);
    } catch {
      throw new BadRequestException(BLOCKED_DESTINATION_MESSAGE);
    }

    // 'unicast' is the only publicly-routable classification ipaddr.js returns;
    // everything else (private, loopback, linkLocal, multicast, reserved,
    // uniqueLocal, carrierGradeNat, benchmarking, etc.) is internal/special-use.
    if (address.range() !== 'unicast') {
      throw new BadRequestException(BLOCKED_DESTINATION_MESSAGE);
    }
  }

  private async resolveHostname(hostname: string): Promise<string[]> {
    try {
      const records = await dns.lookup(hostname, { all: true, verbatim: true });
      return records.map((record) => record.address);
    } catch (err) {
      this.logger.warn(`DNS resolution failed for ${hostname}: ${(err as Error).message}`);
      throw new BadRequestException('Unable to resolve website hostname');
    }
  }
}
