import { serve } from '@hono/node-server';
import { loadEnv } from './config/env.js';
import { loadEventFilterRules } from './events/filter.js';
import { wireWebhookForwarding } from './events/forwarding.js';
import { createApp } from './http/app.js';
import { createRootLogger } from './logging/logger.js';
import { createWebhookBuffer } from './webhook/buffer.js';
import { createWhatsappClient } from './whatsapp/client.js';

const env = loadEnv();
const logger = createRootLogger(env.LOG_LEVEL);

const webhookBuffer = createWebhookBuffer({
  webhookUrl: env.WHAPPR_WEBHOOK_URL,
  secret: env.WHAPPR_SECRET,
  flushInterval: env.WHAPPR_WEBHOOK_FLUSH_INTERVAL,
  logger,
});

// Validated and logged before the WhatsApp client (and its Puppeteer browser) is
// ever created, so a bad WHAPPR_EVENT_FILTER config fails fast without touching it.
const eventFilterRules = loadEventFilterRules(logger);
logger.info({ eventFilterRules }, 'event filter configured');

const client = createWhatsappClient(env, logger);
wireWebhookForwarding(client, webhookBuffer, eventFilterRules, logger);

const app = createApp({
  secret: env.WHAPPR_SECRET,
  client,
  logger,
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info({ port: info.port }, 'whappr listening');
});

async function shutdown(): Promise<void> {
  logger.info('shutting down');
  await Promise.allSettled([
    client.destroy().catch((error) => logger.error({ error }, 'error during shutdown')),
    webhookBuffer.flush(),
  ]);
  // Catches an event client.destroy() itself emitted (e.g. a trailing message.ack)
  // while the flush above was already mid-snapshot.
  await webhookBuffer.flush();
  process.exit(0);
}

process.on('SIGTERM', () => {
  void shutdown();
});
process.on('SIGINT', () => {
  void shutdown();
});
