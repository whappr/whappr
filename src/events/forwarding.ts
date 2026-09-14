import type { Logger } from '../logging/logger.js';
import type { WebhookBuffer } from '../webhook/buffer.js';
import type { WhatsappClient } from '../whatsapp/client.js';
import { type EventFilterEntry, eventMatchesRules } from './filter.js';
import { type AnyWhapprEvent, createEvent } from './types.js';

export function wireWebhookForwarding(
  client: WhatsappClient,
  webhookBuffer: WebhookBuffer,
  eventFilterRules: EventFilterEntry[],
  logger: Logger,
): void {
  const emit = (event: AnyWhapprEvent): void => {
    if (!eventMatchesRules(event, eventFilterRules)) {
      logger.debug({ eventType: event.type }, 'event filtered out');
      return;
    }
    webhookBuffer.enqueue(event);
  };

  client.on('message.received', (payload) => emit(createEvent('message.received', payload)));
  client.on('message.sent', (payload) => emit(createEvent('message.sent', payload)));
  client.on('message.ack', (payload) => emit(createEvent('message.ack', payload)));
  client.on('message.edited', (payload) => emit(createEvent('message.edited', payload)));
  client.on('message.reaction', (payload) => emit(createEvent('message.reaction', payload)));
  client.on('message.revoked', (payload) => emit(createEvent('message.revoked', payload)));
}
