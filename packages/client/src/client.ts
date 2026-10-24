import type { HealthResponse } from '@whappr/protocol';
import { type ChatsApi, createChatsApi } from './namespaces/chats.js';
import { createGroupsApi, type GroupsApi } from './namespaces/groups.js';
import { createMessagesApi, type MessagesApi } from './namespaces/messages.js';
import { createSessionApi, type SessionApi } from './namespaces/session.js';
import { createTransport, type RequestOptions } from './transport.js';

export interface WhapprClientOptions {
  /** Base URL of the Gateway, e.g. "https://gateway.example.com". */
  baseUrl: string;
  /** Shared secret configured on the Gateway as `SECRET_KEY`. */
  secret: string;
  /** Override the fetch implementation (defaults to the global `fetch`). */
  fetch?: typeof fetch;
  /** Per-request timeout in milliseconds. Defaults to 10s. */
  timeoutMs?: number;
}

export interface WhapprClient {
  /** GET /health — resolves on `503` too, with `ok: false`, once the session is `failed`. */
  health(options?: RequestOptions): Promise<HealthResponse>;
  readonly session: SessionApi;
  readonly messages: MessagesApi;
  readonly chats: ChatsApi;
  readonly groups: GroupsApi;
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
    health(options) {
      return transport.request<HealthResponse>(
        { method: 'GET', path: '/health', acceptStatuses: [503] },
        options,
      );
    },
    session: createSessionApi(transport),
    messages: createMessagesApi(transport),
    chats: createChatsApi(transport),
    groups: createGroupsApi(transport),
  };
}
