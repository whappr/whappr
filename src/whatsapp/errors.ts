export type WhatsappErrorCode =
  | 'NOT_READY'
  | 'MESSAGE_NOT_FOUND'
  | 'EDIT_NOT_ALLOWED'
  | 'INVALID_SECRET'
  | 'NOT_AUTHENTICATED'
  | 'MISSING_SIGNATURE'
  | 'INVALID_SIGNATURE'
  | 'OPERATION_FAILED'
  | 'AUTHENTICATION_FAILED'
  | 'INITIALIZATION_FAILED';

export class WhatsappError extends Error {
  readonly code: WhatsappErrorCode | undefined;

  constructor(message: string, code?: WhatsappErrorCode, cause?: unknown) {
    super(message, { cause });
    this.name = 'WhatsappError';
    this.code = code;
  }
}
