import type { MiddlewareHandler } from 'hono';
import { verifySignature } from '../../security/signature.js';
import { WhatsappError } from '../../whatsapp/errors.js';

export function verifySignatureMiddleware(secret: string): MiddlewareHandler {
  return async (c, next) => {
    const timestamp = c.req.header('X-Whappr-Timestamp');
    const signature = c.req.header('X-Whappr-Signature');

    if (!timestamp || !signature) {
      throw new WhatsappError('Missing signature', 'MISSING_SIGNATURE');
    }

    const rawBody = await c.req.text();

    if (!verifySignature(secret, timestamp, rawBody, signature)) {
      throw new WhatsappError('Invalid signature', 'INVALID_SIGNATURE');
    }

    await next();
  };
}
