import { createHmac, timingSafeEqual } from 'node:crypto';

const SIGNATURE_PREFIX = 'sha256=';

export const WHAPPR_TIMESTAMP_HEADER = 'X-Whappr-Timestamp';
export const WHAPPR_SIGNATURE_HEADER = 'X-Whappr-Signature';

const DEFAULT_MAX_SIGNATURE_AGE_SECONDS = 300;

function computeSignature(secret: string, timestamp: string, rawBody: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(`${timestamp}.${rawBody}`);
  return `${SIGNATURE_PREFIX}${hmac.digest('hex')}`;
}

/**
 * Port of apps/gateway/src/security/signature.ts's `verifySignature`. Duplicated
 * rather than imported for the same reason as the DTOs in types.ts: the gateway
 * isn't a publishable dependency. The scheme itself must stay byte-for-byte
 * identical to what `signPayload` (gateway-side) produces.
 */
export function verifySignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  signature: string,
  maxAgeSeconds: number = DEFAULT_MAX_SIGNATURE_AGE_SECONDS,
): boolean {
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    return false;
  }
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > maxAgeSeconds) {
    return false;
  }

  const expected = computeSignature(secret, timestamp, rawBody);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, actualBuffer);
}
