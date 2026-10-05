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

/** Someone else sent a message to the paired account (directly or in a group). */
export type MessageReceivedEvent = WhapprEvent<'message.received', Message>;
export type MessageEditedEvent = WhapprEvent<'message.edited', MessageEditedData>;
/** A message was deleted for everyone. */
export type MessageDeletedEvent = WhapprEvent<'message.deleted', MessageDeletedData>;
/** A reaction was set — or replaced, since a participant holds one reaction per message. */
export type ReactionAddedEvent = WhapprEvent<'reaction.added', ReactionAddedData>;
export type ReactionRemovedEvent = WhapprEvent<'reaction.removed', ReactionRemovedData>;

export type AnyWhapprEvent =
  | MessageReceivedEvent
  | MessageEditedEvent
  | MessageDeletedEvent
  | ReactionAddedEvent
  | ReactionRemovedEvent;

export type WhapprEventType = AnyWhapprEvent['type'];

/** Every event type, e.g. to validate the gateway's `WEBHOOK_EVENTS`. */
export const WHAPPR_EVENT_TYPES = [
  'message.received',
  'message.edited',
  'message.deleted',
  'reaction.added',
  'reaction.removed',
] as const satisfies readonly WhapprEventType[];

/** Body of one signed webhook delivery: a single event. */
export type WebhookPayload = AnyWhapprEvent;
