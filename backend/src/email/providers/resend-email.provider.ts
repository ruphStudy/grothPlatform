import { Injectable } from '@nestjs/common';
import { EmailProviderError } from '../errors/email.errors';
import type { EmailProvider } from './email-provider.interface';
import type { EmailConnectionValidationResult, EmailProviderCapabilities, EmailSendResult, EmailSenderStatusResult } from '../types/email.types';

const RESEND_API = 'https://api.resend.com';

@Injectable()
export class ResendEmailProvider implements EmailProvider {
  readonly platform = 'resend' as const;
  readonly name = 'Resend';

  isConfigured(): boolean {
    return true;
  }

  getCapabilities(): EmailProviderCapabilities {
    return {
      sendEmail: true,
      sendHtml: true,
      sendText: true,
      customFrom: true,
      customReplyTo: true,
      domainVerification: true,
      fetchDeliveryStatus: false,
      webhookEvents: false,
      attachments: false,
      batchSend: false,
    };
  }

  async validateConnection(input: { credential: { apiKey: string } }): Promise<EmailConnectionValidationResult> {
    const response = await fetch(`${RESEND_API}/domains`, { headers: this.headers(input.credential.apiKey) });
    if (response.status === 401 || response.status === 403) return { status: 'invalid', providerName: this.name, errorCode: 'email_auth_failed' };
    if (!response.ok) return { status: 'error', providerName: this.name, errorCode: 'email_provider_unavailable' };
    return { status: 'active', providerName: this.name };
  }

  async registerDomain(input: { credential: { apiKey: string }; domain: string }): Promise<EmailSenderStatusResult> {
    const response = await fetch(`${RESEND_API}/domains`, {
      method: 'POST',
      headers: { ...this.headers(input.credential.apiKey), 'content-type': 'application/json' },
      body: JSON.stringify({ name: input.domain }),
    });
    const data = await this.safeJson(response);
    if (!response.ok) throw this.error(response.status);
    return this.toSenderStatus(data);
  }

  async getSenderStatus(input: { credential: { apiKey: string }; domain: string; providerDomainId?: string }): Promise<EmailSenderStatusResult> {
    const target = input.providerDomainId ? `${RESEND_API}/domains/${input.providerDomainId}` : `${RESEND_API}/domains`;
    const response = await fetch(target, { headers: this.headers(input.credential.apiKey) });
    const data = await this.safeJson(response);
    if (!response.ok) throw this.error(response.status);
    if (input.providerDomainId) return this.toSenderStatus(data);
    const domain = Array.isArray(data?.data) ? data.data.find((item: { name?: string }) => item.name === input.domain) : undefined;
    return domain ? this.toSenderStatus(domain) : { status: 'unknown', verificationDetails: { message: 'Domain not found at provider.' } };
  }

  async send(input: { credential: { apiKey: string }; from: { email: string; name?: string }; to: { email: string; name?: string }[]; replyTo?: string; subject: string; html?: string; text?: string; headers?: Record<string, string>; metadata?: Record<string, string> }): Promise<EmailSendResult> {
    const response = await fetch(`${RESEND_API}/emails`, {
      method: 'POST',
      headers: { ...this.headers(input.credential.apiKey), 'content-type': 'application/json' },
      body: JSON.stringify({
        from: input.from.name ? `${input.from.name} <${input.from.email}>` : input.from.email,
        to: input.to.map((item) => (item.name ? `${item.name} <${item.email}>` : item.email)),
        reply_to: input.replyTo,
        subject: input.subject,
        html: input.html,
        text: input.text,
        headers: input.headers,
        tags: input.metadata ? Object.entries(input.metadata).slice(0, 10).map(([name, value]) => ({ name, value })) : undefined,
      }),
    });
    const data = await this.safeJson(response);
    if (!response.ok) throw this.error(response.status);
    if (!data?.id) throw new EmailProviderError('email_send_failed');
    return { providerMessageId: String(data.id), status: 'accepted', providerName: this.name, acceptedAt: new Date() };
  }

  private headers(apiKey: string) {
    return { authorization: `Bearer ${apiKey}` };
  }

  private async safeJson(response: Response): Promise<any> {
    try {
      return await response.json();
    } catch {
      return {};
    }
  }

  private error(status: number) {
    if (status === 401 || status === 403) return new EmailProviderError('email_auth_failed');
    if (status === 429) return new EmailProviderError('email_rate_limited');
    return new EmailProviderError('email_provider_unavailable');
  }

  private toSenderStatus(data: any): EmailSenderStatusResult {
    const status = data?.status === 'verified' ? 'verified' : data?.status === 'failed' ? 'failed' : data?.status === 'not_started' || data?.status === 'pending' ? 'pending' : 'unknown';
    const records = Array.isArray(data?.records) ? data.records : Array.isArray(data?.dns_records) ? data.dns_records : [];
    return {
      status,
      providerDomainId: data?.id ? String(data.id) : undefined,
      verificationDetails: {
        dnsRecords: records.map((record: any) => ({ type: String(record.type || 'TXT').toUpperCase(), name: String(record.name || record.host || ''), value: String(record.value || ''), priority: record.priority === undefined ? undefined : Number(record.priority) })).filter((record: any) => ['TXT', 'CNAME', 'MX'].includes(record.type) && record.name && record.value),
      },
    };
  }
}
