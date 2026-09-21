import type { ChannelRouteDefinition, JsonValue } from '@flue/runtime';
import { createChannelRouter } from '@flue/runtime';
import type { Context, Env, Hono } from 'hono';
import { WhapprInvalidInputError, WhapprInvalidInstanceIdError } from './errors.js';
import { createWhapprWebhookHandler } from './routes.js';
import type { AnyWhapprEvent } from './types.js';

/** Stable Whappr destination suitable for a Flue agent-instance id: one WhatsApp chat. */
export interface WhapprConversationRef {
  /** The counterparty's WhatsApp JID, e.g. `"1555123456@c.us"`. */
  chatId: string;
}

type WhapprHandlerValue = undefined | JsonValue | Response;

/**
 * Returning nothing produces an empty `200`. JSON-compatible values become
 * JSON responses, and Hono or Fetch responses pass through unchanged.
 */
export type WhapprHandlerResult = WhapprHandlerValue | Promise<WhapprHandlerValue>;

/** Input delivered to the events callback after signature verification. */
export interface WhapprEventsHandlerInput<E extends Env = Env> {
  c: Context<E>;
  /**
   * The verified event batch from this webhook delivery, in the gateway's
   * delivered order. Entries that don't have the minimal documented shape
   * (`type`, `id`, `data`) are dropped and never reach this callback.
   */
  events: readonly AnyWhapprEvent[];
}

/** Ingress configuration for one Whappr gateway. */
export interface WhapprChannelOptions<E extends Env = Env> {
  /** Shared secret. Must match the gateway's `WHAPPR_SECRET`. */
  secret: string;
  /** Maximum request-body size in bytes. Defaults to 1 MiB. */
  bodyLimit?: number;
  /**
   * Maximum age, in seconds, of a signed request before it's rejected.
   * Defaults to 300 (5 minutes), matching the gateway's own replay window.
   */
  maxSignatureAgeSeconds?: number;
  /** Receives the verified event batch from one webhook delivery. */
  events(input: WhapprEventsHandlerInput<E>): WhapprHandlerResult;
}

/** Verified Whappr gateway webhook ingress and canonical identity helpers. */
export interface WhapprChannel<E extends Env = Env> {
  readonly routes: readonly ChannelRouteDefinition<E>[];
  /**
   * Build a mountable Hono sub-app serving the channel's routes relative
   * to the mount point: `app.route('/channels/whappr', channel.route())`.
   */
  route(): Hono<E>;
  /**
   * Derives the agent instance id: a canonical namespaced identifier for
   * one WhatsApp chat. It is not an authorization capability.
   */
  instanceId(ref: WhapprConversationRef): string;
  /**
   * Parses only canonical instance ids produced by `instanceId()`. Escape
   * hatch: agents normally receive structured facts as creation data rather
   * than parsing them from the id.
   */
  parseInstanceId(id: string): WhapprConversationRef;
}

/**
 * Creates verified Whappr gateway webhook ingress.
 *
 * Handles the gateway's batched webhook delivery: the whole request body is
 * signed as one unit (`X-Whappr-Timestamp` / `X-Whappr-Signature`, HMAC-SHA256
 * over `${timestamp}.${rawBody}`), verified before `events(...)` ever runs.
 *
 * This package does not call `dispatch()`/`init()`, choose a target agent, or
 * send replies — those, and every outbound call to `@whappr/client`, are
 * application concerns.
 */
export function createWhapprChannel<E extends Env = Env>(
  options: WhapprChannelOptions<E>,
): WhapprChannel<E> {
  validateOptions(options);
  const routes: readonly ChannelRouteDefinition<E>[] = [
    {
      method: 'POST',
      path: '/webhook',
      handler: createWhapprWebhookHandler(options),
    },
  ];
  const channel: WhapprChannel<E> = {
    routes,
    route: () => createChannelRouter(routes),
    instanceId(ref) {
      assertChatRef(ref);
      return `whappr:v1:chat:${encodeURIComponent(ref.chatId)}`;
    },
    parseInstanceId(id) {
      try {
        const match = /^whappr:v1:chat:([^:]+)$/.exec(id);
        if (!match) throw new WhapprInvalidInstanceIdError();
        const [, encodedChatId] = match;
        if (!encodedChatId) throw new WhapprInvalidInstanceIdError();
        const ref: WhapprConversationRef = { chatId: decodeURIComponent(encodedChatId) };
        assertChatRef(ref);
        if (channel.instanceId(ref) !== id) throw new WhapprInvalidInstanceIdError();
        return ref;
      } catch (error) {
        if (error instanceof WhapprInvalidInstanceIdError) throw error;
        throw new WhapprInvalidInstanceIdError();
      }
    },
  };
  return channel;
}

function validateOptions<E extends Env>(options: WhapprChannelOptions<E>): void {
  if (!options || typeof options !== 'object') {
    throw new TypeError('createWhapprChannel() requires an options object.');
  }
  assertNonEmptyString(options.secret, 'secret');
  if (typeof options.events !== 'function') {
    throw new WhapprInvalidInputError('events');
  }
  if (
    options.bodyLimit !== undefined &&
    (!Number.isSafeInteger(options.bodyLimit) || options.bodyLimit <= 0)
  ) {
    throw new WhapprInvalidInputError('bodyLimit');
  }
  if (
    options.maxSignatureAgeSeconds !== undefined &&
    (!Number.isSafeInteger(options.maxSignatureAgeSeconds) || options.maxSignatureAgeSeconds <= 0)
  ) {
    throw new WhapprInvalidInputError('maxSignatureAgeSeconds');
  }
}

function assertChatRef(ref: WhapprConversationRef): void {
  if (!ref || typeof ref !== 'object') throw new WhapprInvalidInputError('ref');
  assertNonEmptyString(ref.chatId, 'ref.chatId');
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new WhapprInvalidInputError(field);
  }
}
