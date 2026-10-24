import type { SessionState } from '@whappr/protocol';
import { Hono } from 'hono';
import type { Whatsapp } from '../../whatsapp/index.js';
import type { AppEnv } from '../app.js';

export function createSessionRoute(session: Whatsapp['session']): Hono<AppEnv> {
  return new Hono<AppEnv>()
    .get('/', (c) => c.json(session.state satisfies SessionState))
    .post('/logout', async (c) => {
      await session.logout();
      return c.json({ ok: true }, 202);
    });
}
