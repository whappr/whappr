import { Hono } from 'hono';
import type { WhatsappClient } from '../../whatsapp/client.js';
import type { AppEnv } from '../app.js';

export function createChatsRoute(client: WhatsappClient): Hono<AppEnv> {
  return new Hono<AppEnv>()
    .put('/:chatId/typing', async (c) => {
      await client.setTyping(c.req.param('chatId'), true);
      return c.body(null, 204);
    })
    .delete('/:chatId/typing', async (c) => {
      await client.setTyping(c.req.param('chatId'), false);
      return c.body(null, 204);
    })
    .post('/:chatId/read', async (c) => {
      await client.markAsRead(c.req.param('chatId'));
      return c.body(null, 204);
    });
}
