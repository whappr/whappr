const SIGNATURE_PREFIX = 'sha256=';

export const WHAPPR_TIMESTAMP_HEADER = 'X-Whappr-Timestamp';
export const WHAPPR_SIGNATURE_HEADER = 'X-Whappr-Signature';

export interface SignedRequest {
  timestamp: string;
  signature: string;
}

function toHex(digest: ArrayBuffer): string {
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function computeSignature(
  secret: string,
  timestamp: string,
  rawBody: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${rawBody}`));
  return `${SIGNATURE_PREFIX}${toHex(digest)}`;
}

/**
 * Port of apps/gateway/src/security/signature.ts's `signPayload`. Duplicated rather
 * than imported for the same reason as the DTOs in types.ts: the gateway isn't a
 * publishable dependency. The scheme itself must stay byte-for-byte identical to
 * what `verifySignatureMiddleware` expects — same HMAC-SHA256 digest, computed via
 * Web Crypto (instead of node:crypto) so this module has no Node-only dependency
 * and runs in browsers too.
 */
export async function signPayload(secret: string, rawBody: string): Promise<SignedRequest> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  return { timestamp, signature: await computeSignature(secret, timestamp, rawBody) };
}
