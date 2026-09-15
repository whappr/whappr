import { Hono } from 'hono';
import { z } from 'zod';
import { toMessagePayload, type WhatsappClient } from '../../whatsapp/client.js';
import type { WhatsappSession } from '../../whatsapp/session.js';
import { ensureReadyMiddleware } from '../middlewares/ensure-ready.middleware.js';
import { verifySignatureMiddleware } from '../middlewares/verify-signature.middleware.js';
import type { AppEnv } from '../types.js';
import { zValidator } from '../validation.js';

const sendMessageSchema = z.object({
  to: z.string().min(1),
  text: z.string().min(1),
});

const textOnlySchema = z.object({
  text: z.string().min(1),
});

const reactSchema = z.object({
  emoji: z.string().min(1),
});

interface MessagesRouteDeps {
  secret: string;
  client: WhatsappClient;
  session: WhatsappSession;
}

function toJid(to: string): string {
  return to.includes('@') ? to : `${to}@c.us`;
}

export function createMessagesRoute({ secret, client, session }: MessagesRouteDeps): Hono<AppEnv> {
  return new Hono<AppEnv>()
    .post(
      '/',
      verifySignatureMiddleware(secret),
      ensureReadyMiddleware(session),
      zValidator('json', sendMessageSchema),
      async (c) => {
        const { to, text } = c.req.valid('json');
        const sentMessage = await client.sendMessage(toJid(to), text);
        return c.json({ message: toMessagePayload(sentMessage) }, 201);
      },
    )
    .patch(
      '/:id',
      verifySignatureMiddleware(secret),
      ensureReadyMiddleware(session),
      zValidator('json', textOnlySchema),
      async (c) => {
        const { text } = c.req.valid('json');
        const message = await client.editMessage(c.req.param('id'), text);
        return c.json({ message });
      },
    )
    .delete(
      '/:id',
      verifySignatureMiddleware(secret),
      ensureReadyMiddleware(session),
      async (c) => {
        await client.deleteMessage(c.req.param('id'));
        return c.body(null, 204);
      },
    )
    .post(
      '/:id/reactions',
      verifySignatureMiddleware(secret),
      ensureReadyMiddleware(session),
      zValidator('json', reactSchema),
      async (c) => {
        const { emoji } = c.req.valid('json');
        await client.reactToMessage(c.req.param('id'), emoji);
        return c.body(null, 204);
      },
    )
    .delete(
      '/:id/reactions',
      verifySignatureMiddleware(secret),
      ensureReadyMiddleware(session),
      async (c) => {
        await client.reactToMessage(c.req.param('id'), '');
        return c.body(null, 204);
      },
    )
    .post(
      '/:id/replies',
      verifySignatureMiddleware(secret),
      ensureReadyMiddleware(session),
      zValidator('json', textOnlySchema),
      async (c) => {
        const { text } = c.req.valid('json');
        const message = await client.replyToMessage(c.req.param('id'), text);
        return c.json({ message }, 201);
      },
    );
}
