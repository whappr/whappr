import { readFileSync } from 'node:fs';
import { serveStatic } from '@hono/node-server/serve-static';
import type { HealthResponse, SessionHealth } from '@whappr/protocol';
import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { type RequestIdVariables, requestId } from 'hono/request-id';
import type { Logger } from 'pino';
import type { WebhookDispatcher } from '../webhook/dispatcher.js';
import type { WhatsappClient } from '../whatsapp/client.js';
import { handleError } from './errors.js';
import { requestLogger } from './middlewares.js';
import { createChatsRoute } from './routes/chats.js';
import { createMessagesRoute } from './routes/messages.js';
import { createSessionRoute } from './routes/session.js';

// Two levels up from both src/http and dist/http.
const { version } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string };

export type AppEnv = {
  Variables: RequestIdVariables & { logger: Logger };
};

export interface AppDeps {
  secret: string;
  mediaMaxBytes: number;
  client: WhatsappClient;
  webhook: WebhookDispatcher;
  logger: Logger;
}

export function createApp({
  secret,
  mediaMaxBytes,
  client,
  webhook,
  logger,
}: AppDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Also echoes the id back as `X-Request-Id`.
  app.use(requestId());
  app.use(requestLogger(logger));

  app.get('/', serveStatic({ path: './public/index.html' }));
  app.get('/styles.css', serveStatic({ path: './public/styles.css' }));
  app.get('/app.js', serveStatic({ path: './public/app.js' }));
  // `failed` is the only state the client doesn't recover from by itself (e.g. Chromium didn't
  // launch), so it's the only one that turns the container unhealthy.
  app.get('/health', (c) => {
    const { status } = client.state;
    const session: SessionHealth = { ok: status !== 'failed', status };
    const ok = session.ok;
    return c.json(
      { ok, version, session, webhook: webhook.last() } satisfies HealthResponse,
      ok ? 200 : 503,
    );
  });

  app.use('/api/*', bearerAuth({ token: secret }));
  app.route('/api/session', createSessionRoute(client));
  app.route('/api/messages', createMessagesRoute(client, mediaMaxBytes));
  app.route('/api/chats', createChatsRoute(client));

  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Not Found' } }, 404));
  app.onError(handleError);

  return app;
}
