import { EventEmitter } from 'node:events';
import qrcode from 'qrcode';
import wwebjs from 'whatsapp-web.js';
import type { Env } from '../config/env.js';
import type { Logger } from '../logging/logger.js';
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
  'message.received': [payload: MessagePayload];
  'message.sent': [payload: MessagePayload];
  'message.ack': [payload: MessageAckPayload];
  'message.edited': [payload: MessageEditPayload];
  'message.reaction': [payload: MessageReactionPayload];
  'message.revoked': [payload: MessageRevokedPayload];
}

export type Status =
  | 'INITIALIZING'
  | 'AWAITING_SCAN'
  | 'AUTHENTICATED'
  | 'READY'
  | 'AUTHENTICATION_FAILED'
  | 'DISCONNECTED';

export interface SessionState {
  status: Status;
  qr: string | null;
}

/**
 * Prefer {@link createWhatsappClient} for construction.
 */
export class WhatsappClient extends EventEmitter<WhatsappClientEventMap> {
  readonly #client: wwebjs.Client;
  readonly #logger: Logger;
  #state: SessionState = { status: 'INITIALIZING', qr: null };
  #restartInFlight: Promise<void> | null = null;

  constructor(env: Env, logger: Logger) {
    super();
    this.#logger = logger;

    this.#client = new Client({
      authStrategy: new LocalAuth({ dataPath: env.WHAPPR_SESSION_PATH }),
    });

    this.#bindListeners();
    this.#initialize();
  }

  getState(): SessionState {
    return this.#state;
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

  async destroy(): Promise<void> {
    try {
      await this.#client.destroy();
    } finally {
      this.#setState({ status: 'DISCONNECTED', qr: null });
    }
  }

  async logout(): Promise<void> {
    const { status } = this.getState();
    if (status !== 'AUTHENTICATED' && status !== 'READY') {
      throw new WhatsappError('Not authenticated', 'NOT_AUTHENTICATED');
    }
    try {
      await this.#client.logout();
    } finally {
      this.#setState({ status: 'DISCONNECTED', qr: null });
    }
    await this.#restart();
  }

  #restart(): Promise<void> {
    this.#restartInFlight ??= this.#doRestart().finally(() => {
      this.#restartInFlight = null;
    });
    return this.#restartInFlight;
  }

  async #doRestart(): Promise<void> {
    try {
      await this.#client.destroy();
    } catch (error) {
      this.#logger.error({ error }, 'error destroying WhatsApp client during restart');
    }
    this.#setState({ status: 'INITIALIZING', qr: null });
    this.#initialize();
  }

  #initialize(): void {
    this.#client.initialize().catch((error) => {
      this.#setState({ status: 'AUTHENTICATION_FAILED' });
      this.#logger.error({ error }, 'failed to initialize WhatsApp client');
    });
  }

  async #findMessage(messageId: string): Promise<Message> {
    const message = await this.#client.getMessageById(messageId).catch(() => null);
    if (!message) throw new WhatsappError('Message not found', 'MESSAGE_NOT_FOUND');
    return message;
  }

  #setState(patch: Partial<SessionState>): void {
    this.#state = { ...this.#state, ...patch };
  }

  #bindListeners(): void {
    const client = this.#client;

    client.on('qr', (qr) => {
      qrcode
        .toDataURL(qr)
        .then((dataUrl) => {
          this.#setState({ status: 'AWAITING_SCAN', qr: dataUrl });
        })
        .catch((error) => this.#logger.error({ error }, 'failed to render QR code'));
    });

    client.on('authenticated', () => {
      this.#setState({ status: 'AUTHENTICATED', qr: null });
    });

    client.on('ready', () => {
      this.#setState({ status: 'READY' });
    });

    client.on('auth_failure', (message) => {
      this.#logger.error({ reason: message }, 'WhatsApp authentication failure');
      this.#setState({ status: 'AUTHENTICATION_FAILED' });
    });

    client.on('disconnected', (reason) => {
      this.#logger.error({ reason }, 'WhatsApp client disconnected');
      this.#setState({ status: 'DISCONNECTED', qr: null });
      void this.#restart();
    });

    client.on('message', (message) => {
      if (message.type !== 'chat' || message.fromMe) {
        return;
      }
      this.emit('message.received', toMessagePayload(message));
    });

    client.on('message_create', (message) => {
      if (message.type !== 'chat' || !message.fromMe) {
        return;
      }
      this.emit('message.sent', toMessagePayload(message));
    });

    client.on('message_ack', (message, ack) => {
      this.emit('message.ack', toMessageAckPayload(message, ack));
    });

    client.on('message_edit', (message, newBody, oldBody) => {
      this.emit('message.edited', toMessageEditPayload(message, String(newBody), String(oldBody)));
    });

    client.on('message_reaction', (reaction) => {
      this.emit('message.reaction', toMessageReactionPayload(reaction));
    });

    client.on('message_revoke_everyone', (message, revokedMessage) => {
      this.emit('message.revoked', toMessageRevokedPayload(message, revokedMessage));
    });
  }
}

export function createWhatsappClient(env: Env, logger: Logger): WhatsappClient {
  return new WhatsappClient(env, logger);
}
