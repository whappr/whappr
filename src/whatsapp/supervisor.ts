import type { Env } from '../config/env.js';
import {
  describeEventFilterRules,
  type EventFilterEntry,
  eventMatchesRules,
  loadEventFilterRules,
} from '../events/filter.js';
import { type AnyWhapprEvent, createEvent } from '../events/types.js';
import type { Logger } from '../logging/logger.js';
import type { WebhookBuffer } from '../webhook/buffer.js';
import { createWhatsappClient, type WhatsappClient } from './client.js';

export class WhatsappSupervisor {
  readonly #env: Env;
  readonly #webhookBuffer: WebhookBuffer;
  readonly #logger: Logger;
  readonly #eventFilterRules: EventFilterEntry[];
  #client: WhatsappClient;

  constructor(env: Env, webhookBuffer: WebhookBuffer, logger: Logger) {
    this.#env = env;
    this.#webhookBuffer = webhookBuffer;
    this.#logger = logger;
    this.#eventFilterRules = loadEventFilterRules(this.#logger);
    this.#logger.info(
      { eventFilter: describeEventFilterRules(this.#eventFilterRules) },
      'event filter configured',
    );

    this.#client = this.#createClient();
  }

  getClient(): WhatsappClient {
    return this.#client;
  }

  async restart(): Promise<void> {
    try {
      await this.#client.destroy();
    } catch (error) {
      this.#logger.error({ error }, 'error destroying WhatsApp client during restart');
    }
    // No explicit state reset needed here: #createClient() below runs synchronously
    // (no `await` in between), and a freshly constructed WhatsappClient already
    // defaults its state to 'INITIALIZING'.
    this.#client = this.#createClient();
  }

  async logout(): Promise<void> {
    await this.#client.logout();
    await this.restart();
  }

  async destroy(): Promise<void> {
    await this.#client.destroy();
  }

  #emitEvent(event: AnyWhapprEvent): void {
    if (!eventMatchesRules(event, this.#eventFilterRules)) return;
    this.#webhookBuffer.enqueue(event);
  }

  #createClient(): WhatsappClient {
    const client = createWhatsappClient(this.#env, this.#logger);

    client.on('message.received', (payload) => {
      this.#emitEvent(createEvent('message.received', payload));
    });
    client.on('message.sent', (payload) => {
      this.#emitEvent(createEvent('message.sent', payload));
    });
    client.on('message.ack', (payload) => {
      this.#emitEvent(createEvent('message.ack', payload));
    });
    client.on('message.edited', (payload) => {
      this.#emitEvent(createEvent('message.edited', payload));
    });
    client.on('message.reaction', (payload) => {
      this.#emitEvent(createEvent('message.reaction', payload));
    });
    client.on('message.revoked', (payload) => {
      this.#emitEvent(createEvent('message.revoked', payload));
    });
    client.on('disconnected', () => {
      void this.restart();
    });
    client.on('error', (error) => {
      this.#logger.error({ error }, 'WhatsApp client error');
    });

    client.init().catch((error) => {
      this.#logger.error({ error }, 'failed to initialize WhatsApp client');
    });

    return client;
  }
}

export function createWhatsappSupervisor(
  env: Env,
  webhookBuffer: WebhookBuffer,
  logger: Logger,
): WhatsappSupervisor {
  return new WhatsappSupervisor(env, webhookBuffer, logger);
}
