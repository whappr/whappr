import type { Env, Handler } from 'hono';
import type { WhapprChannelOptions } from './channel.js';
import { verifySignature, WHAPPR_SIGNATURE_HEADER, WHAPPR_TIMESTAMP_HEADER } from './signature.js';
import type { AnyWhapprEvent } from './types.js';

const DEFAULT_BODY_LIMIT = 1024 * 1024;
const decoder = new TextDecoder('utf-8', { fatal: true });

export function createWhapprWebhookHandler<E extends Env>(
  options: WhapprChannelOptions<E>,
): Handler<E> {
  const bodyLimit = options.bodyLimit ?? DEFAULT_BODY_LIMIT;

  return async (c) => {
    const request = c.req.raw;
    const timestamp = request.headers.get(WHAPPR_TIMESTAMP_HEADER);
    const signature = request.headers.get(WHAPPR_SIGNATURE_HEADER);
    if (!timestamp || !signature) return response(401);

    const contentLength = request.headers.get('content-length');
    if (contentLength !== null) {
      if (!/^\d+$/.test(contentLength)) return response(400);
      if (Number(contentLength) > bodyLimit) return response(413);
    }

    let bytes: Uint8Array | undefined;
    try {
      bytes = await readBody(request, bodyLimit);
    } catch {
      return response(400);
    }
    if (!bytes) return response(413);

    let text: string;
    try {
      text = decoder.decode(bytes);
    } catch {
      return response(400);
    }

    // Verify against the exact raw bytes received, before any parsing — a
    // re-serialized JSON object would not reproduce the same signature.
    if (
      !verifySignature(options.secret, timestamp, text, signature, options.maxSignatureAgeSeconds)
    ) {
      return response(401);
    }

    const raw = parseJson(text);
    if (!Array.isArray(raw)) return response(400);

    // The signature already trusts the whole body; this is defense against a
    // malformed/buggy gateway, not a security boundary.
    const events = raw.filter(isWhapprEventShape);

    return serializeHandlerResult(await options.events({ c, events }));
  };
}

function isWhapprEventShape(value: unknown): value is AnyWhapprEvent {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.type === 'string' && typeof record.id === 'string' && 'data' in record;
}

function serializeHandlerResult(value: unknown): Response {
  if (value === undefined) return response(200);
  if (Object.prototype.toString.call(value) === '[object Response]') return value as Response;
  return Response.json(value as Parameters<typeof Response.json>[0]);
}

// Same shape as the official @flue/slack and @flue/teams packages' own
// readBody(): a stream-read error just propagates (the caller catches it),
// and returning `undefined` — rather than a third tagged state — means "the
// body exceeded the limit."
async function readBody(request: Request, limit: number): Promise<Uint8Array | undefined> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        // Discard cancel rejections: an unhandled rejection is fatal on Node.
        reader.cancel().catch(() => {});
        return undefined;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function response(status: number): Response {
  return new Response(null, { status });
}
