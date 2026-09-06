import { BadRequestException, InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';

export type CreativeErrorCode =
  | 'creative_validation_failed'
  | 'creative_provider_not_configured'
  | 'creative_provider_auth_failed'
  | 'creative_provider_rate_limited'
  | 'creative_provider_timeout'
  | 'creative_provider_request_failed'
  | 'creative_invalid_asset'
  | 'creative_asset_persistence_failed';

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

// Generation itself succeeded, but persisting the CreativeAsset record
// failed — callers must not report success, and must not call the
// (paid) provider again to "retry" it.
export class CreativeAssetPersistenceError extends InternalServerErrorException {
  readonly code: CreativeErrorCode = 'creative_asset_persistence_failed';
  constructor(message: string) {
    super(message);
  }
}
