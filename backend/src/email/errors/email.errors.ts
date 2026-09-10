import { BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';

export class EmailInputError extends BadRequestException {
  constructor(code: string) {
    super(code);
  }
}

export class EmailConflictError extends ConflictException {
  constructor(code: string) {
    super(code);
  }
}

export class EmailProviderError extends ServiceUnavailableException {
  constructor(public readonly code: string) {
    super(code);
  }
}
