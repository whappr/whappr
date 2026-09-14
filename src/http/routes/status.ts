import { Hono } from 'hono';
import type { WhatsappClient } from '../../whatsapp/client.js';
import type { AppEnv } from '../types.js';

interface StatusRouteDeps {
  client: WhatsappClient;
}

export function createStatusRoute({ client }: StatusRouteDeps): Hono<AppEnv> {
  return new Hono<AppEnv>().get('/', (c) => {
    return c.json(client.getState());
  });
}
