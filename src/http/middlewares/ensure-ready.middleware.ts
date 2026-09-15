import type { MiddlewareHandler } from 'hono';
import { WhatsappError } from '../../whatsapp/errors.js';
import type { WhatsappSession } from '../../whatsapp/session.js';

export function ensureReadyMiddleware(session: WhatsappSession): MiddlewareHandler {
  return async (_c, next) => {
    if (session.state.status !== 'READY') {
      throw new WhatsappError('WhatsApp client is not ready', 'NOT_READY');
    }
    await next();
  };
}
