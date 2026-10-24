import type { Message, SendMessageRequest } from '@whappr/protocol';
import type wwebjs from 'whatsapp-web.js';
import type { ConfigService } from '../config.js';
import { mediaTooLargeError, WhatsappError } from './errors.js';
import { findMessage, readMessage, resolveChatId } from './lookup.js';
import { mediaOf } from './mappers.js';
import { loadOutgoingMedia } from './media.js';
import type { ReadyContext, Session } from './session.js';

export interface DownloadedMedia {
  data: Buffer<ArrayBuffer>;
  mimeType: string;
  fileName?: string;
}

export type Messages = ReturnType<typeof createMessages>;

export function createMessages(config: ConfigService<'mediaMaxBytes'>, session: Session) {
  const mediaMaxBytes = config.get('mediaMaxBytes');

  async function toOwnMessage(ctx: ReadyContext, message: wwebjs.Message): Promise<Message> {
    const normalized = await readMessage(ctx, message);
    if (!normalized) {
      throw new WhatsappError('WhatsApp returned an unrecognized message', 'OPERATION_FAILED');
    }
    return normalized;
  }

  /** An empty `emoji` removes the reaction. */
  async function setReaction(messageId: string, emoji: string): Promise<void> {
    const ctx = session.ready();
    const message = await findMessage(ctx, messageId);
    await message.react(emoji).catch((cause) => {
      throw new WhatsappError('Failed to react to WhatsApp message', 'OPERATION_FAILED', cause);
    });
  }

  return {
    async send(request: SendMessageRequest): Promise<Message> {
      const ctx = session.ready();
      const chatId = await resolveChatId(ctx, request.to);
      if (request.replyTo) await findMessage(ctx, request.replyTo);

      const options: wwebjs.MessageSendOptions = { quotedMessageId: request.replyTo };
      let content: wwebjs.MessageContent;
      if (request.media) {
        const { media, kind } = await loadOutgoingMedia(request.media, mediaMaxBytes);
        // WhatsApp can't caption audio, so `text` is dropped for it rather than rejected.
        if (kind !== 'audio' && kind !== 'voice') options.caption = request.text;
        options.sendAudioAsVoice = kind === 'voice';
        options.sendMediaAsDocument = kind === 'document';
        content = media;
      } else {
        content = request.text;
      }

      const sent = await ctx.wa.sendMessage(chatId, content, options).catch((cause) => {
        throw new WhatsappError('Failed to send WhatsApp message', 'OPERATION_FAILED', cause);
      });
      return await toOwnMessage(ctx, sent);
    },

    async edit(messageId: string, text: string): Promise<Message> {
      const ctx = session.ready();
      const message = await findMessage(ctx, messageId);
      const edited = await message.edit(text).catch((cause) => {
        throw new WhatsappError('Failed to edit WhatsApp message', 'OPERATION_FAILED', cause);
      });
      if (!edited) throw new WhatsappError('Edit not allowed', 'EDIT_NOT_ALLOWED');
      return await toOwnMessage(ctx, edited);
    },

    /** Deletes the message for everyone. */
    async delete(messageId: string): Promise<void> {
      const ctx = session.ready();
      const message = await findMessage(ctx, messageId);
      await message.delete(true).catch((cause) => {
        throw new WhatsappError('Failed to delete WhatsApp message', 'OPERATION_FAILED', cause);
      });
    },

    async react(messageId: string, emoji: string): Promise<void> {
      await setReaction(messageId, emoji);
    },

    async unreact(messageId: string): Promise<void> {
      await setReaction(messageId, '');
    },

    async downloadMedia(messageId: string): Promise<DownloadedMedia> {
      const ctx = session.ready();
      const message = await findMessage(ctx, messageId);
      if (!message.hasMedia) throw new WhatsappError('Message has no media', 'MEDIA_NOT_FOUND');

      // Checked up front: the whole file passes through Chromium and Puppeteer as base64.
      const { size } = mediaOf(message);
      if (size !== undefined && size > mediaMaxBytes) throw mediaTooLargeError(mediaMaxBytes);

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
    },
  };
}
