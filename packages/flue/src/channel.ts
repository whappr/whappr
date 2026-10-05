import type { ChannelRouteDefinition, JsonValue } from '@flue/runtime';
import { createChannelRouter } from '@flue/runtime';
import type { AnyWhapprEvent } from '@whappr/protocol';
import type { Context, Env, Hono } from 'hono';
import { createWhapprWebhookHandler } from './routes.js';

type WhapprHandlerValue = undefined | JsonValue | Response;

/**
 * Returning nothing produces an empty `200`. JSON-compatible values become
 * JSON responses, and Hono or Fetch responses pass through unchanged.
 */
export type WhapprHandlerResult = WhapprHandlerValue | Promise<WhapprHandlerValue>;

/** Input delivered to the event callback after signature verification. */
export interface WhapprEventHandlerInput<E extends Env = Env> {
  c: Context<E>;
  /** The verified event from this webhook delivery. */
  event: AnyWhapprEvent;
}

/** Ingress configuration for one Whappr gateway. */
export interface WhapprChannelOptions<E extends Env = Env> {
  /** Shared secret. Must match the gateway's `SECRET_KEY`. */
  secret: string;
  /** Receives each verified webhook event. */
  event(input: WhapprEventHandlerInput<E>): WhapprHandlerResult;
}

/** Verified Whappr gateway webhook ingress. */
export interface WhapprChannel<E extends Env = Env> {
  readonly routes: readonly ChannelRouteDefinition<E>[];
  /**
   * Build a mountable Hono sub-app serving the channel's routes relative
   * to the mount point: `app.route('/channels/whappr', channel.route())`.
   */
  route(): Hono<E>;
  /** The agent instance id for one WhatsApp chat: `whappr:chat:<chatId>`. */
  instanceId(chatId: string): string;
}

/**
 * Creates verified Whappr gateway webhook ingress. Each request's signature
 * (`X-Whappr-Timestamp` / `X-Whappr-Signature`, HMAC-SHA256 over
 * `${timestamp}.${rawBody}`) is verified before `event(...)` ever runs.
 *
 * This package does not call `dispatch()`/`init()`, choose a target agent, or
 * send replies — those, and every outbound call to `@whappr/client`, are
 * application concerns.
 */
export function createWhapprChannel<E extends Env = Env>(
  options: WhapprChannelOptions<E>,
): WhapprChannel<E> {
  if (typeof options?.secret !== 'string' || options.secret === '') {
    throw new TypeError('createWhapprChannel() requires a non-empty `secret`.');
  }
  if (typeof options.event !== 'function') {
    throw new TypeError('createWhapprChannel() requires an `event` callback.');
  }

  const routes: readonly ChannelRouteDefinition<E>[] = [
    { method: 'POST', path: '/webhook', handler: createWhapprWebhookHandler(options) },
  ];
  return {
    routes,
    route: () => createChannelRouter(routes),
    instanceId: (chatId) => `whappr:chat:${encodeURIComponent(chatId)}`,
  };
}
