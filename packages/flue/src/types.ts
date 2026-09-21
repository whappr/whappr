/**
 * Wire DTOs for the Whappr gateway's webhook payload. Hand-mirrored from
 * apps/gateway/src/events/types.ts and the `to*Payload` builders in
 * apps/gateway/src/whatsapp/client.ts, the same way packages/client/src/types.ts
 * duplicates them — the gateway isn't a publishable dependency, so these shapes
 * are kept in sync by hand rather than imported.
 */
export interface MessagePayload {
  id: string;
  from: string;
  to: string;
  author?: string;
  body: string;
  timestamp: number;
  fromMe: boolean;
  type: string;
}

export interface MessageAckPayload {
  id: string;
  from: string;
  to: string;
  type: string;
}

export interface MessageEditPayload {
  id: string;
  from: string;
  to: string;
  timestamp: number;
  newBody: string;
  oldBody: string;
}

export interface MessageReactionPayload {
  msgId: string;
  senderId: string;
  reaction: string;
  timestamp: number;
}

export interface MessageRevokedPayload {
  id: string;
  from: string;
  to: string;
  timestamp: number;
  body?: string;
}

export interface WhapprEvent<Type extends string = string, Data = unknown> {
  type: Type;
  id: string;
  /** ISO-8601 timestamp string on the wire (a `Date` on the gateway's own side). */
  timestamp: string;
  data: Data;
}

export type MessageReceivedEvent = WhapprEvent<'msg.received', MessagePayload>;
export type MessageSentEvent = WhapprEvent<'msg.sent', MessagePayload>;
export type MessageAckEvent = WhapprEvent<'msg.acked', MessageAckPayload>;
export type MessageEditedEvent = WhapprEvent<'msg.edited', MessageEditPayload>;
export type MessageReactionEvent = WhapprEvent<'msg.reacted', MessageReactionPayload>;
export type MessageRevokedEvent = WhapprEvent<'msg.revoked', MessageRevokedPayload>;

export interface CommandInvokedPayload extends MessagePayload {
  command: string;
  args: string[];
}

export type CommandInvokedEvent = WhapprEvent<'cmd.invoked', CommandInvokedPayload>;

export type AnyWhapprEvent =
  | MessageReceivedEvent
  | MessageSentEvent
  | MessageAckEvent
  | MessageEditedEvent
  | MessageReactionEvent
  | MessageRevokedEvent
  | CommandInvokedEvent;
