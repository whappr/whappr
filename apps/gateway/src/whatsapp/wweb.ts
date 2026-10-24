import type { ChatType } from '@whappr/protocol';
import type wwebjs from 'whatsapp-web.js';
import { WhatsappError } from './errors.js';

// Every read of a whatsapp-web.js shape its typings get wrong, or that WhatsApp Web changed under
// it, lives here.

export function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** A field of the WhatsApp Web model behind a message that whatsapp-web.js doesn't expose. */
export function rawField(message: wwebjs.Message, key: string): unknown {
  return (message.rawData as Record<string, unknown>)[key];
}

/** `null` for conversations out of scope: status updates, broadcast lists, channels. */
export function chatTypeOf(id: string): ChatType | null {
  if (id.endsWith('@g.us')) return 'group';
  if (id.endsWith('@c.us') || id.endsWith('@lid')) return 'direct';
  return null;
}

/** The part of an id before the `@`: the phone number of a `…@c.us` id. */
export function userOf(id: string): string {
  return id.slice(0, id.indexOf('@'));
}

// Ids arrive either serialized or as whatsapp-web.js id objects, depending on the code path. Raw
// WhatsApp Web ids (group notification recipients, group participants) may only carry `$1`, see
// `messageIdOf`.
export function serializeId(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null) {
    const { _serialized, $1 } = value as { _serialized?: unknown; $1?: unknown };
    return optionalString(_serialized) ?? optionalString($1);
  }
  return undefined;
}

function serializeIds(values: unknown[]): string[] {
  return values.map((value) => serializeId(value)).filter((id) => id !== undefined);
}

/**
 * The serialized id of a whatsapp-web.js message key, e.g. `false_123@lid_3EB0ABC`. Throws
 * rather than returning `undefined`, so no event or response ever goes out without its id.
 *
 * WhatsApp Web's July 2026 update renamed `_serialized` to `$1`, which whatsapp-web.js 1.34.7
 * doesn't know about. Our patch (`patches/whatsapp-web.js+1.34.7.patch`) restores `_serialized`
 * on `Message` ids, but not on reaction keys (`Reaction.msgId`, which upstream doesn't normalize
 * either), so this also reads `$1` directly.
 *
 * REMOVE the `$1` fallback once whatsapp-web.js normalizes `Reaction.msgId`.
 */
export function messageIdOf(key: wwebjs.MessageId): string {
  const { $1 } = key as { $1?: unknown };
  const id = optionalString(key._serialized) ?? optionalString($1);
  if (!id) throw new WhatsappError('WhatsApp returned a message without an id', 'OPERATION_FAILED');
  return id;
}

/** Whether `id` has the shape whatsapp-web.js requires of a serialized message id. */
export function isMessageId(id: string): boolean {
  const parts = id.split('_').length;
  return parts === 3 || parts === 4;
}

/** The ids a message @-mentions, exactly as WhatsApp sent them. */
export function mentionedIdsOf(message: wwebjs.Message): string[] {
  return serializeIds(message.mentionedIds);
}

// Typed as `ContactId`s, but the ids are copied raw from WhatsApp Web: a string or an id object.
type RawGroupParticipant = { id: unknown; isAdmin?: boolean; isSuperAdmin?: boolean };

/** A group's current members, the account included while it's one of them. */
export function membersOf(chat: wwebjs.GroupChat): { id: string; isAdmin: boolean }[] {
  const members: { id: string; isAdmin: boolean }[] = [];
  for (const raw of chat.participants as unknown as RawGroupParticipant[]) {
    const id = serializeId(raw.id);
    if (id !== undefined) members.push({ id, isAdmin: Boolean(raw.isAdmin || raw.isSuperAdmin) });
  }
  return members;
}

/** The people a group notification is about, in the order WhatsApp lists them. */
export function recipientIdsOf(notification: wwebjs.GroupNotification): string[] {
  return serializeIds(notification.recipientIds);
}

export function authorIdOf(notification: wwebjs.GroupNotification): string | undefined {
  return serializeId(notification.author);
}

/** A group created with the account as a member, which arrives as a `group_update`. */
export function isGroupCreation(notification: wwebjs.GroupNotification): boolean {
  // `create` is missing from whatsapp-web.js's `GroupNotificationTypes`.
  return String(notification.type) === 'create';
}
