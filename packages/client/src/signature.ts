import { createHmac } from 'node:crypto';

const SIGNATURE_PREFIX = 'sha256=';

export const WHAPPR_TIMESTAMP_HEADER = 'X-Whappr-Timestamp';
export const WHAPPR_SIGNATURE_HEADER = 'X-Whappr-Signature';

export interface SignedRequest {
  timestamp: string;
  signature: string;
}

function computeSignature(secret: string, timestamp: string, rawBody: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(`${timestamp}.${rawBody}`);
  return `${SIGNATURE_PREFIX}${hmac.digest('hex')}`;
}

/**
 * Port of apps/gateway/src/security/signature.ts's `signPayload`. Duplicated rather
 * than imported for the same reason as the DTOs in types.ts: the gateway isn't a
 * publishable dependency. The scheme itself must stay byte-for-byte identical to
 * what `verifySignatureMiddleware` expects.
 */
export function signPayload(secret: string, rawBody: string): SignedRequest {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  return { timestamp, signature: computeSignature(secret, timestamp, rawBody) };
}
