import type { Logger } from '../logging/logger.js';
import type { WebhookBuffer } from '../webhook/buffer.js';
import type { WhatsappClient } from '../whatsapp/client.js';
import { type EventFilterEntry, eventMatchesFilters } from './filter.js';
import { type AnyWhapprEvent, createEvent } from './types.js';

export function wireWebhookForwarding(
  client: WhatsappClient,
  buffer: WebhookBuffer,
  filters: EventFilterEntry[],
  logger: Logger,
): void {
  const emit = (event: AnyWhapprEvent): void => {
    if (!eventMatchesFilters(event, filters)) {
      logger.debug({ eventType: event.type }, 'event filtered out');
      return;
    }
    buffer.enqueue(event);
  };

  client.on('msg.received', (payload) => emit(createEvent('msg.received', payload)));
  client.on('msg.sent', (payload) => emit(createEvent('msg.sent', payload)));
  client.on('msg.acked', (payload) => emit(createEvent('msg.acked', payload)));
  client.on('msg.edited', (payload) => emit(createEvent('msg.edited', payload)));
  client.on('msg.reacted', (payload) => emit(createEvent('msg.reacted', payload)));
  client.on('msg.revoked', (payload) => emit(createEvent('msg.revoked', payload)));
}
