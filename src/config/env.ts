import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  WHAPPR_SECRET: z.string().min(16, 'WHAPPR_SECRET must be at least 16 characters'),
  WHAPPR_SESSION_PATH: z.string().default('.wwebjs_auth'),
  WHAPPR_WEBHOOK_URL: z.url('WHAPPR_WEBHOOK_URL must be a valid URL'),
  WHAPPR_WEBHOOK_FLUSH_INTERVAL: z.coerce.number().int().nonnegative().default(2),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
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
