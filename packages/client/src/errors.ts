import type { ErrorCode } from '@whappr/protocol';

/**
 * Base class for every error this client throws. The client talks HTTP today, but
 * callers should only ever need `instanceof WhapprClientError` (or one of its
 * subclasses below) — never status codes or response shapes — so the transport can
 * change later without breaking consumers.
 */
export abstract class WhapprClientError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The request never reached the Gateway (DNS failure, connection refused, etc.). */
export class WhapprNetworkError extends WhapprClientError {}

/** The request was aborted after `timeoutMs` without a response. */
export class WhapprTimeoutError extends WhapprClientError {}

/** The request was aborted through the `signal` passed to the call. */
export class WhapprAbortError extends WhapprClientError {}

/**
 * The Gateway responded with a non-2xx status. `code` is whatever the error envelope's
 * `error.code` field held, if any — a domain code (e.g. `NOT_READY`, `MESSAGE_NOT_FOUND`)
 * or one derived from the HTTP status text (e.g. `BAD_REQUEST`). See `ErrorCode`. `requestId` is
 * the Gateway's `X-Request-Id`, the id its logs carry for this request.
 */
export class WhapprApiError extends WhapprClientError {
  readonly status: number;
  readonly code?: ErrorCode;
  readonly requestId?: string;

  constructor(
    message: string,
    options: { status: number; code?: ErrorCode; requestId?: string; cause?: unknown },
  ) {
    super(message, { cause: options.cause });
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
  }
}

/** The Gateway returned a 2xx response whose body didn't match what was expected. */
export class WhapprParseError extends WhapprClientError {}
