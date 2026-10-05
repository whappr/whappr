import type {
  Chat,
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

const { MessageTypes } = wwebjs;
type WwebMessage = wwebjs.Message;
type WwebReaction = wwebjs.Reaction;

/** The paired account. `ids` holds every id it may appear under (phone-based and `@lid`). */
export interface Me {
  id: string;
  ids: ReadonlySet<string>;
  phone: string;
  name?: string;
}

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

/** `null` for conversations out of scope: status updates, broadcast lists, channels. */
export function toChat(id: string): Chat | null {
  if (id.endsWith('@g.us')) return { id, type: 'group' };
  if (id.endsWith('@c.us') || id.endsWith('@lid')) return { id, type: 'direct' };
  return null;
}

function chatOf(message: WwebMessage): Chat | null {
  return toChat(message.fromMe ? message.to : message.from);
}

function kindOf(message: WwebMessage): MessageKind | null {
  return KIND_BY_TYPE[message.type] ?? null;
}

function rawField(message: WwebMessage, key: string): unknown {
  return (message.rawData as Record<string, unknown>)[key];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

// Ids arrive either serialized or as whatsapp-web.js id objects, depending on the code path.
function serializeId(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && '_serialized' in value) {
    return optionalString(value._serialized);
  }
  return undefined;
}

function senderOf(message: WwebMessage, me: Me): Participant {
  if (message.fromMe) return { id: me.id, name: me.name, isMe: true };
  return {
    id: message.author || message.from,
    name: optionalString(rawField(message, 'notifyName')),
    isMe: false,
  };
}

// For locations and contacts `body` holds a thumbnail or the raw vCard, not text.
function textOf(message: WwebMessage, kind: MessageKind): string | undefined {
  if (kind === 'location' || kind === 'contact') return undefined;
  return optionalString(message.body);
}

export function mediaOf(message: WwebMessage): MediaInfo {
  const size = rawField(message, 'size');
  const duration = Number(message.duration);
  return {
    mimeType: optionalString(rawField(message, 'mimetype')) ?? 'application/octet-stream',
    fileName: optionalString(rawField(message, 'filename')),
    size: typeof size === 'number' ? size : undefined,
    duration: Number.isFinite(duration) && duration > 0 ? duration : undefined,
  };
}

async function replyContextOf(message: WwebMessage, me: Me): Promise<ReplyContext | undefined> {
  if (!message.hasQuotedMsg) return undefined;
  const quoted = await message.getQuotedMessage().catch(() => undefined);
  if (!quoted) return undefined;
  return {
    id: quoted.id._serialized,
    sender: { id: senderOf(quoted, me).id, isMe: quoted.fromMe },
    text: textOf(quoted, kindOf(quoted) ?? 'unsupported'),
  };
}

/** `null` when the message isn't user content or belongs to an out-of-scope conversation. */
export async function toMessage(message: WwebMessage, me: Me): Promise<Message | null> {
  const chat = chatOf(message);
  const kind = kindOf(message);
  if (!chat || !kind) return null;

  const mentions = message.mentionedIds
    .map((id: unknown) => serializeId(id))
    .filter((id) => id !== undefined);

  const base = {
    id: message.id._serialized,
    chat,
    sender: senderOf(message, me),
    timestamp: new Date(message.timestamp * 1000).toISOString(),
    text: textOf(message, kind),
    replyTo: await replyContextOf(message, me),
    mentions,
    mentionsMe: mentions.some((id) => me.ids.has(id)),
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
  message: WwebMessage,
  text: string,
  previousText: string,
  me: Me,
): MessageEditedData | null {
  const chat = chatOf(message);
  if (!chat) return null;
  return {
    messageId: message.id._serialized,
    chat,
    sender: senderOf(message, me),
    text,
    previousText: optionalString(previousText),
  };
}

export function toDeletedData(message: WwebMessage, me: Me): MessageDeletedData | null {
  const chat = chatOf(message);
  if (!chat) return null;
  return { messageId: message.id._serialized, chat, sender: senderOf(message, me) };
}

/** An empty `emoji` means the reaction was removed. */
export function toReactionData(reaction: WwebReaction, me: Me): ReactionAddedData | null {
  const chat = toChat(reaction.msgId.remote);
  if (!chat) return null;
  const isMe = reaction.id.fromMe;
  return {
    messageId: reaction.msgId._serialized,
    chat,
    sender: isMe ? { id: me.id, name: me.name, isMe } : { id: reaction.senderId, isMe },
    emoji: reaction.reaction,
  };
}
