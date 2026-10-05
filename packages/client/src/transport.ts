import {
  WhapprApiError,
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

export interface RequestOptions {
  method: string;
  path: string;
  body?: unknown;
  /** `blob` returns the raw response body instead of parsing it as JSON. Defaults to `json`. */
  responseType?: 'json' | 'blob';
  /** Overrides the client's `timeoutMs` for this request. */
  timeoutMs?: number;
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
  return new WhapprApiError(message, { status: response.status, code: envelope?.code });
}

export interface Transport {
  request<T = unknown>(options: RequestOptions): Promise<T>;
}

export function createTransport(config: TransportConfig): Transport {
  async function request<T>(options: RequestOptions): Promise<T> {
    const url = new URL(options.path, config.baseUrl).toString();

    const timeoutMs = options.timeoutMs ?? config.timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const headers: Record<string, string> = { Authorization: `Bearer ${config.secret}` };
    const init: RequestInit = { method: options.method, headers, signal: controller.signal };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }

    let response: Response;
    try {
      response = await config.fetch(url, init);
    } catch (cause) {
      if (controller.signal.aborted) {
        throw new WhapprTimeoutError(`Request to ${options.path} timed out after ${timeoutMs}ms`, {
          cause,
        });
      }
      throw new WhapprNetworkError(`Request to ${options.path} failed`, { cause });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw await toApiError(options.path, response);
    }

    if (options.responseType === 'blob') {
      try {
        return (await response.blob()) as T;
      } catch (cause) {
        throw new WhapprNetworkError(`Reading the response from ${options.path} failed`, { cause });
      }
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
      throw new WhapprParseError(`Response from ${options.path} was not valid JSON`, {
        cause,
      });
    }
  }

  return { request };
}
