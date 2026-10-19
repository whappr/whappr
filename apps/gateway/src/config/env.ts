import { WHAPPR_EVENT_TYPES } from '@whappr/protocol';
import { z } from 'zod';

// Comma-separated list: entries trimmed, blanks dropped.
const splitList = (value: string) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');

// An id ending in one of `suffixes`, or a phone number, which becomes its `@c.us` id. Unlike `to`
// on POST /api/messages, the number isn't looked up, so it must be written the way WhatsApp spells
// it in ids.
const idEntry = (kind: string, suffixes: readonly string[]) =>
  z
    .string()
    .refine(
      (entry) =>
        entry.includes('@')
          ? /^[^@\s]+@[^@\s]+$/.test(entry) && suffixes.some((s) => entry.endsWith(`@${s}`))
          : /^\+?[\d\s-]*\d[\d\s-]*$/.test(entry),
      {
        error: (issue) =>
          `"${issue.input}" must be a ${kind} id (${suffixes.map((s) => `…@${s}`).join(', ')}) or a phone number`,
      },
    )
    .transform((entry) => (entry.includes('@') ? entry : `${entry.replace(/\D/g, '')}@c.us`));

const chatIdEntry = idEntry('chat', ['c.us', 'g.us', 'lid']);
// A group is never a sender.
const senderIdEntry = idEntry('sender', ['c.us', 'lid']);

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Sent as a bearer token, so it's limited to the characters RFC 6750 allows in one.
  SECRET_KEY: z
    .string()
    .min(16, 'SECRET_KEY must be at least 16 characters')
    .regex(/^[A-Za-z0-9._~+/-]+=*$/, 'SECRET_KEY may only contain letters, digits and ._~+/-'),
  WEBHOOK_URL: z.url('WEBHOOK_URL must be a valid URL'),
  // Comma-separated event types to POST to the webhook. Unset or empty means all of them.
  WEBHOOK_EVENT_TYPES: z
    .string()
    .default('')
    .transform(splitList)
    .pipe(z.array(z.enum(WHAPPR_EVENT_TYPES)))
    .transform((types) => new Set(types.length > 0 ? types : WHAPPR_EVENT_TYPES)),
  // Comma-separated chat ids or phone numbers to POST events for, kept as chat ids. Unset or empty
  // means every chat, kept as an empty set since, unlike event types, the full list can't be
  // spelled out.
  WEBHOOK_CHAT_IDS: z
    .string()
    .default('')
    .transform(splitList)
    .pipe(z.array(chatIdEntry))
    .transform((entries) => new Set(entries)),
  // Comma-separated sender ids or phone numbers to POST events for, in any chat (direct or group),
  // kept as ids. Unset or empty means every sender, kept as an empty set like WEBHOOK_CHAT_IDS.
  WEBHOOK_SENDER_IDS: z
    .string()
    .default('')
    .transform(splitList)
    .pipe(z.array(senderIdEntry))
    .transform((entries) => new Set(entries)),
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
