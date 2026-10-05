import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import type { AnyWhapprEvent, Message, SendMessageRequest, SessionState } from '@whappr/protocol';
import type { Logger } from 'pino';
import qrcode from 'qrcode';
import wwebjs from 'whatsapp-web.js';
import { WhatsappError } from './errors.js';
import { loadOutgoingMedia, mediaTooLargeError } from './media.js';
import {
  type Me,
  mediaOf,
  toChat,
  toDeletedData,
  toEditedData,
  toMessage,
  toReactionData,
} from './normalize.js';

const { Client, LocalAuth } = wwebjs;
type WwebMessage = wwebjs.Message;

/** An event before the client stamps it with an `id` and a `timestamp`. */
type UnstampedEvent<E = AnyWhapprEvent> = E extends AnyWhapprEvent
  ? Omit<E, 'id' | 'timestamp'>
  : never;

export interface DownloadedMedia {
  data: Buffer<ArrayBuffer>;
  mimeType: string;
  fileName?: string;
}

export interface WhatsappClientOptions {
  /** Holds the paired session (`auth/`) and the WhatsApp Web version cache (`cache/`). */
  dataDir: string;
  mediaMaxBytes: number;
  logger: Logger;
}

/**
 * Owns the whatsapp-web.js client: its session lifecycle (pairing, restarts, logout), the
 * operations the API exposes, and the webhook events it emits as `event`.
 */
export class WhatsappClient extends EventEmitter<{ event: [event: AnyWhapprEvent] }> {
  readonly #client: wwebjs.Client;
  readonly #logger: Logger;
  readonly #mediaMaxBytes: number;
  #state: Omit<SessionState, 'account'> = { status: 'starting', qr: null };
  #me: Me | null = null;
  #restartInFlight: Promise<void> | null = null;
  // Normalizing can await WhatsApp Web (e.g. for a quoted message); chaining every listener
  // keeps events in the order whatsapp-web.js emitted them.
  #queue: Promise<void> = Promise.resolve();

  constructor({ dataDir, mediaMaxBytes, logger }: WhatsappClientOptions) {
    super();

    this.#logger = logger;
    this.#mediaMaxBytes = mediaMaxBytes;
    this.#client = new Client({
      authStrategy: new LocalAuth({ dataPath: join(dataDir, 'auth') }),
      webVersionCache: { type: 'local', path: join(dataDir, 'cache') },
      puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] },
    });

    this.#bindListeners();
  }

  get state(): SessionState {
    const me = this.#state.status === 'ready' ? this.#me : null;
    return { ...this.#state, account: me && { id: me.id, phone: me.phone, name: me.name } };
  }

  async start(): Promise<void> {
    this.#state = { status: 'starting', qr: null };
    try {
      await this.#client.initialize();
    } catch (error) {
      this.#logger.error({ error }, 'failed to initialize WhatsApp client');
      this.#state = { status: 'failed', qr: null, error: 'Failed to start the WhatsApp client' };
    }
  }

  async stop(): Promise<void> {
    try {
      await this.#client.destroy();
    } finally {
      this.#state = { status: 'disconnected', qr: null };
    }
  }

  async logout(): Promise<void> {
    if (this.#state.status !== 'ready') {
      throw new WhatsappError('Not authenticated', 'NOT_AUTHENTICATED');
    }
    try {
      await this.#client.logout();
    } finally {
      this.#state = { status: 'disconnected', qr: null };
    }
    await this.#restart();
  }

  async sendMessage(request: SendMessageRequest): Promise<Message> {
    const me = this.#ready();
    const chatId = await this.#resolveChatId(request.to);
    if (request.replyTo) await this.#findMessage(request.replyTo);
    const options: wwebjs.MessageSendOptions = { quotedMessageId: request.replyTo };

    if (!request.media) {
      return await this.#normalizeOwn(await this.#send(chatId, request.text, options), me);
    }

    const { media, kind } = await loadOutgoingMedia(request.media, this.#mediaMaxBytes);
    // WhatsApp can't caption audio, so `text` is dropped for it rather than rejected.
    const captioned = kind !== 'audio' && kind !== 'voice';
    const sent = await this.#send(chatId, media, {
      ...options,
      caption: captioned ? request.text : undefined,
      sendAudioAsVoice: kind === 'voice',
      sendMediaAsDocument: kind === 'document',
    });
    return await this.#normalizeOwn(sent, me);
  }

  async editMessage(messageId: string, text: string): Promise<Message> {
    const me = this.#ready();
    const message = await this.#findMessage(messageId);

    const edited = await message.edit(text).catch((cause) => {
      throw new WhatsappError('Failed to edit WhatsApp message', 'OPERATION_FAILED', cause);
    });
    if (!edited) throw new WhatsappError('Edit not allowed', 'EDIT_NOT_ALLOWED');

    return await this.#normalizeOwn(edited, me);
  }

  async deleteMessage(messageId: string): Promise<void> {
    this.#ready();
    const message = await this.#findMessage(messageId);
    await message.delete(true).catch((cause) => {
      throw new WhatsappError('Failed to delete WhatsApp message', 'OPERATION_FAILED', cause);
    });
  }

  /** An empty `emoji` removes the reaction. */
  async reactToMessage(messageId: string, emoji: string): Promise<void> {
    this.#ready();
    const message = await this.#findMessage(messageId);
    await message.react(emoji).catch((cause) => {
      throw new WhatsappError('Failed to react to WhatsApp message', 'OPERATION_FAILED', cause);
    });
  }

  async downloadMedia(messageId: string): Promise<DownloadedMedia> {
    this.#ready();
    const message = await this.#findMessage(messageId);
    if (!message.hasMedia) throw new WhatsappError('Message has no media', 'MEDIA_NOT_FOUND');

    // Checked up front: the whole file passes through Chromium and Puppeteer as base64.
    const { size } = mediaOf(message);
    if (size !== undefined && size > this.#mediaMaxBytes) {
      throw mediaTooLargeError(this.#mediaMaxBytes);
    }

    const media = await message.downloadMedia().catch((cause) => {
      throw new WhatsappError('Failed to download WhatsApp media', 'OPERATION_FAILED', cause);
    });
    // whatsapp-web.js resolves empty when WhatsApp no longer serves the file (expired,
    // pending re-upload, or deleted from its servers).
    if (!media) {
      throw new WhatsappError('Media is no longer available from WhatsApp', 'MEDIA_UNAVAILABLE');
    }

    return {
      data: Buffer.from(media.data, 'base64'),
      mimeType: media.mimetype,
      fileName: media.filename ?? undefined,
    };
  }

  /** Shows "typing…" in the chat; WhatsApp clears it after ~25s or when a message is sent. */
  async setTyping(chatIdOrPhone: string, typing: boolean): Promise<void> {
    this.#ready();
    const chat = await this.#findChat(chatIdOrPhone);
    await (typing ? chat.sendStateTyping() : chat.clearState()).catch((cause) => {
      throw new WhatsappError('Failed to update typing state', 'OPERATION_FAILED', cause);
    });
  }

  async markAsRead(chatIdOrPhone: string): Promise<void> {
    this.#ready();
    const chat = await this.#findChat(chatIdOrPhone);
    const seen = await chat.sendSeen().catch((cause) => {
      throw new WhatsappError('Failed to mark chat as read', 'OPERATION_FAILED', cause);
    });
    if (!seen) throw new WhatsappError('Chat not found', 'CHAT_NOT_FOUND');
  }

  /** The paired account, or `NOT_READY` until the client is ready. */
  #ready(): Me {
    if (this.#state.status !== 'ready' || !this.#me) {
      throw new WhatsappError('WhatsApp client is not ready', 'NOT_READY');
    }
    return this.#me;
  }

  #restart(): Promise<void> {
    this.#restartInFlight ??= (async () => {
      try {
        await this.#client.destroy();
      } catch (error) {
        this.#logger.error({ error }, 'error destroying WhatsApp client during restart');
      }
      await this.start();
    })().finally(() => {
      this.#restartInFlight = null;
    });
    return this.#restartInFlight;
  }

  // Chats the gateway never forwards events for (status updates, channels, ...) count as
  // not found, so the API only ever targets conversations an agent can see.
  async #findChat(chatIdOrPhone: string): Promise<wwebjs.Chat> {
    const chatId = await this.#resolveChatId(chatIdOrPhone);
    const chat = toChat(chatId)
      ? await this.#client.getChatById(chatId).catch(() => undefined)
      : undefined;
    if (!chat) throw new WhatsappError('Chat not found', 'CHAT_NOT_FOUND');
    return chat;
  }

  async #resolveChatId(to: string): Promise<string> {
    if (to.includes('@')) return to;

    const phoneNumber = to.replace(/\D/g, '');
    const numberId =
      phoneNumber === ''
        ? null
        : await this.#client.getNumberId(phoneNumber).catch((cause) => {
            throw new WhatsappError('Failed to look up recipient', 'OPERATION_FAILED', cause);
          });
    if (!numberId) {
      throw new WhatsappError(`${to} is not on WhatsApp`, 'RECIPIENT_NOT_FOUND');
    }
    return numberId._serialized;
  }

  async #send(
    chatId: string,
    content: wwebjs.MessageContent,
    options: wwebjs.MessageSendOptions,
  ): Promise<WwebMessage> {
    return await this.#client.sendMessage(chatId, content, options).catch((cause) => {
      throw new WhatsappError('Failed to send WhatsApp message', 'OPERATION_FAILED', cause);
    });
  }

  async #normalizeOwn(message: WwebMessage, me: Me): Promise<Message> {
    const normalized = await toMessage(message, me);
    if (!normalized) {
      throw new WhatsappError('WhatsApp returned an unrecognized message', 'OPERATION_FAILED');
    }
    return normalized;
  }

  async #findMessage(messageId: string): Promise<WwebMessage> {
    const message = await this.#client.getMessageById(messageId).catch(() => null);
    if (!message) throw new WhatsappError('Message not found', 'MESSAGE_NOT_FOUND');
    return message;
  }

  async #resolveMe(): Promise<void> {
    const { wid, pushname } = this.#client.info;
    const ids = new Set([wid._serialized]);
    try {
      const [entry] = await this.#client.getContactLidAndPhone([wid._serialized]);
      if (entry?.lid) ids.add(entry.lid);
    } catch (error) {
      this.#logger.warn({ error }, 'failed to resolve own @lid id; mentionsMe may miss mentions');
    }
    this.#me = { id: wid._serialized, ids, phone: wid.user, name: pushname || undefined };
  }

  #emitEvent(event: UnstampedEvent): void {
    this.emit('event', { ...event, id: randomUUID(), timestamp: new Date().toISOString() });
  }

  /** Runs `task` after every previously enqueued one, once the paired account is known. */
  #enqueue(description: string, task: (me: Me) => Promise<void> | void): void {
    this.#queue = this.#queue.then(async () => {
      if (!this.#me) {
        this.#logger.debug(`skipped ${description}: client not ready`);
        return;
      }
      try {
        await task(this.#me);
      } catch (error) {
        this.#logger.error({ error }, `failed to handle ${description}`);
      }
    });
  }

  #bindListeners(): void {
    const client = this.#client;

    client.on('qr', (qr) => {
      qrcode
        .toDataURL(qr)
        .then((dataUrl) => {
          this.#state = { status: 'awaiting_scan', qr: dataUrl };
        })
        .catch((error) => this.#logger.error({ error }, 'failed to render QR code'));
    });

    // Scanned; still loading until `ready`.
    client.on('authenticated', () => {
      this.#state = { status: 'starting', qr: null };
    });

    client.on('ready', () => {
      void this.#resolveMe().finally(() => {
        this.#state = { status: 'ready', qr: null };
      });
    });

    client.on('auth_failure', (message) => {
      this.#logger.error({ reason: message }, 'WhatsApp authentication failure');
      this.#state = { status: 'failed', qr: null, error: 'WhatsApp authentication failed' };
    });

    client.on('disconnected', (reason) => {
      this.#logger.error({ reason }, 'WhatsApp client disconnected');
      this.#me = null;
      this.#state = { status: 'disconnected', qr: null };
      void this.#restart();
    });

    client.on('message', (message) => {
      if (message.fromMe) return;
      this.#enqueue('received message', async (me) => {
        const data = await toMessage(message, me);
        if (data) this.#emitEvent({ type: 'message.received', data });
      });
    });

    client.on('message_edit', (message, newBody, prevBody) => {
      this.#enqueue('message edit', (me) => {
        const data = toEditedData(message, String(newBody), String(prevBody), me);
        if (data) this.#emitEvent({ type: 'message.edited', data });
      });
    });

    client.on('message_reaction', (reaction) => {
      this.#enqueue('reaction', (me) => {
        const data = toReactionData(reaction, me);
        if (!data) return;
        if (data.emoji === '') {
          const { emoji: _, ...removed } = data;
          this.#emitEvent({ type: 'reaction.removed', data: removed });
        } else {
          this.#emitEvent({ type: 'reaction.added', data });
        }
      });
    });

    client.on('message_revoke_everyone', (message) => {
      this.#enqueue('message deletion', (me) => {
        const data = toDeletedData(message, me);
        if (data) this.#emitEvent({ type: 'message.deleted', data });
      });
    });
  }
}
