import { randomUUID } from 'node:crypto';
import type {
  MessageAckPayload,
  MessageEditPayload,
  MessagePayload,
  MessageReactionPayload,
  MessageRevokedPayload,
} from '../whatsapp/client.js';
import type { CommandInvokedPayload } from './commands.js';

export interface WhapprEvent<Type extends string = string, Data = unknown> {
  type: Type;
  id: string;
  timestamp: Date;
  data: Data;
}

export type MessageReceivedEvent = WhapprEvent<'msg.received', MessagePayload>;
export type MessageSentEvent = WhapprEvent<'msg.sent', MessagePayload>;
export type MessageAckEvent = WhapprEvent<'msg.acked', MessageAckPayload>;
export type MessageEditedEvent = WhapprEvent<'msg.edited', MessageEditPayload>;
export type MessageReactionEvent = WhapprEvent<'msg.reacted', MessageReactionPayload>;
export type MessageRevokedEvent = WhapprEvent<'msg.revoked', MessageRevokedPayload>;
export type CommandInvokedEvent = WhapprEvent<'cmd.invoked', CommandInvokedPayload>;

// Add new members here as more event types are introduced later — purely additive.
export type AnyWhapprEvent =
  | MessageReceivedEvent
  | MessageSentEvent
  | MessageAckEvent
  | MessageEditedEvent
  | MessageReactionEvent
  | MessageRevokedEvent
  | CommandInvokedEvent;

export function createEvent<Type extends string, Data>(
  type: Type,
  data: Data,
): WhapprEvent<Type, Data> {
  return { type, id: randomUUID(), timestamp: new Date(), data };
}
