import { STATUS_CODES } from 'node:http';
import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { WhatsappError, type WhatsappErrorCode } from '../whatsapp/errors.js';
import type { AppEnv } from './types.js';

const STATUS_BY_CODE: Record<WhatsappErrorCode, ContentfulStatusCode> = {
  NOT_READY: 503,
  MESSAGE_NOT_FOUND: 404,
  EDIT_NOT_ALLOWED: 409,
  NOT_AUTHENTICATED: 409,
  OPERATION_FAILED: 502,
};

function codeForStatus(status: number): string {
  const phrase = STATUS_CODES[status];
  return phrase ? phrase.toUpperCase().replace(/[^A-Z0-9]+/g, '_') : 'HTTP_ERROR';
}

export const handleError: ErrorHandler<AppEnv> = (error, c) => {
  if (error instanceof WhatsappError) {
    if (error.cause) c.var.logger.error({ error: error.cause }, error.message);
    const status = error.code ? STATUS_BY_CODE[error.code] : 500;
    return c.json(
      { error: { code: error.code ?? 'INTERNAL_SERVER_ERROR', message: error.message } },
      status,
    );
  }
  if (error instanceof HTTPException) {
    return c.json(
      { error: { code: codeForStatus(error.status), message: error.message } },
      error.status,
    );
  }
  c.var.logger.error({ error }, 'unhandled error');
  return c.json(
    { error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal Server Error' } },
    500,
  );
};
