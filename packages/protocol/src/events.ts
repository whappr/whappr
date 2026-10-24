import type { Chat, Message, Participant } from './messages.js';

/** Envelope of every webhook event. */
export interface WhapprEvent<Type extends string = string, Data = unknown> {
  /** Unique per event — use it to de-duplicate. */
  id: string;
  type: Type;
  /** When the gateway observed the event, ISO 8601. */
  timestamp: string;
  data: Data;
}

/**
 * Points at an existing message. Every event's `data` carries `chat`, so routing an
 * event to its conversation never depends on the event type.
 */
export interface MessageRef {
  messageId: string;
  chat: Chat;
}

export interface MessageEditedData extends MessageRef {
  sender: Participant;
  text: string;
  previousText?: string;
  /** The participants @-mentioned in the new `text`, like a message's `mentions`. */
  mentions: Participant[];
  /** `true` when the paired account is among `mentions`. */
  mentionsMe: boolean;
}

export interface MessageDeletedData extends MessageRef {
  sender: Participant;
}

export interface ReactionAddedData extends MessageRef {
  sender: Participant;
  emoji: string;
}

export interface ReactionRemovedData extends MessageRef {
  sender: Participant;
}

/** The paired account is now a member of a group: added by someone, or a member when it was created. */
export interface GroupJoinedData {
  chat: Chat;
  /** Who added the account, when WhatsApp says. */
  author?: Participant;
  /** The group's members right after the join, the account included. */
  participants: Participant[];
}

/**
 * The paired account is no longer a member of a group: an admin removed it, or it left through the
 * API. Leaving from the phone or another linked device sends no event: WhatsApp doesn't notify it.
 */
export interface GroupLeftData {
  chat: Chat;
  /** Who removed the account, when `reason` is `removed`. */
  author?: Participant;
  /** `removed` — an admin removed the account. `left` — it left through the API. */
  reason: 'removed' | 'left';
}

/** Someone else joined a group the account is in. */
export interface GroupParticipantJoinedData {
  chat: Chat;
  /** Who added them, when someone did. */
  author?: Participant;
  participant: Participant;
}

/** Someone else left, or was removed from, a group the account is in. */
export interface GroupParticipantLeftData {
  chat: Chat;
  /** Who removed them, when `reason` is `removed`. */
  author?: Participant;
  participant: Participant;
  reason: 'left' | 'removed';
}

/** Someone else sent a message to the paired account (directly or in a group). */
export type MessageReceivedEvent = WhapprEvent<'message.received', Message>;
export type MessageEditedEvent = WhapprEvent<'message.edited', MessageEditedData>;
/** A message was deleted for everyone. */
export type MessageDeletedEvent = WhapprEvent<'message.deleted', MessageDeletedData>;
/** A reaction was set — or replaced, since a participant holds one reaction per message. */
export type ReactionAddedEvent = WhapprEvent<'reaction.added', ReactionAddedData>;
export type ReactionRemovedEvent = WhapprEvent<'reaction.removed', ReactionRemovedData>;
export type GroupJoinedEvent = WhapprEvent<'group.joined', GroupJoinedData>;
export type GroupLeftEvent = WhapprEvent<'group.left', GroupLeftData>;
export type GroupParticipantJoinedEvent = WhapprEvent<
  'group.participant.joined',
  GroupParticipantJoinedData
>;
export type GroupParticipantLeftEvent = WhapprEvent<
  'group.participant.left',
  GroupParticipantLeftData
>;

export type AnyWhapprEvent =
  | MessageReceivedEvent
  | MessageEditedEvent
  | MessageDeletedEvent
  | ReactionAddedEvent
  | ReactionRemovedEvent
  | GroupJoinedEvent
  | GroupLeftEvent
  | GroupParticipantJoinedEvent
  | GroupParticipantLeftEvent;

export type WhapprEventType = AnyWhapprEvent['type'];

/** Every event type, e.g. to validate the gateway's `WEBHOOK_EVENT_TYPES`. */
export const WHAPPR_EVENT_TYPES = [
  'message.received',
  'message.edited',
  'message.deleted',
  'reaction.added',
  'reaction.removed',
  'group.joined',
  'group.left',
  'group.participant.joined',
  'group.participant.left',
] as const satisfies readonly WhapprEventType[];

/** Body of one signed webhook delivery: a single event. */
export type WebhookPayload = AnyWhapprEvent;
