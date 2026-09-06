import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';

export type CreativeErrorCode =
  | 'creative_validation_failed'
  | 'creative_provider_not_configured'
  | 'creative_provider_auth_failed'
  | 'creative_provider_rate_limited'
  | 'creative_provider_timeout'
  | 'creative_provider_request_failed'
  | 'creative_invalid_asset';

// Extending the existing Nest HTTP exceptions means a future controller that
// lets these bubble up gets the right status code for free.
export class CreativeValidationError extends BadRequestException {
  readonly code: CreativeErrorCode = 'creative_validation_failed';
  constructor(message: string) {
    super(message);
  }
}

export class CreativeConfigurationError extends ServiceUnavailableException {
  readonly code: CreativeErrorCode = 'creative_provider_not_configured';
  constructor(message: string) {
    super(message);
  }
}

// Message must stay a safe, generic description — never the raw provider
// error payload, which may include request/account details or secrets.
export class CreativeProviderError extends ServiceUnavailableException {
  readonly code: CreativeErrorCode;
  constructor(code: CreativeErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export class CreativeInvalidAssetError extends ServiceUnavailableException {
  readonly code: CreativeErrorCode = 'creative_invalid_asset';
  constructor(message: string) {
    super(message);
  }
}
