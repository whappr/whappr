import type { Logger } from '../logging/logger.js';
import type { WebhookBuffer } from '../webhook/buffer.js';
import type { WhatsappClient } from '../whatsapp/client.js';
import { eventMatchesRules, type FilterRule } from './filter.js';
import { type AnyWhapprEvent, createEvent } from './types.js';

export function forwardEventsToBuffer(
  client: WhatsappClient,
  buffer: WebhookBuffer,
  rules: FilterRule[],
  logger: Logger,
): void {
  const forwardIfAllowed = (event: AnyWhapprEvent): void => {
    if (!eventMatchesRules(event, rules)) {
      logger.debug({ eventType: event.type }, 'event filtered out');
      return;
    }
    buffer.enqueue(event);
  };

  client.on('msg.received', (payload) => forwardIfAllowed(createEvent('msg.received', payload)));
  client.on('msg.sent', (payload) => forwardIfAllowed(createEvent('msg.sent', payload)));
  client.on('msg.acked', (payload) => forwardIfAllowed(createEvent('msg.acked', payload)));
  client.on('msg.edited', (payload) => forwardIfAllowed(createEvent('msg.edited', payload)));
  client.on('msg.reacted', (payload) => forwardIfAllowed(createEvent('msg.reacted', payload)));
  client.on('msg.revoked', (payload) => forwardIfAllowed(createEvent('msg.revoked', payload)));
}
