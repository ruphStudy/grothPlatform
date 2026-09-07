import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decodeEncryptionKey, decryptWithKey, encryptWithKey } from '../../../common/crypto/aes-gcm-cipher.util';

/**
 * 20B item 13: reuses the exact same AES-256-GCM primitive as Sprint 18's
 * TokenEncryptionService (via the shared aes-gcm-cipher util) rather than
 * a second crypto implementation. Deliberately keyed by its OWN secret
 * (CMS_CREDENTIAL_ENCRYPTION_KEY, base64-encoded 32 bytes) rather than
 * sharing SOCIAL_TOKEN_ENCRYPTION_KEY — a compromise of one credential
 * domain must not automatically compromise the other.
 */
@Injectable()
export class CmsCredentialEncryptionService {
  constructor(private readonly configService: ConfigService) {}

  encrypt(plaintext: string): string {
    return encryptWithKey(plaintext, this.getKey());
  }

  decrypt(payload: string): string {
    return decryptWithKey(payload, this.getKey());
  }

  private getKey(): Buffer {
    return decodeEncryptionKey(this.configService.get<string>('CMS_CREDENTIAL_ENCRYPTION_KEY'), 'CMS_CREDENTIAL_ENCRYPTION_KEY');
  }
}
