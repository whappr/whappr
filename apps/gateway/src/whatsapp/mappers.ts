import type {
  Chat,
  Group,
  GroupSummary,
  MediaInfo,
  Message,
  MessageDeletedData,
  MessageEditedData,
  MessageKind,
  Participant,
  ReactionAddedData,
  ReplyContext,
} from '@whappr/protocol';
import wwebjs from 'whatsapp-web.js';
import type { KnownIds, Me } from './session.js';
import {
  authorIdOf,
  chatTypeOf,
  membersOf,
  mentionedIdsOf,
  messageIdOf,
  optionalString,
  rawField,
  userOf,
} from './wweb.js';

// Pure functions from whatsapp-web.js structures to protocol types. Whatever has to be fetched from
// WhatsApp Web first (a quoted message, contact names) is passed in, see `readMessage`.

const { MessageTypes } = wwebjs;

// whatsapp-web.js types not listed here aren't user content (system notifications, protocol
// messages, revocations, ...) and are dropped. Albums too: their items arrive as separate
// image/video messages.
const KIND_BY_TYPE: Partial<Record<string, MessageKind>> = {
  [MessageTypes.TEXT]: 'text',
  [MessageTypes.IMAGE]: 'image',
  [MessageTypes.VIDEO]: 'video',
  [MessageTypes.AUDIO]: 'audio',
  [MessageTypes.VOICE]: 'voice',
  [MessageTypes.DOCUMENT]: 'document',
  [MessageTypes.STICKER]: 'sticker',
  [MessageTypes.LOCATION]: 'location',
  [MessageTypes.CONTACT_CARD]: 'contact',
  [MessageTypes.CONTACT_CARD_MULTI]: 'contact',
  [MessageTypes.POLL_CREATION]: 'unsupported',
  [MessageTypes.SCHEDULED_EVENT_CREATION]: 'unsupported',
  [MessageTypes.GROUP_INVITE]: 'unsupported',
  [MessageTypes.ORDER]: 'unsupported',
  [MessageTypes.PRODUCT]: 'unsupported',
  [MessageTypes.PAYMENT]: 'unsupported',
  [MessageTypes.LIST]: 'unsupported',
  [MessageTypes.LIST_RESPONSE]: 'unsupported',
  [MessageTypes.BUTTONS_RESPONSE]: 'unsupported',
  [MessageTypes.TEMPLATE_BUTTON_REPLY]: 'unsupported',
  [MessageTypes.INTERACTIVE]: 'unsupported',
  [MessageTypes.NATIVE_FLOW]: 'unsupported',
  [MessageTypes.HSM]: 'unsupported',
  [MessageTypes.OVERSIZED]: 'unsupported',
};

/** What `toMessage` needs fetched from WhatsApp Web beforehand. */
export interface MessageExtras {
  /** The message replied to, when it could be fetched. */
  quoted?: wwebjs.Message;
  /** Names of the mentioned contacts, by id, where known. */
  names: ReadonlyMap<string, string>;
}

/** Who's who: the account, and the ids WhatsApp knows for everyone else (see `peopleOf`). */
export interface People {
  me: Me;
  known: ReadonlyMap<string, KnownIds>;
}

/** `null` for conversations out of scope, see `chatTypeOf`. */
export function toChat(id: string): Chat | null {
  const type = chatTypeOf(id);
  return type && { id, type };
}

export function toGroupChat(groupId: string): Chat {
  return { id: groupId, type: 'group' };
}

// The phone-based and privacy ids of someone WhatsApp sent as `id`: as looked up, else `id` itself.
function idsOf(id: string, { me, known }: People): { phoneId?: string; lid?: string } {
  if (me.ids.has(id)) return { phoneId: me.id, lid: me.lid };
  const found = known.get(id);
  return {
    phoneId: found?.pn ?? (id.endsWith('@c.us') ? id : undefined),
    lid: found?.lid ?? (id.endsWith('@lid') ? id : undefined),
  };
}

/**
 * Anyone, by any of their ids: `id` is their phone-based id when known, else their privacy id, so
 * every id the account appears under becomes `me.id`. The account's own name replaces `name`.
 */
export function participant(id: string, people: People, name?: string): Participant {
  const { phoneId, lid } = idsOf(id, people);
  const isMe = people.me.ids.has(id);
  return {
    id: phoneId ?? id,
    phone: phoneId && userOf(phoneId),
    lid,
    name: isMe ? people.me.name : name,
    isMe,
  };
}

// Unlike `participant`, `id` stays exactly as WhatsApp sent it, even for the account: consumers find
// the mention in `text` by its user part.
function mention(id: string, people: People, names: ReadonlyMap<string, string>): Participant {
  return { ...participant(id, people, names.get(id)), id };
}

/** The people a message @-mentions, with `names` as `mentionNamesOf` found them. */
function mentionsOf(
  message: wwebjs.Message,
  people: People,
  names: ReadonlyMap<string, string>,
): { mentions: Participant[]; mentionsMe: boolean } {
  const mentions = mentionedIdsOf(message).map((id) => mention(id, people, names));
  return { mentions, mentionsMe: mentions.some((mention) => mention.isMe) };
}

function chatOf(message: wwebjs.Message): Chat | null {
  return toChat(message.fromMe ? message.to : message.from);
}

function kindOf(message: wwebjs.Message): MessageKind | null {
  return KIND_BY_TYPE[message.type] ?? null;
}

/** The id WhatsApp sent the message's sender as, unless the account sent it. */
export function senderIdOf(message: wwebjs.Message): string | undefined {
  return message.fromMe ? undefined : message.author || message.from;
}

function senderOf(message: wwebjs.Message, people: People): Participant {
  const name = optionalString(rawField(message, 'notifyName'));
  return participant(senderIdOf(message) ?? people.me.id, people, name);
}

// For locations and contacts `body` holds a thumbnail or the raw vCard, not text.
function textOf(message: wwebjs.Message, kind: MessageKind): string | undefined {
  if (kind === 'location' || kind === 'contact') return undefined;
  return optionalString(message.body);
}

function replyContextOf(quoted: wwebjs.Message, people: People): ReplyContext {
  return {
    id: messageIdOf(quoted.id),
    sender: senderOf(quoted, people),
    text: textOf(quoted, kindOf(quoted) ?? 'unsupported'),
  };
}

export function mediaOf(message: wwebjs.Message): MediaInfo {
  const size = rawField(message, 'size');
  const duration = Number(message.duration);
  return {
    mimeType: optionalString(rawField(message, 'mimetype')) ?? 'application/octet-stream',
    fileName: optionalString(rawField(message, 'filename')),
    size: typeof size === 'number' ? size : undefined,
    duration: Number.isFinite(duration) && duration > 0 ? duration : undefined,
  };
}

/** Whether the message is user content in a conversation in scope, which `toMessage` maps. */
export function isUserMessage(message: wwebjs.Message): boolean {
  return chatOf(message) !== null && kindOf(message) !== null;
}

/** `null` unless `isUserMessage`. */
export function toMessage(
  message: wwebjs.Message,
  people: People,
  extras: MessageExtras,
): Message | null {
  const chat = chatOf(message);
  const kind = kindOf(message);
  if (!chat || !kind) return null;

  const base = {
    id: messageIdOf(message.id),
    chat,
    sender: senderOf(message, people),
    timestamp: new Date(message.timestamp * 1000).toISOString(),
    text: textOf(message, kind),
    replyTo: extras.quoted && replyContextOf(extras.quoted, people),
    ...mentionsOf(message, people, extras.names),
  };

  switch (kind) {
    case 'text':
      return { ...base, kind, text: base.text ?? '' };
    case 'location': {
      const { latitude, longitude, name, address } = message.location;
      return {
        ...base,
        kind,
        location: { latitude: Number(latitude), longitude: Number(longitude), name, address },
      };
    }
    case 'contact':
      return { ...base, kind, contacts: message.vCards.map((vcard) => ({ vcard })) };
    case 'unsupported':
      return { ...base, kind };
    default:
      return { ...base, kind, media: mediaOf(message) };
  }
}

export function toEditedData(
  message: wwebjs.Message,
  text: string,
  previousText: string,
  people: People,
  names: ReadonlyMap<string, string>,
): MessageEditedData | null {
  const chat = chatOf(message);
  if (!chat) return null;
  return {
    messageId: messageIdOf(message.id),
    chat,
    sender: senderOf(message, people),
    text,
    previousText: optionalString(previousText),
    // WhatsApp Web updates a message's mentions along with its text, before the edit is reported.
    ...mentionsOf(message, people, names),
  };
}

export function toDeletedData(message: wwebjs.Message, people: People): MessageDeletedData | null {
  const chat = chatOf(message);
  if (!chat) return null;
  return { messageId: messageIdOf(message.id), chat, sender: senderOf(message, people) };
}

/** An empty `emoji` means the reaction was removed. */
/** The id WhatsApp sent the reaction's sender as, unless the account reacted. */
export function reactorIdOf(reaction: wwebjs.Reaction): string | undefined {
  return reaction.id.fromMe ? undefined : reaction.senderId;
}

export function toReactionData(
  reaction: wwebjs.Reaction,
  people: People,
): ReactionAddedData | null {
  const chat = toChat(reaction.msgId.remote);
  if (!chat) return null;
  return {
    messageId: messageIdOf(reaction.msgId),
    chat,
    sender: participant(reactorIdOf(reaction) ?? people.me.id, people),
    emoji: reaction.reaction,
  };
}

export function toGroupSummary(chat: wwebjs.GroupChat): GroupSummary {
  return { id: chat.id._serialized, name: chat.name };
}

export function toGroup(chat: wwebjs.GroupChat, people: People): Group {
  const participants = membersOf(chat).map(({ id, isAdmin }) => ({
    ...participant(id, people),
    isAdmin,
  }));
  return { ...toGroupSummary(chat), participants };
}

/** Who performed a group notification's action on `subjectId`, unless they did it themselves. */
export function authorOf(
  notification: wwebjs.GroupNotification,
  subjectId: string,
  people: People,
): Participant | undefined {
  const { ids } = people.me;
  const authorId = authorIdOf(notification);
  if (!authorId || authorId === subjectId) return undefined;
  if (ids.has(authorId) && ids.has(subjectId)) return undefined;
  return participant(authorId, people);
}
