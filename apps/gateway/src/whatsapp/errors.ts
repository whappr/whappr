import type { DomainErrorCode } from '@whappr/protocol';

export class WhatsappError extends Error {
  readonly code: DomainErrorCode;

  constructor(message: string, code: DomainErrorCode, cause?: unknown) {
    super(message, { cause });
    this.name = 'WhatsappError';
    this.code = code;
  }
}
