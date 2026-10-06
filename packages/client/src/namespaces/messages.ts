import type {
  EditMessageRequest,
  Message,
  MessageResponse,
  SendMessageRequest,
  SetReactionRequest,
} from '@whappr/protocol';
import type { Transport } from '../transport.js';

/** Per-call options for requests that can run long, e.g. sending or downloading a large file. */
export interface CallOptions {
  /**
   * Overrides the client's `timeoutMs` for this call. On a timeout the Gateway may still
   * complete the request — a timed-out `send()` doesn't mean the message wasn't sent.
   */
  timeoutMs?: number;
}

export interface MessagesMediaApi {
  /**
   * GET /api/messages/:id/media — the message's file. `blob.type` is its MIME type; its
   * name, if any, is in the message's `media.fileName`.
   */
  download(messageId: string, options?: CallOptions): Promise<Blob>;
}

export interface MessagesApi {
  readonly media: MessagesMediaApi;
  /** POST /api/messages — set `replyTo` to send it as a reply, `media` to send a file. */
  send(input: SendMessageRequest, options?: CallOptions): Promise<Message>;
  /** PATCH /api/messages/:id */
  edit(messageId: string, input: EditMessageRequest): Promise<Message>;
  /** DELETE /api/messages/:id — deletes for everyone. */
  delete(messageId: string): Promise<void>;
  /** PUT /api/messages/:id/reaction — sets, or replaces, your reaction. */
  react(messageId: string, input: SetReactionRequest): Promise<void>;
  /** DELETE /api/messages/:id/reaction */
  unreact(messageId: string): Promise<void>;
}

function messagePath(messageId: string, suffix = ''): string {
  return `/api/messages/${encodeURIComponent(messageId)}${suffix}`;
}

export function createMessagesApi(transport: Transport): MessagesApi {
  return {
    async send(input, options) {
      const { message } = await transport.request<MessageResponse>({
        method: 'POST',
        path: '/api/messages',
        body: input,
        timeoutMs: options?.timeoutMs,
      });
      return message;
    },
    async edit(messageId, input) {
      const { message } = await transport.request<MessageResponse>({
        method: 'PATCH',
        path: messagePath(messageId),
        body: input,
      });
      return message;
    },
    async delete(messageId) {
      await transport.request({ method: 'DELETE', path: messagePath(messageId) });
    },
    media: {
      download(messageId, options) {
        return transport.request<Blob>({
          method: 'GET',
          path: messagePath(messageId, '/media'),
          responseType: 'blob',
          timeoutMs: options?.timeoutMs,
        });
      },
    },
    async react(messageId, input) {
      await transport.request({
        method: 'PUT',
        path: messagePath(messageId, '/reaction'),
        body: input,
      });
    },
    async unreact(messageId) {
      await transport.request({
        method: 'DELETE',
        path: messagePath(messageId, '/reaction'),
      });
    },
  };
}
