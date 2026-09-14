import { randomUUID } from 'node:crypto';
import type {
  MessageAckPayload,
  MessageEditPayload,
  MessagePayload,
  MessageReactionPayload,
  MessageRevokedPayload,
} from '../whatsapp/client.js';

export interface WhapprEvent<Type extends string = string, Data = unknown> {
  type: Type;
  id: string;
  timestamp: Date;
  data: Data;
}

export type MessageReceivedEvent = WhapprEvent<'message.received', MessagePayload>;
export type MessageSentEvent = WhapprEvent<'message.sent', MessagePayload>;
export type MessageAckEvent = WhapprEvent<'message.ack', MessageAckPayload>;
export type MessageEditedEvent = WhapprEvent<'message.edited', MessageEditPayload>;
export type MessageReactionEvent = WhapprEvent<'message.reaction', MessageReactionPayload>;
export type MessageRevokedEvent = WhapprEvent<'message.revoked', MessageRevokedPayload>;

// Add new members here as more event types are introduced later — purely additive.
export type AnyWhapprEvent =
  | MessageReceivedEvent
  | MessageSentEvent
  | MessageAckEvent
  | MessageEditedEvent
  | MessageReactionEvent
  | MessageRevokedEvent;

export function createEvent<Type extends string, Data>(
  type: Type,
  data: Data,
): WhapprEvent<Type, Data> {
  return { type, id: randomUUID(), timestamp: new Date(), data };
}
