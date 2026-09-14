import type { AnyWhapprEvent } from '../events/types.js';
import type { Logger } from '../logging/logger.js';
import { dispatchEvents } from './dispatcher.js';

export interface WebhookBuffer {
  enqueue(event: AnyWhapprEvent): void;
  flush(): Promise<void>;
}

export function createWebhookBuffer(opts: {
  webhookUrl: string;
  secret: string;
  flushInterval: number;
  logger: Logger;
}): WebhookBuffer {
  const { webhookUrl, secret, flushInterval, logger } = opts;

  let pending: AnyWhapprEvent[] = [];
  let timer: NodeJS.Timeout | null = null;
  let inFlightDispatch: Promise<void> = Promise.resolve();

  function triggerFlush(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending.length === 0) return;

    const batch = pending;
    pending = [];
    inFlightDispatch = dispatchEvents(webhookUrl, secret, batch, logger);
  }

  return {
    enqueue(event) {
      pending.push(event);

      if (flushInterval === 0) {
        triggerFlush();
        return;
      }

      if (timer === null) {
        timer = setTimeout(triggerFlush, flushInterval * 1000);
      }
    },

    async flush() {
      triggerFlush();
      await inFlightDispatch;
    },
  };
}
