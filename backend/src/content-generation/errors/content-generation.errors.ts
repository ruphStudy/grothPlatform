import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';

export type ContentGenerationErrorCode =
  | 'validation_failed'
  | 'provider_not_configured'
  | 'provider_timeout'
  | 'provider_rate_limited'
  | 'provider_auth_failed'
  | 'provider_request_failed'
  | 'empty_generation';

// Extending the existing Nest HTTP exceptions (rather than plain Error) means
// a future controller that lets these bubble up gets the right status code
// for free, with no extra mapping glue in 15B+.
export class ContentGenerationValidationError extends BadRequestException {
  readonly code: ContentGenerationErrorCode = 'validation_failed';
  constructor(message: string) {
    super(message);
  }
}

export class ContentGenerationConfigurationError extends ServiceUnavailableException {
  readonly code: ContentGenerationErrorCode = 'provider_not_configured';
  constructor(message: string) {
    super(message);
  }
}

// Message must stay a safe, generic description — never the raw provider
// error payload, which may include request/account details.
export class ContentGenerationProviderError extends ServiceUnavailableException {
  readonly code: ContentGenerationErrorCode;
  constructor(code: ContentGenerationErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export class ContentGenerationEmptyResultError extends ServiceUnavailableException {
  readonly code: ContentGenerationErrorCode = 'empty_generation';
  constructor(message: string) {
    super(message);
  }
}
