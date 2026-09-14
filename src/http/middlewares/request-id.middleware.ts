import type { MiddlewareHandler } from 'hono';
import { requestId } from 'hono/request-id';
import type { AppEnv } from '../types.js';

export function requestIdMiddleware(): MiddlewareHandler<AppEnv> {
  return requestId();
}

export function requestIdHeaderMiddleware(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    await next();
    c.header('X-Request-Id', c.var.requestId);
  };
}
