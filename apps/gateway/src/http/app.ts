import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import type { Logger } from '../logging/logger.js';
import type { WhatsappClient } from '../whatsapp/client.js';
import type { WhatsappSession } from '../whatsapp/session.js';
import { handleError } from './errors.js';
import {
  requestIdHeaderMiddleware,
  requestIdMiddleware,
} from './middlewares/request-id.middleware.js';
import { requestLoggerMiddleware } from './middlewares/request-logger.middleware.js';
import { createHealthRoute } from './routes/health.js';
import { createLogoutRoute } from './routes/logout.js';
import { createMessagesRoute } from './routes/messages.js';
import { createStatusRoute } from './routes/status.js';
import type { AppEnv } from './types.js';

export interface AppDeps {
  secret: string;
  client: WhatsappClient;
  session: WhatsappSession;
  logger: Logger;
}

export function createApp(deps: AppDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use(requestIdMiddleware());
  app.use(requestIdHeaderMiddleware());
  app.use(requestLoggerMiddleware(deps.logger));

  app.get('/', serveStatic({ path: './public/index.html' }));
  app.route('/health', createHealthRoute());
  app.route('/api/status', createStatusRoute(deps));
  app.route('/api/logout', createLogoutRoute(deps));
  app.route('/api/messages', createMessagesRoute(deps));
  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Not Found' } }, 404));
  app.onError(handleError);

  return app;
}
