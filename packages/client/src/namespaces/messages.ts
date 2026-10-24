import type {
  EditMessageRequest,
  Message,
  MessageResponse,
  SendMessageRequest,
  SetReactionRequest,
} from '@whappr/protocol';
import type { RequestOptions, Transport } from '../transport.js';

export interface SendOptions extends RequestOptions {
  /**
   * Sent as `Idempotency-Key`: the Gateway sends a message once per key, and answers a repeated
   * call with the same key with the message it already sent. Lets you retry a timed-out
   * `send()` safely, or derive the key from the event you're replying to.
   */
  idempotencyKey?: string;
}

export interface MessagesApi {
  /** POST /api/messages — set `replyTo` to send it as a reply, `media` to send a file. */
  send(input: SendMessageRequest, options?: SendOptions): Promise<Message>;
  /** PATCH /api/messages/:id */
  edit(messageId: string, input: EditMessageRequest, options?: RequestOptions): Promise<Message>;
  /** DELETE /api/messages/:id — deletes for everyone. */
  delete(messageId: string, options?: RequestOptions): Promise<void>;
  /**
   * GET /api/messages/:id/media — the message's file. `blob.type` is its MIME type; its
   * name, if any, is in the message's `media.fileName`.
   */
  downloadMedia(messageId: string, options?: RequestOptions): Promise<Blob>;
  /** PUT /api/messages/:id/reaction — sets, or replaces, your reaction. */
  react(messageId: string, input: SetReactionRequest, options?: RequestOptions): Promise<void>;
  /** DELETE /api/messages/:id/reaction */
  unreact(messageId: string, options?: RequestOptions): Promise<void>;
}

function messagePath(messageId: string, suffix = ''): string {
  return `/api/messages/${encodeURIComponent(messageId)}${suffix}`;
}

export function createMessagesApi(transport: Transport): MessagesApi {
  return {
    async send(input, options) {
      const { idempotencyKey, ...requestOptions } = options ?? {};
      const { message } = await transport.request<MessageResponse>(
        {
          method: 'POST',
          path: '/api/messages',
          body: input,
          headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
        },
        requestOptions,
      );
      return message;
    },
    async edit(messageId, input, options) {
      const { message } = await transport.request<MessageResponse>(
        { method: 'PATCH', path: messagePath(messageId), body: input },
        options,
      );
      return message;
    },
    async delete(messageId, options) {
      await transport.request({ method: 'DELETE', path: messagePath(messageId) }, options);
    },
    downloadMedia(messageId, options) {
      return transport.request<Blob>(
        { method: 'GET', path: messagePath(messageId, '/media'), responseType: 'blob' },
        options,
      );
    },
    async react(messageId, input, options) {
      await transport.request(
        { method: 'PUT', path: messagePath(messageId, '/reaction'), body: input },
        options,
      );
    },
    async unreact(messageId, options) {
      await transport.request(
        { method: 'DELETE', path: messagePath(messageId, '/reaction') },
        options,
      );
    },
  };
}
