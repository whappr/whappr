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

/**
 * The Gateway responded with a non-2xx status. `code` is whatever the error envelope's
 * `error.code` field held, if any — either a WhatsApp-domain code (e.g. `NOT_READY`,
 * `MESSAGE_NOT_FOUND`; see apps/gateway/src/whatsapp/errors.ts) or a generic HTTP-layer
 * code derived from the status text (e.g. `BAD_REQUEST`, `UNAUTHORIZED`; see
 * apps/gateway/src/http/errors.ts). Not an exhaustive/closed set, so it's a plain
 * `string` rather than a literal union — prefer `status` or `instanceof` checks for
 * anything you need to branch on reliably.
 */
export class WhapprApiError extends WhapprClientError {
  readonly status: number;
  readonly code: string | undefined;

  constructor(message: string, options: { status: number; code: string | undefined; cause?: unknown }) {
    super(message, { cause: options.cause });
    this.status = options.status;
    this.code = options.code;
  }
}

/** The Gateway returned a 2xx response whose body didn't match what was expected. */
export class WhapprInvalidResponseError extends WhapprClientError {}
