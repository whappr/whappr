import type { Transport } from '../transport.js';

// WhatsApp clears "typing…" after ~25s, so `whileTyping` re-sends it a little before that.
const TYPING_REFRESH_MS = 20_000;

export interface ChatsApi {
  /** PUT /api/chats/:chatId/typing — shows "typing…" for ~25s, or until you send a message. */
  startTyping(chatId: string): Promise<void>;
  /** DELETE /api/chats/:chatId/typing */
  stopTyping(chatId: string): Promise<void>;
  /** POST /api/chats/:chatId/read — marks the chat's messages as read. */
  markAsRead(chatId: string): Promise<void>;
  /**
   * Shows "typing…" in the chat for as long as `task` runs, then clears it. Best-effort:
   * failing to show or clear the indicator never fails `task`, whose result or error passes
   * through unchanged.
   */
  whileTyping<T>(chatId: string, task: () => Promise<T>): Promise<T>;
}

function chatPath(chatId: string, suffix: string): string {
  return `/api/chats/${encodeURIComponent(chatId)}${suffix}`;
}

export function createChatsApi(transport: Transport): ChatsApi {
  const startTyping = async (chatId: string): Promise<void> => {
    await transport.request({ method: 'PUT', path: chatPath(chatId, '/typing') });
  };
  const stopTyping = async (chatId: string): Promise<void> => {
    await transport.request({ method: 'DELETE', path: chatPath(chatId, '/typing') });
  };

  return {
    startTyping,
    stopTyping,
    async markAsRead(chatId) {
      await transport.request({ method: 'POST', path: chatPath(chatId, '/read') });
    },
    async whileTyping(chatId, task) {
      const show = () => startTyping(chatId).catch(() => {});
      let inFlight = show();
      const timer = setInterval(() => {
        inFlight = show();
      }, TYPING_REFRESH_MS);

      try {
        return await task();
      } finally {
        clearInterval(timer);
        // A "typing" request landing after the stop would show the indicator again.
        await inFlight;
        await stopTyping(chatId).catch(() => {});
      }
    },
  };
}
