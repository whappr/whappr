import {
  type AnyWhapprEvent,
  signWebhook,
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
}

export function createWebhookDispatcher(opts: {
  webhookUrl: string;
  secret: string;
  logger: Logger;
}): WebhookDispatcher {
  const { webhookUrl, secret, logger } = opts;
  let queue: Promise<void> = Promise.resolve();

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

      if (!response.ok) {
        logger.error(
          { status: response.status, statusText: response.statusText, eventId: event.id },
          'webhook delivery failed',
        );
      }
    } catch (error) {
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
  };
}
