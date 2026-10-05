import {
  type AnyWhapprEvent,
  signWebhook,
  type WebhookDelivery,
  type WebhookPayload,
  WHAPPR_SIGNATURE_HEADER,
  WHAPPR_TIMESTAMP_HEADER,
} from '@whappr/protocol';
import type { Logger } from 'pino';

const WEBHOOK_TIMEOUT_MS = 5000;

export interface WebhookDispatcher {
  /** POSTs `event` once every event sent before it has been delivered (or has failed). */
  send(event: AnyWhapprEvent): void;
  /** Resolves once every event sent so far has been delivered (or has failed). */
  drain(): Promise<void>;
  /** The most recent delivery attempt, or `null` before the first. */
  last(): WebhookDelivery | null;
}

export function createWebhookDispatcher(opts: {
  webhookUrl: string;
  secret: string;
  logger: Logger;
}): WebhookDispatcher {
  const { webhookUrl, secret, logger } = opts;
  let queue: Promise<void> = Promise.resolve();
  let last: WebhookDelivery | null = null;

  // Never rejects, so one failed delivery can't stall the queue.
  async function post(event: AnyWhapprEvent): Promise<void> {
    try {
      const rawBody = JSON.stringify(event satisfies WebhookPayload);
      const { timestamp, signature } = await signWebhook(secret, rawBody);
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [WHAPPR_TIMESTAMP_HEADER]: timestamp,
          [WHAPPR_SIGNATURE_HEADER]: signature,
        },
        body: rawBody,
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });
      last = { at: new Date().toISOString(), ok: response.ok, status: response.status };

      if (!response.ok) {
        logger.error(
          { status: response.status, statusText: response.statusText, eventId: event.id },
          'webhook delivery failed',
        );
      }
    } catch (error) {
      last = { at: new Date().toISOString(), ok: false };
      logger.error({ error, eventId: event.id }, 'webhook delivery failed');
    }
  }

  return {
    send(event) {
      queue = queue.then(() => post(event));
    },
    drain() {
      return queue;
    },
    last() {
      return last;
    },
  };
}
