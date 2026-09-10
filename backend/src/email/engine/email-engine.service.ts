import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { EmailInputError, EmailProviderError } from '../errors/email.errors';
import { EMAIL_PROVIDER_REGISTRY_TOKEN } from '../providers/email-provider.tokens';
import type { EmailProvider } from '../providers/email-provider.interface';
import type { EmailConnectionValidationResult, EmailCredential, EmailPlatform, EmailProviderCapabilities, EmailSendRequest, EmailSendResult, EmailSenderStatusResult } from '../types/email.types';

@Injectable()
export class EmailEngineService {
  private readonly logger = new Logger(EmailEngineService.name);

  constructor(@Inject(EMAIL_PROVIDER_REGISTRY_TOKEN) private readonly providers: Map<EmailPlatform, EmailProvider>) {}

  resolveProvider(platform: EmailPlatform): EmailProvider {
    const provider = this.providers.get(platform);
    if (!provider || !provider.isConfigured()) throw new EmailInputError('email_provider_unsupported');
    return provider;
  }

  capabilities(platform: EmailPlatform): EmailProviderCapabilities {
    return this.resolveProvider(platform).getCapabilities();
  }

  async validateConnection(platform: EmailPlatform, credential: EmailCredential): Promise<EmailConnectionValidationResult> {
    const provider = this.resolveProvider(platform);
    return this.callOnce(platform, () => provider.validateConnection({ credential }));
  }

  async getSenderStatus(platform: EmailPlatform, input: { credential: EmailCredential; email?: string; domain: string; providerDomainId?: string }): Promise<EmailSenderStatusResult> {
    const provider = this.resolveProvider(platform);
    this.assertCapability(provider, 'domainVerification');
    if (!provider.getSenderStatus) throw new EmailInputError('email_capability_unsupported');
    return this.callOnce(platform, () => provider.getSenderStatus!(input));
  }

  async registerDomain(platform: EmailPlatform, input: { credential: EmailCredential; domain: string }): Promise<EmailSenderStatusResult> {
    const provider = this.resolveProvider(platform);
    this.assertCapability(provider, 'domainVerification');
    if (!provider.registerDomain) throw new EmailInputError('email_capability_unsupported');
    return this.callOnce(platform, () => provider.registerDomain!(input));
  }

  async send(platform: EmailPlatform, credential: EmailCredential, request: EmailSendRequest): Promise<EmailSendResult> {
    const provider = this.resolveProvider(platform);
    this.assertCapability(provider, 'sendEmail');
    if (request.html) this.assertCapability(provider, 'sendHtml');
    if (request.text) this.assertCapability(provider, 'sendText');
    if (request.replyTo) this.assertCapability(provider, 'customReplyTo');
    if (!provider.send) throw new EmailInputError('email_capability_unsupported');
    return this.callOnce(platform, () => provider.send!({ credential, ...request }));
  }

  private assertCapability(provider: EmailProvider, capability: keyof EmailProviderCapabilities) {
    if (!provider.getCapabilities()[capability]) throw new EmailInputError('email_capability_unsupported');
  }

  private async callOnce<T>(platform: EmailPlatform, fn: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await fn();
      this.logger.log(`platform=${platform} success=true latencyMs=${Date.now() - startedAt}`);
      return result;
    } catch (err) {
      this.logger.log(`platform=${platform} success=false latencyMs=${Date.now() - startedAt}`);
      if (err instanceof EmailInputError || err instanceof EmailProviderError || err instanceof BadRequestException) throw err;
      throw new EmailProviderError('email_provider_unavailable');
    }
  }
}
