import { serve } from '@hono/node-server';
import pino from 'pino';
import { loadEnv } from './config/env.js';
import { createApp } from './http/app.js';
import { createWebhookDispatcher } from './webhook/dispatcher.js';
import { WhatsappClient } from './whatsapp/client.js';

const env = loadEnv();
const logger = pino({ level: env.LOG_LEVEL, errorKey: 'error' });
const mediaMaxBytes = env.MEDIA_MAX_SIZE * 1024 * 1024;

const dispatcher = createWebhookDispatcher({
  webhookUrl: env.WEBHOOK_URL,
  secret: env.SECRET_KEY,
  logger,
});

const client = new WhatsappClient({ dataDir: env.DATA_DIR, mediaMaxBytes, logger });

client.on('event', (event) => {
  if (env.WEBHOOK_EVENTS.has(event.type)) dispatcher.send(event);
});

const app = createApp({ secret: env.SECRET_KEY, mediaMaxBytes, client, logger });

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info({ port: info.port }, 'whappr listening');
});

void client.start();

async function shutdown(): Promise<void> {
  logger.info('shutting down');
  await client.stop().catch((error) => logger.error({ error }, 'error during shutdown'));
  await dispatcher.drain();
  process.exit(0);
}

process.on('SIGTERM', () => {
  void shutdown();
});
process.on('SIGINT', () => {
  void shutdown();
});
