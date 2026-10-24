import {
  WhapprAbortError,
  WhapprApiError,
  WhapprClientError,
  WhapprNetworkError,
  WhapprParseError,
  WhapprTimeoutError,
} from './errors.js';

export interface TransportConfig {
  baseUrl: string;
  secret: string;
  fetch: typeof fetch;
  timeoutMs: number;
}

/** Per-call options every method accepts as its last argument. */
export interface RequestOptions {
  /** Aborts the call, which then rejects with `WhapprAbortError`. */
  signal?: AbortSignal;
  /**
   * Overrides the client's `timeoutMs` for this call, e.g. to send or download a large file. On a
   * timeout the Gateway may still complete the request — a timed-out `send()` doesn't mean the
   * message wasn't sent.
   */
  timeoutMs?: number;
}

export interface TransportRequest {
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** `blob` returns the raw response body instead of parsing it as JSON. Defaults to `json`. */
  responseType?: 'json' | 'blob';
  /** Non-2xx statuses whose body is returned instead of thrown, e.g. `503` from `/health`. */
  acceptStatuses?: number[];
}

interface ParsedErrorEnvelope {
  code?: string;
  message?: string;
}

function parseErrorEnvelope(text: string): ParsedErrorEnvelope | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }

  if (typeof parsed !== 'object' || parsed === null || !('error' in parsed)) {
    return undefined;
  }
  const { error } = parsed as { error: unknown };
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  const { code, message } = error as { code?: unknown; message?: unknown };
  return {
    code: typeof code === 'string' ? code : undefined,
    message: typeof message === 'string' ? message : undefined,
  };
}

async function toApiError(path: string, response: Response): Promise<WhapprApiError> {
  const text = await response.text().catch(() => '');
  const envelope = text.length > 0 ? parseErrorEnvelope(text) : undefined;

  const message =
    envelope?.message ??
    (text.length > 0 ? text : `Request to ${path} failed with status ${response.status}`);
  return new WhapprApiError(message, {
    status: response.status,
    code: envelope?.code,
    requestId: response.headers.get('X-Request-Id') ?? undefined,
  });
}

async function readBody<T>(request: TransportRequest, response: Response): Promise<T> {
  if (request.responseType === 'blob') {
    return (await response.blob()) as T;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (text.length === 0) {
    return undefined as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch (cause) {
    throw new WhapprParseError(`Response from ${request.path} was not valid JSON`, { cause });
  }
}

export interface Transport {
  request<T = unknown>(request: TransportRequest, options?: RequestOptions): Promise<T>;
}

export function createTransport(config: TransportConfig): Transport {
  // Appended rather than resolved with `new URL()`, which would drop a path in `baseUrl`.
  const baseUrl = config.baseUrl.replace(/\/+$/, '');

  async function request<T>(request: TransportRequest, options: RequestOptions = {}): Promise<T> {
    const timeoutMs = options.timeoutMs ?? config.timeoutMs;
    // Stays attached while the body is read, so the timeout covers the whole response.
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

    const headers: Record<string, string> = {
      ...request.headers,
      Authorization: `Bearer ${config.secret}`,
    };
    const init: RequestInit = { method: request.method, headers, signal };
    if (request.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(request.body);
    }

    try {
      const response = await config.fetch(`${baseUrl}${request.path}`, init);
      if (!response.ok && !request.acceptStatuses?.includes(response.status)) {
        throw await toApiError(request.path, response);
      }
      return await readBody<T>(request, response);
    } catch (cause) {
      if (cause instanceof WhapprClientError) {
        throw cause;
      }
      if (options.signal?.aborted) {
        throw new WhapprAbortError(`Request to ${request.path} was aborted`, { cause });
      }
      if (timeout.aborted) {
        throw new WhapprTimeoutError(`Request to ${request.path} timed out after ${timeoutMs}ms`, {
          cause,
        });
      }
      throw new WhapprNetworkError(`Request to ${request.path} failed`, { cause });
    }
  }

  return { request };
}
