/** Whether a conversation is one-to-one or a group. */
export type ChatType = 'direct' | 'group';

/**
 * A WhatsApp conversation. `id` is opaque (e.g. `"1555123456@c.us"`, `"1203...@g.us"`):
 * store it and pass it back as-is, never parse it.
 */
export interface Chat {
  id: string;
  type: ChatType;
}

/** Whoever authored a message or a reaction. */
export interface Participant {
  /**
   * Opaque id. Depending on the contact's privacy settings this is either phone-based
   * (`"1555123456@c.us"`) or a privacy id (`"...@lid"`) that carries no phone number.
   */
  id: string;
  /** The display name the user set for themselves, when WhatsApp provides one. */
  name?: string;
  /** `true` when this is the account the gateway is paired with. */
  isMe: boolean;
}

/** Kinds of message that carry a downloadable file. */
export type MediaKind = 'image' | 'video' | 'audio' | 'voice' | 'document' | 'sticker';

/**
 * What a message contains. `audio` is an attached audio file, `voice` a recorded voice
 * note. `unsupported` is anything the gateway doesn't model yet (polls, payments, ...) —
 * it's still delivered so the agent knows something arrived.
 */
export type MessageKind = 'text' | MediaKind | 'location' | 'contact' | 'unsupported';

/** Metadata of a message's file. The file itself is fetched via `GET /api/messages/:id/media`. */
export interface MediaInfo {
  mimeType: string;
  fileName?: string;
  /** In bytes. */
  size?: number;
  /** In seconds, for `audio`, `voice` and `video`. */
  duration?: number;
}

export interface Location {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface ContactCard {
  /** Raw vCard 3.0 text. */
  vcard: string;
}

/** The message being replied to (quoted), as known when the reply was received. */
export interface ReplyContext {
  id: string;
  sender: {
    id: string;
    isMe: boolean;
  };
  text?: string;
}

interface MessageBase {
  id: string;
  /** The conversation this message belongs to — the same for both directions. */
  chat: Chat;
  sender: Participant;
  /** When WhatsApp says the message was sent, ISO 8601. */
  timestamp: string;
  /** Body for `text`, caption for media. */
  text?: string;
  replyTo?: ReplyContext;
  /** Ids of the participants @-mentioned in `text`. Always empty outside groups. */
  mentions: string[];
  /** `true` when the paired account is among `mentions`. */
  mentionsMe: boolean;
}

export interface TextMessage extends MessageBase {
  kind: 'text';
  text: string;
}

export interface MediaMessage extends MessageBase {
  kind: MediaKind;
  media: MediaInfo;
}

export interface LocationMessage extends MessageBase {
  kind: 'location';
  location: Location;
}

export interface ContactMessage extends MessageBase {
  kind: 'contact';
  contacts: ContactCard[];
}

export interface UnsupportedMessage extends MessageBase {
  kind: 'unsupported';
}

/** A normalized WhatsApp message. Narrow on `kind` to reach kind-specific fields. */
export type Message =
  | TextMessage
  | MediaMessage
  | LocationMessage
  | ContactMessage
  | UnsupportedMessage;
