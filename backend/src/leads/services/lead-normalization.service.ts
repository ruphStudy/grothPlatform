import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LeadConsentStatus, LeadCustomFields } from '../types/lead.types';

const DEFAULT_MAX_CUSTOM_FIELDS = 30;
const DEFAULT_MAX_CUSTOM_FIELD_VALUE_LENGTH = 2000;
const DEFAULT_MAX_NOTES_LENGTH = 5000;
const DEFAULT_MAX_URL_LENGTH = 2048;
const DEFAULT_MAX_UTM_LENGTH = 500;
const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

@Injectable()
export class LeadNormalizationService {
  constructor(private readonly configService: ConfigService) {}

  normalizeEmail(value?: string): string | undefined {
    const email = this.clean(value, 320)?.toLowerCase();
    if (!email) return undefined;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Email address is not valid.');
    return email;
  }

  normalizePhone(value?: string): string | undefined {
    const raw = this.clean(value, 40);
    if (!raw) return undefined;
    const phone = raw.replace(/[()\s.-]+/g, '');
    if (!/^\+?[0-9]{7,15}$/.test(phone)) throw new BadRequestException('Phone number is not valid.');
    return phone;
  }

  clean(value: unknown, maxLength: number): string | undefined {
    if (typeof value !== 'string') return undefined;
    const cleaned = value.replace(/\s+/g, ' ').trim();
    if (!cleaned) return undefined;
    return cleaned.slice(0, maxLength);
  }

  normalizeUrl(value?: string): string | undefined {
    const cleaned = this.clean(value, this.getMaxUrlLength());
    if (!cleaned) return undefined;
    let url: URL;
    try {
      url = new URL(cleaned);
    } catch {
      throw new BadRequestException('URL metadata must be a valid URL.');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new BadRequestException('URL metadata must use http or https.');
    return url.toString().slice(0, this.getMaxUrlLength());
  }

  normalizeUtm(value?: string): string | undefined {
    return this.clean(value, this.getMaxUtmLength());
  }

  normalizeCustomFields(value?: Record<string, unknown>): LeadCustomFields {
    if (!value) return {};
    const entries = Object.entries(value);
    if (entries.length > this.getMaxCustomFields()) throw new BadRequestException('Too many custom fields.');
    const result: LeadCustomFields = {};
    for (const [key, raw] of entries) {
      const cleanKey = this.clean(key, 80);
      if (!cleanKey || BLOCKED_KEYS.has(cleanKey)) throw new BadRequestException('Custom field key is not allowed.');
      if (typeof raw === 'string') result[cleanKey] = raw.slice(0, this.getMaxCustomFieldValueLength());
      else if (typeof raw === 'number' && Number.isFinite(raw)) result[cleanKey] = raw;
      else if (typeof raw === 'boolean') result[cleanKey] = raw;
      else throw new BadRequestException('Custom field values must be string, number, or boolean.');
    }
    return result;
  }

  normalizeConsentStatus(value?: LeadConsentStatus): LeadConsentStatus {
    return value ?? 'unknown';
  }

  normalizeNotes(value?: string): string | undefined {
    return this.clean(value, this.getMaxNotesLength());
  }

  private getMaxCustomFields(): number {
    return this.getEnvNumber('LEAD_MAX_CUSTOM_FIELDS', DEFAULT_MAX_CUSTOM_FIELDS);
  }

  private getMaxCustomFieldValueLength(): number {
    return this.getEnvNumber('LEAD_MAX_CUSTOM_FIELD_VALUE_LENGTH', DEFAULT_MAX_CUSTOM_FIELD_VALUE_LENGTH);
  }

  private getMaxNotesLength(): number {
    return this.getEnvNumber('LEAD_MAX_NOTES_LENGTH', DEFAULT_MAX_NOTES_LENGTH);
  }

  private getMaxUrlLength(): number {
    return this.getEnvNumber('LEAD_MAX_URL_LENGTH', DEFAULT_MAX_URL_LENGTH);
  }

  private getMaxUtmLength(): number {
    return this.getEnvNumber('LEAD_MAX_UTM_LENGTH', DEFAULT_MAX_UTM_LENGTH);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const parsed = Number(this.configService.get<string>(key));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
