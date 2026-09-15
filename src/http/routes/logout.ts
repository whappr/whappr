import { Hono } from 'hono';
import { z } from 'zod';
import { secretsMatch } from '../../security/signature.js';
import { WhatsappError } from '../../whatsapp/errors.js';
import type { WhatsappSession } from '../../whatsapp/session.js';
import type { AppEnv } from '../types.js';
import { zValidator } from '../validation.js';

const logoutSchema = z.object({ secret: z.string().min(1) });

interface LogoutRouteDeps {
  secret: string;
  session: WhatsappSession;
}

export function createLogoutRoute({ secret, session }: LogoutRouteDeps): Hono<AppEnv> {
  return new Hono<AppEnv>().post('/', zValidator('json', logoutSchema), async (c) => {
    const { secret: providedSecret } = c.req.valid('json');

    if (!secretsMatch(providedSecret, secret)) {
      throw new WhatsappError('Invalid secret', 'INVALID_SECRET');
    }

    await session.logout();

    return c.json({ ok: true }, 202);
  });
}
