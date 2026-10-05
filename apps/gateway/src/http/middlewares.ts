import { zValidator } from '@hono/zod-validator';
import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Logger } from 'pino';
import type { ZodType } from 'zod';
import type { AppEnv } from './app.js';

/** Sets a per-request child logger as `c.var.logger` and logs each request once it completes. */
export function requestLogger(logger: Logger): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const requestLogger = logger.child({ requestId: c.var.requestId });
    c.set('logger', requestLogger);

    const start = performance.now();
    await next();
    const elapsedMs = performance.now() - start;

    const fields = { method: c.req.method, path: c.req.path, status: c.res.status, elapsedMs };
    if (c.error) {
      requestLogger.warn(fields, 'request completed with error');
    } else {
      requestLogger.info(fields, 'request completed');
    }
  };
}

/** Validates the JSON body, answering `400` with every issue named by its field. */
export function validateBody<T extends ZodType>(schema: T) {
  return zValidator('json', schema, (result) => {
    if (!result.success) {
      throw new HTTPException(400, {
        message: result.error.issues
          .map((issue) =>
            issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
          )
          .join('; '),
      });
    }
  });
}
