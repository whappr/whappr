import { createMessagesApi, type MessagesApi } from './namespaces/messages.js';
import { createSessionApi, type SessionApi } from './namespaces/session.js';
import { createTransport } from './transport.js';

export interface WhapprClientOptions {
  /** Base URL of the Gateway, e.g. "https://gateway.example.com". */
  baseUrl: string;
  /** Shared secret configured on the Gateway as `WHAPPR_SECRET`. */
  secret: string;
  /** Override the fetch implementation (defaults to the global `fetch`). */
  fetch?: typeof fetch;
  /** Per-request timeout in milliseconds. Defaults to 10s. */
  timeoutMs?: number;
}

export interface WhapprClient {
  /** GET /health — unauthenticated liveness check. Resolves if healthy, throws otherwise. */
  health(): Promise<void>;
  readonly session: SessionApi;
  readonly messages: MessagesApi;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export function createWhapprClient(options: WhapprClientOptions): WhapprClient {
  const transport = createTransport({
    baseUrl: options.baseUrl,
    secret: options.secret,
    fetch: options.fetch ?? fetch,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });

  return {
    async health() {
      await transport.request({ method: 'GET', path: '/health' });
    },
    session: createSessionApi(transport, options.secret),
    messages: createMessagesApi(transport),
  };
}
