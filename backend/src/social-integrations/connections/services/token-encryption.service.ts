import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

/**
 * Small, reusable authenticated-encryption service (AES-256-GCM) for
 * social access/refresh tokens (18B item 13). No repo-wide encryption
 * abstraction existed before this, so this is intentionally minimal — one
 * responsibility, no home-grown crypto primitives, keyed by a single
 * server-held secret (SOCIAL_TOKEN_ENCRYPTION_KEY, base64-encoded 32
 * bytes). Never logs plaintext, ciphertext, or the key itself.
 */
@Injectable()
export class TokenEncryptionService {
  constructor(private readonly configService: ConfigService) {}

  encrypt(plaintext: string): string {
    const key = this.getKey();
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join('.');
  }

  decrypt(payload: string): string {
    const parts = payload.split('.');
    if (parts.length !== 3) {
      throw new InternalServerErrorException('Stored token payload is malformed.');
    }
    const [ivB64, authTagB64, dataB64] = parts;
    const key = this.getKey();
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
    try {
      const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
      return decrypted.toString('utf8');
    } catch {
      throw new InternalServerErrorException('Stored token could not be decrypted.');
    }
  }

  private getKey(): Buffer {
    const raw = this.configService.get<string>('SOCIAL_TOKEN_ENCRYPTION_KEY');
    if (!raw) {
      throw new InternalServerErrorException('SOCIAL_TOKEN_ENCRYPTION_KEY is not configured.');
    }
    const key = Buffer.from(raw, 'base64');
    if (key.length !== KEY_BYTES) {
      throw new InternalServerErrorException('SOCIAL_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.');
    }
    return key;
  }
}
