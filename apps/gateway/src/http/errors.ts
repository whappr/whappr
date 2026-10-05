import { STATUS_CODES } from 'node:http';
import type { DomainErrorCode } from '@whappr/protocol';
import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { WhatsappError } from '../whatsapp/errors.js';
import type { AppEnv } from './app.js';

const STATUS_BY_CODE: Record<DomainErrorCode, ContentfulStatusCode> = {
  NOT_READY: 503,
  NOT_AUTHENTICATED: 409,
  RECIPIENT_NOT_FOUND: 422,
  CHAT_NOT_FOUND: 404,
  MESSAGE_NOT_FOUND: 404,
  EDIT_NOT_ALLOWED: 409,
  MEDIA_NOT_FOUND: 404,
  MEDIA_UNAVAILABLE: 410,
  MEDIA_FETCH_FAILED: 422,
  MEDIA_TOO_LARGE: 413,
  OPERATION_FAILED: 502,
};

function codeForStatus(status: number): string {
  const phrase = STATUS_CODES[status];
  return phrase ? phrase.toUpperCase().replace(/[^A-Z0-9]+/g, '_') : 'HTTP_ERROR';
}

export const handleError: ErrorHandler<AppEnv> = (error, c) => {
  if (error instanceof WhatsappError) {
    if (error.cause) c.var.logger.error({ error: error.cause }, error.message);
    return c.json(
      { error: { code: error.code, message: error.message } },
      STATUS_BY_CODE[error.code],
    );
  }
  if (error instanceof HTTPException) {
    // Some middleware (e.g. bearerAuth) throw without a message.
    const message = error.message || STATUS_CODES[error.status] || 'Error';
    return c.json({ error: { code: codeForStatus(error.status), message } }, error.status);
  }
  c.var.logger.error({ error }, 'unhandled error');
  return c.json(
    { error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal Server Error' } },
    500,
  );
};
