import pino from 'pino';
import type { Env } from '../config/env.js';

export type Logger = pino.Logger;

export function createRootLogger(level: Env['LOG_LEVEL']): Logger {
  return pino({ level, errorKey: 'error' });
}
