import type { MiddlewareHandler } from 'hono';
import type { WhatsappClient } from '../../whatsapp/client.js';
import { WhatsappError } from '../../whatsapp/errors.js';

export function ensureReadyMiddleware(client: WhatsappClient): MiddlewareHandler {
  return async (_c, next) => {
    if (client.getState().status !== 'READY') {
      throw new WhatsappError('WhatsApp client is not ready', 'NOT_READY');
    }
    await next();
  };
}
