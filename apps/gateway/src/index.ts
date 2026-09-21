import { serve } from '@hono/node-server';
import { loadEnvVars } from './config/env.js';
import { loadFilterRules } from './events/filter.js';
import { forwardEventsToBuffer } from './events/forwarding.js';
import { createApp } from './http/app.js';
import { createRootLogger } from './logging/logger.js';
import { createWebhookBuffer } from './webhook/buffer.js';
import { createWhatsappClient } from './whatsapp/client.js';
import { createWhatsappSession } from './whatsapp/session.js';

const env = loadEnvVars();
const logger = createRootLogger(env.LOG_LEVEL);

const buffer = createWebhookBuffer({
  secret: env.WHAPPR_SECRET,
  webhookUrl: env.WHAPPR_WEBHOOK_URL,
  webhookInterval: env.WHAPPR_WEBHOOK_INTERVAL,
  logger,
});

const rules = loadFilterRules(logger);

const client = createWhatsappClient(env);
const session = createWhatsappSession(client, logger);

forwardEventsToBuffer(session.client, buffer, rules, logger);

const app = createApp({
  secret: env.WHAPPR_SECRET,
  client: session.client,
  session,
  logger,
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info({ port: info.port }, 'whappr listening');
});

void session.initialize();

async function shutdown(): Promise<void> {
  logger.info('shutting down');
  await Promise.allSettled([
    session.destroy().catch((error) => logger.error({ error }, 'error during shutdown')),
    buffer.flush(),
  ]);
  // Catches an event session.destroy() itself emitted (e.g. a trailing msg.acked)
  // while the flush above was already mid-snapshot.
  await buffer.flush();
  process.exit(0);
}

process.on('SIGTERM', () => {
  void shutdown();
});
process.on('SIGINT', () => {
  void shutdown();
});
