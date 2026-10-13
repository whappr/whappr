import { serve } from '@hono/node-server';
import pino from 'pino';
import { loadEnv } from './config/env.js';
import { createApp } from './http/app.js';
import { createWebhookDispatcher } from './webhook/dispatcher.js';
import { createWebhookFilter } from './webhook/filter.js';
import { WhatsappClient } from './whatsapp/client.js';

const env = loadEnv();
const logger = pino({ level: env.LOG_LEVEL, errorKey: 'error' });
const mediaMaxBytes = env.MEDIA_MAX_SIZE * 1024 * 1024;

const client = new WhatsappClient({ mediaMaxBytes, logger });

const dispatcher = createWebhookDispatcher({
  webhookUrl: env.WEBHOOK_URL,
  secret: env.SECRET_KEY,
  filter: createWebhookFilter({
    eventTypes: env.WEBHOOK_EVENT_TYPES,
    chatIds: env.WEBHOOK_CHAT_IDS,
    client,
    logger,
  }),
  logger,
});

client.on('event', (event) => dispatcher.send(event));

const app = createApp({
  secret: env.SECRET_KEY,
  mediaMaxBytes,
  client,
  webhook: dispatcher,
  logger,
});

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
