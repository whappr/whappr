import type { Message } from '@whappr/protocol';
import type wwebjs from 'whatsapp-web.js';
import { WhatsappError } from './errors.js';
import { isUserMessage, type People, senderIdOf, toMessage } from './mappers.js';
import type { Me, ReadyContext } from './session.js';
import { chatTypeOf, isMessageId, membersOf, mentionedIdsOf, optionalString } from './wweb.js';

// Reads from WhatsApp Web, all with the same rules: what doesn't exist (or is out of scope) throws
// its `*_NOT_FOUND` code, any other failure `OPERATION_FAILED`.

const chatNotFound = () => new WhatsappError('Chat not found', 'CHAT_NOT_FOUND');

/** A chat id as given, or the id of the WhatsApp account of a phone number. */
export async function resolveChatId({ wa }: ReadyContext, chatIdOrPhone: string): Promise<string> {
  if (chatIdOrPhone.includes('@')) return chatIdOrPhone;

  const phoneNumber = chatIdOrPhone.replace(/\D/g, '');
  const numberId =
    phoneNumber === ''
      ? null
      : await wa.getNumberId(phoneNumber).catch((cause) => {
          throw new WhatsappError('Failed to look up recipient', 'OPERATION_FAILED', cause);
        });
  if (!numberId) {
    throw new WhatsappError(`${chatIdOrPhone} is not on WhatsApp`, 'RECIPIENT_NOT_FOUND');
  }
  return numberId._serialized;
}

/**
 * A direct or group chat. Chats the gateway never forwards events for (status updates, channels,
 * ...) count as not found, so the API only ever targets conversations an agent can see.
 */
export async function findChat(ctx: ReadyContext, chatIdOrPhone: string): Promise<wwebjs.Chat> {
  const chatId = await resolveChatId(ctx, chatIdOrPhone);
  if (!chatTypeOf(chatId)) throw chatNotFound();
  const chat = await ctx.wa.getChatById(chatId).catch((cause) => {
    throw new WhatsappError('Failed to look up WhatsApp chat', 'OPERATION_FAILED', cause);
  });
  if (!chat) throw chatNotFound();
  return chat;
}

/** A group, fetched again on every call: a `GroupChat`'s participants go stale. */
export async function fetchGroup(
  { wa }: ReadyContext,
  groupId: string,
): Promise<wwebjs.GroupChat | null> {
  // Typed as always resolving to a chat, but resolves `undefined` for an unknown one.
  const chat: wwebjs.Chat | undefined = await wa.getChatById(groupId).catch((cause) => {
    throw new WhatsappError('Failed to look up WhatsApp group', 'OPERATION_FAILED', cause);
  });
  return chat?.isGroup ? (chat as wwebjs.GroupChat) : null;
}

/** A group the account is a member of. Only `…@g.us` ids, so it's never a direct chat. */
export async function findGroup(ctx: ReadyContext, groupId: string): Promise<wwebjs.GroupChat> {
  if (chatTypeOf(groupId) !== 'group') throw chatNotFound();
  const chat = await fetchGroup(ctx, groupId);
  if (!chat || !isMember(chat, ctx.me)) throw chatNotFound();
  return chat;
}

/** Whether the account is one of a group's current members. */
export function isMember(chat: wwebjs.GroupChat, me: Me): boolean {
  return membersOf(chat).some(({ id }) => me.ids.has(id));
}

export async function findMessage(
  { wa }: ReadyContext,
  messageId: string,
): Promise<wwebjs.Message> {
  const message = isMessageId(messageId)
    ? await wa.getMessageById(messageId).catch((cause) => {
        throw new WhatsappError('Failed to look up WhatsApp message', 'OPERATION_FAILED', cause);
      })
    : null;
  if (!message) throw new WhatsappError('Message not found', 'MESSAGE_NOT_FOUND');
  return message;
}

/**
 * The message normalized, with what that needs from WhatsApp Web: the quoted message and the
 * mentioned contacts' names. Either is left out when it can't be fetched. `null` unless
 * `isUserMessage`.
 */
export async function readMessage(
  ctx: ReadyContext,
  message: wwebjs.Message,
): Promise<Message | null> {
  if (!isUserMessage(message)) return null;

  const quoted = message.hasQuotedMsg
    ? await message.getQuotedMessage().catch(() => undefined)
    : undefined;
  const names = await mentionNamesOf(ctx, message);
  const people = await peopleOf(ctx, [
    senderIdOf(message),
    quoted && senderIdOf(quoted),
    ...mentionedIdsOf(message),
  ]);
  return toMessage(message, people, { quoted, names });
}

/**
 * The names of the contacts a message @-mentions, by id: as saved by the paired account, else their
 * own display name. A name that can't be fetched is left out.
 */
export async function mentionNamesOf(
  { wa, me }: ReadyContext,
  message: wwebjs.Message,
): Promise<Map<string, string>> {
  // One by one rather than `message.getMentions()`, which loses every name if one lookup fails.
  const names = new Map<string, string>();
  await Promise.all(
    mentionedIdsOf(message)
      .filter((id) => !me.ids.has(id))
      .map(async (id) => {
        const contact = await wa.getContactById(id).catch(() => undefined);
        const name = optionalString(contact?.name) ?? optionalString(contact?.pushname);
        if (name) names.set(id, name);
      }),
  );
  return names;
}

/**
 * Who's who for the mappers: the phone-based and privacy ids WhatsApp knows for everyone in `ids`.
 * Each id is looked up once per session: one that fails is left as WhatsApp sent it, and tried again
 * next time.
 */
export async function peopleOf(
  { wa, me, known }: ReadyContext,
  ids: (string | undefined)[],
): Promise<People> {
  const unknown = new Set(
    ids.filter((id): id is string => id !== undefined && !me.ids.has(id) && !known.has(id)),
  );
  // One by one, so one failed lookup doesn't lose the others.
  await Promise.all(
    [...unknown].map(async (id) => {
      const [found] = await wa.getContactLidAndPhone([id]).catch(() => []);
      if (found) known.set(id, { pn: found.pn || undefined, lid: found.lid || undefined });
    }),
  );
  return { me, known };
}

/** The phone-based (`@c.us`) id of a `@lid` account, or `null` if WhatsApp doesn't know it. */
export async function phoneIdOf({ wa }: ReadyContext, lid: string): Promise<string | null> {
  const [found] = await wa.getContactLidAndPhone([lid]).catch((cause) => {
    throw new WhatsappError('Failed to look up phone-based id', 'OPERATION_FAILED', cause);
  });
  return found?.pn ?? null;
}
