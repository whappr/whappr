import { createHmac, timingSafeEqual } from 'node:crypto';

const SIGNATURE_PREFIX = 'sha256=';

function computeSignature(secret: string, timestamp: string, rawBody: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(`${timestamp}.${rawBody}`);
  return `${SIGNATURE_PREFIX}${hmac.digest('hex')}`;
}

export function signPayload(
  secret: string,
  rawBody: string,
): { timestamp: string; signature: string } {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  return { timestamp, signature: computeSignature(secret, timestamp, rawBody) };
}

const MAX_SIGNATURE_AGE_SECONDS = 300;

export function verifySignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  signature: string,
): boolean {
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    return false;
  }
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > MAX_SIGNATURE_AGE_SECONDS) {
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

export function secretsMatch(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) {
    return false;
  }
  return timingSafeEqual(aBuffer, bBuffer);
}
