import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decodeEncryptionKey, decryptWithKey, encryptWithKey } from '../../common/crypto/aes-gcm-cipher.util';

@Injectable()
export class EmailCredentialEncryptionService {
  constructor(private readonly configService: ConfigService) {}

  encrypt(plaintext: string): string {
    return encryptWithKey(plaintext, this.getKey());
  }

  decrypt(payload: string): string {
    return decryptWithKey(payload, this.getKey());
  }

  private getKey(): Buffer {
    return decodeEncryptionKey(this.configService.get<string>('EMAIL_CREDENTIAL_ENCRYPTION_KEY'), 'EMAIL_CREDENTIAL_ENCRYPTION_KEY');
  }
}
