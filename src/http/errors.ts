import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { WhatsappError, type WhatsappErrorCode } from '../whatsapp/errors.js';
import type { AppEnv } from './types.js';

const STATUS_BY_CODE: Record<WhatsappErrorCode, ContentfulStatusCode> = {
  INVALID_SECRET: 401,
  MESSAGE_NOT_FOUND: 404,
  EDIT_NOT_ALLOWED: 409,
  MISSING_SIGNATURE: 401,
  INVALID_SIGNATURE: 401,
  NOT_AUTHENTICATED: 409,
  OPERATION_FAILED: 502,
  NOT_READY: 503,
  AUTHENTICATION_FAILED: 500, // never actually reaches onError; kept for type completeness
  INITIALIZATION_FAILED: 500, // never actually reaches onError; kept for type completeness
};

export const handleError: ErrorHandler<AppEnv> = (error, c) => {
  if (error instanceof WhatsappError) {
    if (error.cause) c.var.logger.error({ error: error.cause }, error.message);
    const status = error.code ? STATUS_BY_CODE[error.code] : 500;
    return c.json(
      { error: { code: error.code ?? 'INTERNAL_ERROR', message: error.message } },
      status,
    );
  }
  if (error instanceof HTTPException) {
    return error.getResponse();
  }
  c.var.logger.error({ error }, 'unhandled error');
  return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal Server Error' } }, 500);
};
