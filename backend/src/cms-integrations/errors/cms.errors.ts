import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';

export type CmsErrorCode =
  | 'cms_provider_not_configured'
  | 'cms_provider_unsupported_capability'
  | 'cms_auth_failed'
  | 'cms_permission_denied'
  | 'cms_site_unreachable'
  | 'cms_invalid_site'
  | 'cms_rate_limited'
  | 'cms_timeout'
  | 'cms_provider_request_failed';

export class CmsConfigurationError extends ServiceUnavailableException {
  readonly code: CmsErrorCode = 'cms_provider_not_configured';
  constructor(message: string) {
    super(message);
  }
}

export class CmsCapabilityUnsupportedError extends BadRequestException {
  readonly code: CmsErrorCode = 'cms_provider_unsupported_capability';
  constructor(message: string) {
    super(message);
  }
}

// Message must stay a safe, generic description — never the raw provider
// error payload, which may include credential/account details.
export class CmsProviderError extends ServiceUnavailableException {
  readonly code: CmsErrorCode;
  constructor(code: CmsErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
