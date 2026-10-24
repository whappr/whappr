import { type AnyWhapprEvent, WHAPPR_EVENT_TYPES } from '@whappr/protocol';
import type { Logger } from 'pino';
import type { ConfigService } from '../config.js';
import type { Whatsapp } from '../whatsapp/index.js';

/**
 * Whether `event` should be POSTed: its type is one of `eventTypes`, it comes from one of
 * `chatIds` and, for events that have a sender, its sender is one of `senderIds` (empty means
 * every chat or sender). WhatsApp may address a person by their `@lid` instead of their `@c.us` id,
 * so an unlisted `@lid` chat or sender is matched by its phone-based id too. Never rejects.
 */
export function createWebhookFilter(
  config: ConfigService<'filterEventTypes' | 'filterChatIds' | 'filterSenderIds'>,
  logger: Logger,
  whatsapp: Pick<Whatsapp, 'phoneIdOf'>,
): (event: AnyWhapprEvent) => Promise<boolean> {
  const eventTypes = config.get('filterEventTypes');
  const chatIds = config.get('filterChatIds');
  const senderIds = config.get('filterSenderIds');
  // Only hits are cached, so an id WhatsApp doesn't know yet is looked up again next time.
  const phoneIds = new Map<string, string>();

  logger.info(
    {
      eventTypes: eventTypes.size === WHAPPR_EVENT_TYPES.length ? 'all' : [...eventTypes],
      chatIds: chatIds.size === 0 ? 'all' : [...chatIds],
      senderIds: senderIds.size === 0 ? 'all' : [...senderIds],
    },
    'webhook filters',
  );

  async function matches(ids: ReadonlySet<string>, id: string): Promise<boolean> {
    if (ids.size === 0 || ids.has(id)) return true;
    if (!id.endsWith('@lid')) return false;
    let phoneId = phoneIds.get(id) ?? null;
    if (!phoneId) {
      phoneId = await whatsapp.phoneIdOf(id).catch((error) => {
        logger.warn({ error, id }, 'failed to look up phone-based id');
        return null;
      });
      if (phoneId) phoneIds.set(id, phoneId);
    }
    return phoneId !== null && ids.has(phoneId);
  }

  return async (event) => {
    if (!eventTypes.has(event.type)) return false;
    const chatId = event.data.chat.id;
    if (!(await matches(chatIds, chatId))) {
      logger.debug(
        { eventId: event.id, type: event.type, chatId },
        'event not sent: chat not listed',
      );
      return false;
    }
    // Group events have no sender: they're filtered by type and chat only.
    if (!('sender' in event.data)) return true;
    const senderId = event.data.sender.id;
    if (!(await matches(senderIds, senderId))) {
      logger.debug(
        { eventId: event.id, type: event.type, chatId, senderId },
        'event not sent: sender not listed',
      );
      return false;
    }
    return true;
  };
}
