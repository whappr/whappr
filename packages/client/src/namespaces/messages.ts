import type { Transport } from '../transport.js';
import type {
  EditMessageInput,
  MessageEditPayload,
  MessagePayload,
  ReactInput,
  ReplyInput,
  SendMessageInput,
} from '../types.js';

export interface MessagesApi {
  /** POST /api/messages */
  send(input: SendMessageInput): Promise<MessagePayload>;
  /** PATCH /api/messages/:id */
  edit(messageId: string, input: EditMessageInput): Promise<MessageEditPayload>;
  /** DELETE /api/messages/:id — deletes for everyone. */
  delete(messageId: string): Promise<void>;
  /** POST /api/messages/:id/reactions */
  react(messageId: string, input: ReactInput): Promise<void>;
  /** DELETE /api/messages/:id/reactions */
  removeReaction(messageId: string): Promise<void>;
  /** POST /api/messages/:id/replies */
  reply(messageId: string, input: ReplyInput): Promise<MessagePayload>;
}

function messagePath(messageId: string, suffix = ''): string {
  return `/api/messages/${encodeURIComponent(messageId)}${suffix}`;
}

export function createMessagesApi(transport: Transport): MessagesApi {
  return {
    async send(input) {
      const { message } = await transport.request<{ message: MessagePayload }>({
        method: 'POST',
        path: '/api/messages',
        body: input,
        sign: true,
      });
      return message;
    },
    async edit(messageId, input) {
      const { message } = await transport.request<{ message: MessageEditPayload }>({
        method: 'PATCH',
        path: messagePath(messageId),
        body: input,
        sign: true,
      });
      return message;
    },
    async delete(messageId) {
      await transport.request({ method: 'DELETE', path: messagePath(messageId), sign: true });
    },
    async react(messageId, input) {
      await transport.request({
        method: 'POST',
        path: messagePath(messageId, '/reactions'),
        body: input,
        sign: true,
      });
    },
    async removeReaction(messageId) {
      await transport.request({
        method: 'DELETE',
        path: messagePath(messageId, '/reactions'),
        sign: true,
      });
    },
    async reply(messageId, input) {
      const { message } = await transport.request<{ message: MessagePayload }>({
        method: 'POST',
        path: messagePath(messageId, '/replies'),
        body: input,
        sign: true,
      });
      return message;
    },
  };
}
