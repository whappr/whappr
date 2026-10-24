import { Hono } from 'hono';
import type { Chats } from '../../whatsapp/chats.js';
import type { AppEnv } from '../app.js';

export function createChatsRoute(chats: Chats): Hono<AppEnv> {
  return new Hono<AppEnv>()
    .put('/:chatId/typing', async (c) => {
      await chats.startTyping(c.req.param('chatId'));
      return c.body(null, 204);
    })
    .delete('/:chatId/typing', async (c) => {
      await chats.stopTyping(c.req.param('chatId'));
      return c.body(null, 204);
    })
    .post('/:chatId/read', async (c) => {
      await chats.markAsRead(c.req.param('chatId'));
      return c.body(null, 204);
    })
    .delete('/:chatId', async (c) => {
      await chats.delete(c.req.param('chatId'));
      return c.body(null, 204);
    });
}
