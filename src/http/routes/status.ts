import { Hono } from 'hono';
import type { WhatsappSession } from '../../whatsapp/session.js';
import type { AppEnv } from '../types.js';

interface StatusRouteDeps {
  session: WhatsappSession;
}

export function createStatusRoute({ session }: StatusRouteDeps): Hono<AppEnv> {
  return new Hono<AppEnv>().get('/', (c) => {
    return c.json(session.state);
  });
}
