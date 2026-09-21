import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { secretsMatch } from '../../security/signature.js';
import type { WhatsappSession } from '../../whatsapp/session.js';
import { validateBodyMiddleware } from '../middlewares/validate-body.middleware.js';
import type { AppEnv } from '../types.js';

const logoutSchema = z.object({ secret: z.string().min(1) });

interface LogoutRouteDeps {
  secret: string;
  session: WhatsappSession;
}

export function createLogoutRoute({ secret, session }: LogoutRouteDeps): Hono<AppEnv> {
  return new Hono<AppEnv>().post('/', validateBodyMiddleware(logoutSchema), async (c) => {
    const { secret: providedSecret } = c.req.valid('json');

    if (!secretsMatch(providedSecret, secret)) {
      throw new HTTPException(401, { message: 'Invalid secret' });
    }

    await session.logout();

    return c.json({ ok: true }, 202);
  });
}
