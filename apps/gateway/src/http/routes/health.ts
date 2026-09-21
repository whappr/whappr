import { Hono } from 'hono';
import type { AppEnv } from '../types.js';

export function createHealthRoute(): Hono<AppEnv> {
  return new Hono<AppEnv>().get('/', (c) => c.json({ ok: true }));
}
