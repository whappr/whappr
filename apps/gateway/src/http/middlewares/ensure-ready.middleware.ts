import type { MiddlewareHandler } from 'hono';
import type { WhatsappSession } from '../../whatsapp/session.js';
import type { AppEnv } from '../types.js';

export function ensureReadyMiddleware(session: WhatsappSession): MiddlewareHandler<AppEnv> {
  return async (_c, next) => {
    session.assertReady();
    await next();
  };
}
