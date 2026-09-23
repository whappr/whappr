import type { MiddlewareHandler } from 'hono';
import type { Logger } from '../../logging/logger.js';
import type { AppEnv } from '../types.js';

export function requestLoggerMiddleware(logger: Logger): MiddlewareHandler<AppEnv> {
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
