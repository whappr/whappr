import type { MiddlewareHandler } from 'hono';
import { WhatsappError } from '../../whatsapp/errors.js';
import type { WhatsappSupervisor } from '../../whatsapp/supervisor.js';

export function ensureReadyMiddleware(supervisor: WhatsappSupervisor): MiddlewareHandler {
  return async (_c, next) => {
    if (supervisor.getClient().getState().status !== 'READY') {
      throw new WhatsappError('WhatsApp client is not ready', 'NOT_READY');
    }
    await next();
  };
}
