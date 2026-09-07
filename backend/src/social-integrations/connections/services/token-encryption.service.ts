import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decodeEncryptionKey, decryptWithKey, encryptWithKey } from '../../../common/crypto/aes-gcm-cipher.util';

/**
 * Small, reusable authenticated-encryption service (AES-256-GCM) for
 * social access/refresh tokens (18B item 13), keyed by a single
 * server-held secret (SOCIAL_TOKEN_ENCRYPTION_KEY, base64-encoded 32
 * bytes). The actual cipher logic lives in the shared aes-gcm-cipher
 * util (Sprint 20 extracted it so CMS credential encryption could reuse
 * it too) — this class only owns which env var supplies its key. Never
 * logs plaintext, ciphertext, or the key itself.
 */
@Injectable()
export class TokenEncryptionService {
  constructor(private readonly configService: ConfigService) {}

  encrypt(plaintext: string): string {
    return encryptWithKey(plaintext, this.getKey());
  }

  decrypt(payload: string): string {
    return decryptWithKey(payload, this.getKey());
  }

  private getKey(): Buffer {
    return decodeEncryptionKey(this.configService.get<string>('SOCIAL_TOKEN_ENCRYPTION_KEY'), 'SOCIAL_TOKEN_ENCRYPTION_KEY');
  }
}
