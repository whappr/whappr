import type { RequestIdVariables } from 'hono/request-id';
import type { Logger } from '../logging/logger.js';

export type AppEnv = {
  Variables: RequestIdVariables & { logger: Logger };
};
