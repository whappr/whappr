import { WHAPPR_EVENT_TYPES } from '@whappr/protocol';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Sent as a bearer token, so it's limited to the characters RFC 6750 allows in one.
  SECRET_KEY: z
    .string()
    .min(16, 'SECRET_KEY must be at least 16 characters')
    .regex(/^[A-Za-z0-9._~+/-]+=*$/, 'SECRET_KEY may only contain letters, digits and ._~+/-'),
  DATA_DIR: z.string().default('data'),
  WEBHOOK_URL: z.url('WEBHOOK_URL must be a valid URL'),
  // Comma-separated event types to POST to the webhook. Unset or empty means all of them.
  WEBHOOK_EVENTS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((type) => type.trim())
        .filter((type) => type !== ''),
    )
    .pipe(z.array(z.enum(WHAPPR_EVENT_TYPES)))
    .transform((types) => new Set(types.length > 0 ? types : WHAPPR_EVENT_TYPES)),
  // Megabytes.
  MEDIA_MAX_SIZE: z.coerce.number().int().positive().default(64),
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
