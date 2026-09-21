import { structuredLogger } from '@hono/structured-logger';
import type { MiddlewareHandler } from 'hono';
import type { Logger } from '../../logging/logger.js';
import type { AppEnv } from '../types.js';

export function structuredLoggerMiddleware(logger: Logger): MiddlewareHandler<AppEnv> {
  return structuredLogger<AppEnv, Logger>({
    createLogger: (c) => logger.child({ requestId: c.var.requestId }),
    onResponse: (childLogger, c, elapsedMs) => {
      childLogger.info(
        { method: c.req.method, path: c.req.path, status: c.res.status, elapsedMs },
        'request completed',
      );
    },
    onError: (childLogger, _error, c, elapsedMs) => {
      childLogger.warn(
        { method: c.req.method, path: c.req.path, status: c.res.status, elapsedMs },
        'request completed with error',
      );
    },
  });
}
