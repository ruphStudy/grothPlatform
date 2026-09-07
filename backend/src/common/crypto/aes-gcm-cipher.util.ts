import { InternalServerErrorException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

/**
 * Shared AES-256-GCM authenticated-encryption primitive. Originally
 * written inline for social access/refresh tokens (Sprint 18,
 * SOCIAL_TOKEN_ENCRYPTION_KEY) and extracted here so a second,
 * independently-keyed caller (Sprint 20 CMS credentials) can reuse the
 * exact same crypto without a second implementation. Never logs
 * plaintext, ciphertext, or a key.
 */
export function decodeEncryptionKey(raw: string | undefined, envVarName: string): Buffer {
  if (!raw) {
    throw new InternalServerErrorException(`${envVarName} is not configured.`);
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new InternalServerErrorException(`${envVarName} must decode to exactly 32 bytes.`);
  }
  return key;
}

export function encryptWithKey(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join('.');
}

export function decryptWithKey(payload: string, key: Buffer): string {
  const parts = payload.split('.');
  if (parts.length !== 3) {
    throw new InternalServerErrorException('Stored encrypted payload is malformed.');
  }
  const [ivB64, authTagB64, dataB64] = parts;
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  try {
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    throw new InternalServerErrorException('Stored encrypted payload could not be decrypted.');
  }
}
