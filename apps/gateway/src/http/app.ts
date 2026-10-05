import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { type RequestIdVariables, requestId } from 'hono/request-id';
import type { Logger } from 'pino';
import type { WhatsappClient } from '../whatsapp/client.js';
import { handleError } from './errors.js';
import { requestLogger } from './middlewares.js';
import { createChatsRoute } from './routes/chats.js';
import { createMessagesRoute } from './routes/messages.js';
import { createSessionRoute } from './routes/session.js';

export type AppEnv = {
  Variables: RequestIdVariables & { logger: Logger };
};

export interface AppDeps {
  secret: string;
  mediaMaxBytes: number;
  client: WhatsappClient;
  logger: Logger;
}

export function createApp({ secret, mediaMaxBytes, client, logger }: AppDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Also echoes the id back as `X-Request-Id`.
  app.use(requestId());
  app.use(requestLogger(logger));

  app.get('/', serveStatic({ path: './public/index.html' }));
  app.get('/health', (c) => c.json({ ok: true }));

  app.use('/api/*', bearerAuth({ token: secret }));
  app.route('/api/session', createSessionRoute(client));
  app.route('/api/messages', createMessagesRoute(client, mediaMaxBytes));
  app.route('/api/chats', createChatsRoute(client));

  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Not Found' } }, 404));
  app.onError(handleError);

  return app;
}
