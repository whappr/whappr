import type wwebjs from 'whatsapp-web.js';
import { WhatsappError } from './errors.js';
import { findChat, isMember } from './lookup.js';
import type { Session } from './session.js';

export type Chats = ReturnType<typeof createChats>;

// Every `chatId` accepts a phone number too.
export function createChats(session: Session) {
  return {
    /** Shows "typing…" in the chat; WhatsApp clears it after ~25s or when a message is sent. */
    async startTyping(chatId: string): Promise<void> {
      const chat = await findChat(session.ready(), chatId);
      await chat.sendStateTyping().catch((cause) => {
        throw new WhatsappError('Failed to update typing state', 'OPERATION_FAILED', cause);
      });
    },

    async stopTyping(chatId: string): Promise<void> {
      const chat = await findChat(session.ready(), chatId);
      await chat.clearState().catch((cause) => {
        throw new WhatsappError('Failed to update typing state', 'OPERATION_FAILED', cause);
      });
    },

    async markAsRead(chatId: string): Promise<void> {
      const chat = await findChat(session.ready(), chatId);
      const seen = await chat.sendSeen().catch((cause) => {
        throw new WhatsappError('Failed to mark chat as read', 'OPERATION_FAILED', cause);
      });
      if (!seen) throw new WhatsappError('Chat not found', 'CHAT_NOT_FOUND');
    },

    /**
     * Deletes the chat, on the paired account only. A group member's chat would come back with the
     * next message, so a group's is refused with `STILL_IN_GROUP` until the account left it.
     */
    async delete(chatId: string): Promise<void> {
      const ctx = session.ready();
      const chat = await findChat(ctx, chatId);
      if (chat.isGroup && isMember(chat as wwebjs.GroupChat, ctx.me)) {
        throw new WhatsappError('Leave the group before deleting its chat', 'STILL_IN_GROUP');
      }
      await chat.delete().catch((cause) => {
        throw new WhatsappError('Failed to delete WhatsApp chat', 'OPERATION_FAILED', cause);
      });
    },
  };
}
