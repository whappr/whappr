import { Hono } from 'hono';
import type { WhatsappSupervisor } from '../../whatsapp/supervisor.js';
import type { AppEnv } from '../types.js';

interface StatusRouteDeps {
  supervisor: WhatsappSupervisor;
}

export function createStatusRoute({ supervisor }: StatusRouteDeps): Hono<AppEnv> {
  return new Hono<AppEnv>().get('/', (c) => {
    const client = supervisor.getClient();
    return c.json(client.getState());
  });
}
