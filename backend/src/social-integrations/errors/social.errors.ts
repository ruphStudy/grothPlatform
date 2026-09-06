import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';

export type SocialErrorCode =
  | 'social_provider_not_configured'
  | 'social_provider_unsupported_capability'
  | 'social_auth_failed'
  | 'social_token_exchange_failed'
  | 'social_token_refresh_failed'
  | 'social_permission_denied'
  | 'social_rate_limited'
  | 'social_timeout'
  | 'social_provider_request_failed'
  | 'social_oauth_state_invalid'
  | 'social_oauth_state_expired'
  | 'social_oauth_state_consumed';

export class SocialConfigurationError extends ServiceUnavailableException {
  readonly code: SocialErrorCode = 'social_provider_not_configured';
  constructor(message: string) {
    super(message);
  }
}

export class SocialCapabilityUnsupportedError extends BadRequestException {
  readonly code: SocialErrorCode = 'social_provider_unsupported_capability';
  constructor(message: string) {
    super(message);
  }
}

// Message must stay a safe, generic description — never the raw provider
// error payload, which may include tokens/account details.
export class SocialProviderError extends ServiceUnavailableException {
  readonly code: SocialErrorCode;
  constructor(code: SocialErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export class SocialOAuthStateError extends BadRequestException {
  readonly code: SocialErrorCode;
  constructor(code: SocialErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
