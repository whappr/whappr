import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SECRET_KEY: z.string().min(16, 'SECRET_KEY must be at least 16 characters'),
  SESSION_PATH: z.string().default('.wwebjs_auth'),
  CACHE_PATH: z.string().default('.wwebjs_cache'),
  WEBHOOK_URL: z.url('WEBHOOK_URL must be a valid URL'),
  WEBHOOK_INTERVAL: z.coerce.number().int().nonnegative().default(2),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnvVars(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid environment configuration:');
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}
