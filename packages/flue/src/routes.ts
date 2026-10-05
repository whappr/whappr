import {
  type AnyWhapprEvent,
  verifyWebhook,
  WHAPPR_SIGNATURE_HEADER,
  WHAPPR_TIMESTAMP_HEADER,
} from '@whappr/protocol';
import type { Env, Handler } from 'hono';
import type { WhapprChannelOptions } from './channel.js';

// A webhook carries a single event, so anything near this is not from the gateway.
const MAX_BODY_BYTES = 1024 * 1024;

export function createWhapprWebhookHandler<E extends Env>(
  options: WhapprChannelOptions<E>,
): Handler<E> {
  return async (c) => {
    const timestamp = c.req.header(WHAPPR_TIMESTAMP_HEADER);
    const signature = c.req.header(WHAPPR_SIGNATURE_HEADER);
    if (!timestamp || !signature) return response(401);

    if (Number(c.req.header('content-length') ?? 0) > MAX_BODY_BYTES) return response(413);

    // Verify against the exact raw body received, before any parsing — a re-serialized JSON
    // object would not reproduce the same signature.
    const rawBody = await c.req.text();
    if (!(await verifyWebhook(options.secret, timestamp, rawBody, signature))) {
      return response(401);
    }

    let event: AnyWhapprEvent;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return response(400);
    }

    return serializeHandlerResult(await options.event({ c, event }));
  };
}

function serializeHandlerResult(value: unknown): Response {
  if (value === undefined) return response(200);
  // Not `instanceof`: the Response may come from another realm (e.g. a bundled polyfill).
  if (Object.prototype.toString.call(value) === '[object Response]') return value as Response;
  return Response.json(value);
}

function response(status: number): Response {
  return new Response(null, { status });
}
