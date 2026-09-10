import type { EmailConnectionValidationResult, EmailCredential, EmailPlatform, EmailProviderCapabilities, EmailSendRequest, EmailSendResult, EmailSenderStatusResult } from '../types/email.types';

export interface EmailProvider {
  readonly platform: EmailPlatform;
  readonly name: string;

  isConfigured(): boolean;
  getCapabilities(): EmailProviderCapabilities;

  validateConnection(input: { credential: EmailCredential }): Promise<EmailConnectionValidationResult>;
  getSenderStatus?(input: { credential: EmailCredential; email?: string; domain: string; providerDomainId?: string }): Promise<EmailSenderStatusResult>;
  registerDomain?(input: { credential: EmailCredential; domain: string }): Promise<EmailSenderStatusResult>;
  send?(input: { credential: EmailCredential } & EmailSendRequest): Promise<EmailSendResult>;
}
