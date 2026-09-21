import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  verifySignature,
  WHAPPR_SIGNATURE_HEADER,
  WHAPPR_TIMESTAMP_HEADER,
} from '../../security/signature.js';
import type { AppEnv } from '../types.js';

export function verifySignatureMiddleware(secret: string): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const timestamp = c.req.header(WHAPPR_TIMESTAMP_HEADER);
    const signature = c.req.header(WHAPPR_SIGNATURE_HEADER);

    if (!timestamp || !signature) {
      throw new HTTPException(401, { message: 'Missing signature' });
    }

    const rawBody = await c.req.text();

    if (!verifySignature(secret, timestamp, rawBody, signature)) {
      throw new HTTPException(401, { message: 'Invalid signature' });
    }

    await next();
  };
}
