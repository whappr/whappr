import type { SessionState } from '@whappr/protocol';
import { Hono } from 'hono';
import type { WhatsappClient } from '../../whatsapp/client.js';
import type { AppEnv } from '../app.js';

export function createSessionRoute(client: WhatsappClient): Hono<AppEnv> {
  return new Hono<AppEnv>()
    .get('/', (c) => c.json(client.state satisfies SessionState))
    .post('/logout', async (c) => {
      await client.logout();
      return c.json({ ok: true }, 202);
    });
}
