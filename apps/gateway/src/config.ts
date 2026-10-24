import { WHAPPR_EVENT_TYPES, type WhapprEventType } from '@whappr/protocol';
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
  FILTER_EVENT_TYPES: z
    .string()
    .default('')
    .transform(splitList)
    .pipe(z.array(z.enum(WHAPPR_EVENT_TYPES)))
    .transform((types) => new Set(types.length > 0 ? types : WHAPPR_EVENT_TYPES)),
  // Comma-separated chat ids or phone numbers to POST events for, kept as chat ids. Unset or empty
  // means every chat, kept as an empty set since, unlike event types, the full list can't be
  // spelled out.
  FILTER_CHAT_IDS: z
    .string()
    .default('')
    .transform(splitList)
    .pipe(z.array(chatIdEntry))
    .transform((entries) => new Set(entries)),
  // Comma-separated sender ids or phone numbers to POST events for, in any chat (direct or group),
  // kept as ids. Unset or empty means every sender, kept as an empty set like FILTER_CHAT_IDS.
  FILTER_SENDER_IDS: z
    .string()
    .default('')
    .transform(splitList)
    .pipe(z.array(senderIdEntry))
    .transform((entries) => new Set(entries)),
  // Megabytes.
  MEDIA_MAX_SIZE: z.coerce.number().int().positive().default(64),
  // Unset or empty keeps whatsapp-web.js's default.
  DEVICE_NAME: z
    .string()
    .trim()
    .optional()
    .transform((name) => name || undefined),
});

// The env, renamed and converted to what the gateway uses.
const configSchema = envSchema.transform((env) => ({
  port: env.PORT,
  logLevel: env.LOG_LEVEL,
  secretKey: env.SECRET_KEY,
  webhookUrl: env.WEBHOOK_URL,
  filterEventTypes: env.FILTER_EVENT_TYPES as ReadonlySet<WhapprEventType>,
  /** Chat ids (`@c.us`, `@g.us`, `@lid`). Empty means every chat. */
  filterChatIds: env.FILTER_CHAT_IDS as ReadonlySet<string>,
  /** Sender ids (`@c.us`, `@lid`). Empty means every sender. */
  filterSenderIds: env.FILTER_SENDER_IDS as ReadonlySet<string>,
  mediaMaxBytes: env.MEDIA_MAX_SIZE * 1024 * 1024,
  /** The name WhatsApp shows for the gateway under Linked devices. */
  deviceName: env.DEVICE_NAME,
}));

export type Config = Readonly<z.infer<typeof configSchema>>;

export type ConfigKey = keyof Config;

/** Reads the gateway's config. `K` narrows the keys a consumer may read. */
export interface ConfigService<K extends ConfigKey = ConfigKey> {
  get<P extends K>(key: P): Config[P];
}

export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super('Invalid environment configuration');
    this.name = 'ConfigError';
  }
}

/** Reads and validates the config from `source` once. Throws a `ConfigError` if it's invalid. */
export function createConfig(source: NodeJS.ProcessEnv = process.env): ConfigService {
  const result = configSchema.safeParse(source);

  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }

  const config: Config = Object.freeze(result.data);
  return { get: (key) => config[key] };
}
