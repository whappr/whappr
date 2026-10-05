// Webhook signature scheme: HMAC-SHA256 over `${timestamp}.${rawBody}`, hex-encoded and
// prefixed with `sha256=`. Web Crypto only, so it runs on Node, browsers and edge runtimes alike.

export const WHAPPR_TIMESTAMP_HEADER = 'X-Whappr-Timestamp';
export const WHAPPR_SIGNATURE_HEADER = 'X-Whappr-Signature';

const SIGNATURE_PREFIX = 'sha256=';
const DEFAULT_MAX_AGE_SECONDS = 300;

export interface WebhookSignature {
  /** Unix time in seconds, sent as `X-Whappr-Timestamp`. */
  timestamp: string;
  /** Sent as `X-Whappr-Signature`. */
  signature: string;
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
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0'));
  return `${SIGNATURE_PREFIX}${hex.join('')}`;
}

// Web Crypto has no timingSafeEqual: XOR every byte and only branch on the accumulated result.
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

/** Signs a webhook body the way the gateway does. */
export async function signWebhook(secret: string, rawBody: string): Promise<WebhookSignature> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  return { timestamp, signature: await computeSignature(secret, timestamp, rawBody) };
}

/**
 * Checks a webhook's signature against the exact raw body received, and rejects it when its
 * timestamp is more than `maxAgeSeconds` (default 300) away from now.
 */
export async function verifyWebhook(
  secret: string,
  timestamp: string,
  rawBody: string,
  signature: string,
  maxAgeSeconds: number = DEFAULT_MAX_AGE_SECONDS,
): Promise<boolean> {
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > maxAgeSeconds) return false;

  return timingSafeEqual(await computeSignature(secret, timestamp, rawBody), signature);
}
