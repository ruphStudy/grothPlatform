import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { mkdir, stat, writeFile } from 'fs/promises';
import { dirname, join } from 'path';

export interface PutObjectInput {
  organizationId: string;
  productId?: string;
  category: 'creative' | 'brand-assets' | 'exports' | 'reports' | 'misc';
  objectId: string;
  filename: string;
  body: Buffer;
  contentType: string;
}

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'object';
}

@Injectable()
export class StorageService {
  constructor(private readonly config: ConfigService) {}

  provider() {
    return this.config.get<string>('STORAGE_PROVIDER') || (process.env.NODE_ENV === 'production' ? 's3' : 'local');
  }

  buildObjectKey(input: Omit<PutObjectInput, 'body' | 'contentType'>) {
    const product = input.productId ? `/products/${safeSegment(input.productId)}` : '';
    return `organizations/${safeSegment(input.organizationId)}${product}/${safeSegment(input.category)}/${safeSegment(input.objectId)}/${safeSegment(input.filename)}`;
  }

  async putObject(input: PutObjectInput) {
    const maxBytes = Number(this.config.get<string>('STORAGE_MAX_OBJECT_BYTES') || 10 * 1024 * 1024);
    if (input.body.byteLength > maxBytes) throw new BadRequestException('storage_object_too_large');
    const key = this.buildObjectKey(input);
    if (this.provider() === 'local') {
      if (process.env.NODE_ENV === 'production') throw new InternalServerErrorException('external_storage_required_in_production');
      const root = this.config.get<string>('LOCAL_STORAGE_ROOT') || join(process.cwd(), 'storage');
      const path = join(root, key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, input.body);
      return { key, url: `/local-storage/${key}`, contentType: input.contentType };
    }
    const baseUrl = this.config.get<string>('STORAGE_PUBLIC_BASE_URL');
    return { key, url: baseUrl ? `${baseUrl.replace(/\/$/, '')}/${key}` : undefined, contentType: input.contentType };
  }

  async exists(key: string) {
    if (this.provider() !== 'local') return false;
    try {
      await stat(join(this.config.get<string>('LOCAL_STORAGE_ROOT') || join(process.cwd(), 'storage'), key));
      return true;
    } catch {
      return false;
    }
  }

  getSignedUrl(key: string, expiresInSeconds = 900) {
    if (this.provider() === 'local') return `/local-storage/${key}`;
    const baseUrl = this.config.get<string>('STORAGE_PUBLIC_BASE_URL');
    if (!baseUrl) return undefined;
    const expires = Math.floor(Date.now() / 1000) + Math.min(expiresInSeconds, 3600);
    const secret = this.config.get<string>('STORAGE_SIGNING_SECRET') || this.config.get<string>('JWT_SECRET') || 'dev';
    const sig = createHmac('sha256', secret).update(`${key}:${expires}`).digest('hex');
    return `${baseUrl.replace(/\/$/, '')}/${key}?expires=${expires}&sig=${sig}`;
  }
}
