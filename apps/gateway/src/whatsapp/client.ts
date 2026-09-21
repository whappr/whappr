import { EventEmitter } from 'node:events';
import wwebjs from 'whatsapp-web.js';
import type { Env } from '../config/env.js';
import { WhatsappError } from './errors.js';

const { Client, LocalAuth, MessageAck } = wwebjs;
type Message = wwebjs.Message;
type Reaction = wwebjs.Reaction;

export interface MessagePayload {
  id: string;
  from: string;
  to: string;
  body: string;
  timestamp: number;
  fromMe: boolean;
  type: string;
}

export function toMessagePayload(message: Message): MessagePayload {
  return {
    id: message.id._serialized,
    from: message.from,
    to: message.to,
    body: message.body,
    timestamp: message.timestamp,
    fromMe: message.fromMe,
    type: message.type,
  };
}

const ACK_TYPES: Record<number, string> = {
  [MessageAck.ACK_ERROR]: 'ERROR',
  [MessageAck.ACK_PENDING]: 'PENDING',
  [MessageAck.ACK_SERVER]: 'SERVER',
  [MessageAck.ACK_DEVICE]: 'DEVICE',
  [MessageAck.ACK_READ]: 'READ',
  [MessageAck.ACK_PLAYED]: 'PLAYED',
};

export interface MessageAckPayload {
  id: string;
  from: string;
  to: string;
  type: string;
}

export function toMessageAckPayload(message: Message, ack: number): MessageAckPayload {
  return {
    id: message.id._serialized,
    from: message.from,
    to: message.to,
    type: ACK_TYPES[ack] ?? 'UNKNOWN',
  };
}

export interface MessageEditPayload {
  id: string;
  from: string;
  to: string;
  timestamp: number;
  newBody: string;
  oldBody: string;
}

export function toMessageEditPayload(
  message: Message,
  newBody: string,
  oldBody: string,
): MessageEditPayload {
  return {
    id: message.id._serialized,
    from: message.from,
    to: message.to,
    timestamp: message.timestamp,
    newBody,
    oldBody,
  };
}

export interface MessageReactionPayload {
  msgId: string;
  senderId: string;
  reaction: string;
  timestamp: number;
}

export function toMessageReactionPayload(reaction: Reaction): MessageReactionPayload {
  return {
    msgId: reaction.msgId._serialized,
    senderId: reaction.senderId,
    reaction: reaction.reaction,
    timestamp: reaction.timestamp,
  };
}

export interface MessageRevokedPayload {
  id: string;
  from: string;
  to: string;
  timestamp: number;
  body: string | null;
}

export function toMessageRevokedPayload(
  message: Message,
  revokedMessage: Message | null | undefined,
): MessageRevokedPayload {
  return {
    id: message.id._serialized,
    from: message.from,
    to: message.to,
    timestamp: message.timestamp,
    body: revokedMessage?.body ?? null,
  };
}

export interface WhatsappClientEventMap {
  'msg.received': [payload: MessagePayload];
  'msg.sent': [payload: MessagePayload];
  'msg.acked': [payload: MessageAckPayload];
  'msg.edited': [payload: MessageEditPayload];
  'msg.reacted': [payload: MessageReactionPayload];
  'msg.revoked': [payload: MessageRevokedPayload];
  'conn.qr_received': [qr: string];
  'conn.authenticated': [];
  'conn.ready': [];
  'conn.auth_failed': [message: string];
  'conn.disconnected': [reason: wwebjs.WAState | 'LOGOUT'];
}

/**
 * Prefer {@link createWhatsappClient} for construction.
 */
export class WhatsappClient extends EventEmitter<WhatsappClientEventMap> {
  readonly #client: wwebjs.Client;

  constructor(env: Env) {
    super();

    this.#client = new Client({
      authStrategy: new LocalAuth({ dataPath: env.WHAPPR_SESSION_PATH }),
      puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] },
    });

    this.#bindListeners();
  }

  async initialize(): Promise<void> {
    await this.#client.initialize();
  }

  async destroy(): Promise<void> {
    await this.#client.destroy();
  }

  async logout(): Promise<void> {
    await this.#client.logout();
  }

  async sendMessage(
    chatId: string,
    content: wwebjs.MessageContent,
    options?: wwebjs.MessageSendOptions,
  ): Promise<Message> {
    return await this.#client.sendMessage(chatId, content, options).catch((cause) => {
      throw new WhatsappError('Failed to send WhatsApp message', 'OPERATION_FAILED', cause);
    });
  }

  async editMessage(messageId: string, text: string): Promise<MessageEditPayload> {
    const message = await this.#findMessage(messageId);

    const oldBody = message.body;
    const edited = await message.edit(text).catch((cause) => {
      throw new WhatsappError('Failed to edit WhatsApp message', 'OPERATION_FAILED', cause);
    });
    if (!edited) throw new WhatsappError('Edit not allowed', 'EDIT_NOT_ALLOWED');

    return toMessageEditPayload(edited, text, oldBody);
  }

  async deleteMessage(messageId: string): Promise<void> {
    const message = await this.#findMessage(messageId);
    await message.delete(true).catch((cause) => {
      throw new WhatsappError('Failed to delete WhatsApp message', 'OPERATION_FAILED', cause);
    });
  }

  async reactToMessage(messageId: string, reaction: string): Promise<void> {
    const message = await this.#findMessage(messageId);
    await message.react(reaction).catch((cause) => {
      throw new WhatsappError('Failed to react to WhatsApp message', 'OPERATION_FAILED', cause);
    });
  }

  async replyToMessage(messageId: string, text: string): Promise<MessagePayload> {
    const message = await this.#findMessage(messageId);
    const reply = await message.reply(text).catch((cause) => {
      throw new WhatsappError('Failed to reply to WhatsApp message', 'OPERATION_FAILED', cause);
    });
    return toMessagePayload(reply);
  }

  async #findMessage(messageId: string): Promise<Message> {
    const message = await this.#client.getMessageById(messageId).catch(() => null);
    if (!message) throw new WhatsappError('Message not found', 'MESSAGE_NOT_FOUND');
    return message;
  }

  #bindListeners(): void {
    const client = this.#client;

    client.on('qr', (qr) => {
      this.emit('conn.qr_received', qr);
    });

    client.on('authenticated', () => {
      this.emit('conn.authenticated');
    });

    client.on('ready', () => {
      this.emit('conn.ready');
    });

    client.on('auth_failure', (message) => {
      this.emit('conn.auth_failed', message);
    });

    client.on('disconnected', (reason) => {
      this.emit('conn.disconnected', reason);
    });

    client.on('message', (message) => {
      if (message.type !== 'chat' || message.fromMe) {
        return;
      }
      this.emit('msg.received', toMessagePayload(message));
    });

    client.on('message_create', (message) => {
      if (message.type !== 'chat' || !message.fromMe) {
        return;
      }
      this.emit('msg.sent', toMessagePayload(message));
    });

    client.on('message_ack', (message, ack) => {
      this.emit('msg.acked', toMessageAckPayload(message, ack));
    });

    client.on('message_edit', (message, newBody, oldBody) => {
      this.emit('msg.edited', toMessageEditPayload(message, String(newBody), String(oldBody)));
    });

    client.on('message_reaction', (reaction) => {
      this.emit('msg.reacted', toMessageReactionPayload(reaction));
    });

    client.on('message_revoke_everyone', (message, revokedMessage) => {
      this.emit('msg.revoked', toMessageRevokedPayload(message, revokedMessage));
    });
  }
}

export function createWhatsappClient(env: Env): WhatsappClient {
  return new WhatsappClient(env);
}
