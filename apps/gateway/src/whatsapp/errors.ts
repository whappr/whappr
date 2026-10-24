import type { DomainErrorCode } from '@whappr/protocol';

export class WhatsappError extends Error {
  readonly code: DomainErrorCode;

  constructor(message: string, code: DomainErrorCode, cause?: unknown) {
    super(message, { cause });
    this.name = 'WhatsappError';
    this.code = code;
  }
}

export function mediaTooLargeError(maxBytes: number): WhatsappError {
  return new WhatsappError(
    `Media is over the ${maxBytes}-byte limit (MEDIA_MAX_SIZE)`,
    'MEDIA_TOO_LARGE',
  );
}
