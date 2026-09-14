import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import type { Logger } from '../logging/logger.js';
import type { WhatsappSupervisor } from '../whatsapp/supervisor.js';
import { handleError } from './errors.js';
import {
  requestIdHeaderMiddleware,
  requestIdMiddleware,
} from './middlewares/request-id.middleware.js';
import { structuredLoggerMiddleware } from './middlewares/structured-logger.middleware.js';
import { createHealthRoute } from './routes/health.js';
import { createLogoutRoute } from './routes/logout.js';
import { createMessagesRoute } from './routes/messages.js';
import { createStatusRoute } from './routes/status.js';
import type { AppEnv } from './types.js';

export interface AppDeps {
  secret: string;
  supervisor: WhatsappSupervisor;
  logger: Logger;
}

export function createApp(deps: AppDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use(requestIdMiddleware());
  app.use(requestIdHeaderMiddleware());
  app.use(structuredLoggerMiddleware(deps.logger));

  app.get('/', serveStatic({ path: './public/index.html' }));
  app.route('/healthz', createHealthRoute());
  app.route('/api/status', createStatusRoute(deps));
  app.route('/api/logout', createLogoutRoute(deps));
  app.route('/api/messages', createMessagesRoute(deps));
  app.onError(handleError);

  return app;
}
