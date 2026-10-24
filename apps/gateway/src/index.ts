import { serve } from '@hono/node-server';
import pino from 'pino';
import { ConfigError, createConfig } from './config.js';
import { createApp } from './http/app.js';
import { createWebhookDispatcher } from './webhook/dispatcher.js';
import { createWebhookFilter } from './webhook/filter.js';
import { createWhatsapp } from './whatsapp/index.js';

const config = loadConfig();
const logger = pino({ level: config.get('logLevel'), errorKey: 'error' });

const whatsapp = createWhatsapp(config, logger);
const filter = createWebhookFilter(config, logger, whatsapp);
const dispatcher = createWebhookDispatcher(config, logger, filter);
const app = createApp(config, logger, whatsapp, dispatcher);

whatsapp.onEvent((event) => dispatcher.send(event));

serve({ fetch: app.fetch, port: config.get('port') }, (info) => {
  logger.info({ port: info.port }, 'whappr listening');
});

void whatsapp.session.start();

function loadConfig() {
  try {
    return createConfig();
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    console.error(`${error.message}:`);
    for (const issue of error.issues) console.error(`  - ${issue}`);
    process.exit(1);
  }
}

async function shutdown(): Promise<void> {
  logger.info('shutting down');
  await whatsapp.session.stop().catch((error) => logger.error({ error }, 'error during shutdown'));
  await dispatcher.drain();
  process.exit(0);
}

process.on('SIGTERM', () => {
  void shutdown();
});
process.on('SIGINT', () => {
  void shutdown();
});
