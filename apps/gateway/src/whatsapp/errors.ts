export type WhatsappErrorCode =
  | 'NOT_READY'
  | 'MESSAGE_NOT_FOUND'
  | 'EDIT_NOT_ALLOWED'
  | 'NOT_AUTHENTICATED'
  | 'OPERATION_FAILED';

export class WhatsappError extends Error {
  readonly code?: WhatsappErrorCode;

  constructor(message: string, code?: WhatsappErrorCode, cause?: unknown) {
    super(message, { cause });
    this.name = 'WhatsappError';
    this.code = code;
  }
}
