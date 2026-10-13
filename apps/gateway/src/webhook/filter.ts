import { type AnyWhapprEvent, WHAPPR_EVENT_TYPES, type WhapprEventType } from '@whappr/protocol';
import type { Logger } from 'pino';
import type { WhatsappClient } from '../whatsapp/client.js';

/**
 * Whether `event` should be POSTed: its type is one of `eventTypes` and it comes from one of
 * `chatIds` (empty means every chat). WhatsApp may address a direct chat by its `@lid` instead of
 * its `@c.us` id, so an unlisted `@lid` chat is matched by its phone-based id too. Never rejects.
 */
export function createWebhookFilter(opts: {
  eventTypes: ReadonlySet<WhapprEventType>;
  /** Chat ids (`@c.us`, `@g.us`, `@lid`). */
  chatIds: ReadonlySet<string>;
  client: Pick<WhatsappClient, 'phoneIdOf'>;
  logger: Logger;
}): (event: AnyWhapprEvent) => Promise<boolean> {
  const { eventTypes, chatIds, client, logger } = opts;
  // Only hits are cached, so a chat WhatsApp doesn't know yet is looked up again next time.
  const phoneIds = new Map<string, string>();

  logger.info(
    {
      eventTypes: eventTypes.size === WHAPPR_EVENT_TYPES.length ? 'all' : [...eventTypes],
      chatIds: chatIds.size === 0 ? 'all' : [...chatIds],
    },
    'webhook filters',
  );

  async function matchesChat(chatId: string): Promise<boolean> {
    if (chatIds.size === 0 || chatIds.has(chatId)) return true;
    if (!chatId.endsWith('@lid')) return false;
    let phoneId = phoneIds.get(chatId) ?? null;
    if (!phoneId) {
      phoneId = await client.phoneIdOf(chatId).catch((error) => {
        logger.warn({ error, chatId }, 'failed to look up phone-based id of chat');
        return null;
      });
      if (phoneId) phoneIds.set(chatId, phoneId);
    }
    return phoneId !== null && chatIds.has(phoneId);
  }

  return async (event) => {
    if (!eventTypes.has(event.type)) return false;
    const chatId = event.data.chat.id;
    if (await matchesChat(chatId)) return true;
    logger.debug(
      { eventId: event.id, type: event.type, chatId },
      'event not sent: chat not listed',
    );
    return false;
  };
}
