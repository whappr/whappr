const SIGNATURE_PREFIX = 'sha256=';

export const WHAPPR_TIMESTAMP_HEADER = 'X-Whappr-Timestamp';
export const WHAPPR_SIGNATURE_HEADER = 'X-Whappr-Signature';

const DEFAULT_MAX_SIGNATURE_AGE_SECONDS = 300;

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

// Web Crypto has no timingSafeEqual: XOR every byte and only branch on the
// accumulated result, never on an early mismatch, to avoid a timing side
// channel. The length check up front mirrors the previous node:crypto-based
// implementation, which also compared lengths before the constant-time compare.
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.length !== bBytes.length) return false;

  let diff = 0;
  for (const [i, byte] of aBytes.entries()) {
    diff |= byte ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Port of apps/gateway/src/security/signature.ts's `verifySignature`. Duplicated
 * rather than imported for the same reason as the DTOs in types.ts: the gateway
 * isn't a publishable dependency. The scheme itself must stay byte-for-byte
 * identical to what `signPayload` (gateway-side) produces — same HMAC-SHA256
 * digest, computed via Web Crypto (instead of node:crypto) so this module has
 * no Node-only dependency and runs on Cloudflare Workers and other Web API
 * runtimes too.
 */
export async function verifySignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  signature: string,
  maxAgeSeconds: number = DEFAULT_MAX_SIGNATURE_AGE_SECONDS,
): Promise<boolean> {
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    return false;
  }
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > maxAgeSeconds) {
    return false;
  }

  const expected = await computeSignature(secret, timestamp, rawBody);
  return timingSafeEqual(expected, signature);
}
