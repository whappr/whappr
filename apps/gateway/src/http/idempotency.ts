import type { Message } from '@whappr/protocol';

// Long enough to cover a client retrying after a timeout, or reprocessing an event after a crash.
const TTL_MS = 24 * 60 * 60 * 1000;
// Bounds memory however many messages are sent: past it, the oldest key is forgotten early.
const MAX_ENTRIES = 10_000;

interface Entry {
  result: Promise<Message>;
  expiresAt: number;
}

export type WithIdempotency = (
  key: string | undefined,
  send: () => Promise<Message>,
) => Promise<Message>;

/**
 * Runs `send` once per `Idempotency-Key`: a repeat with the same key gets the first call's
 * message, waiting for it while it's still being sent. Failed sends are forgotten, so they can be
 * retried. Kept in memory: a restart forgets every key.
 */
export function createIdempotency(): WithIdempotency {
  // Every entry lives `TTL_MS`, so insertion order is expiry order.
  const entries = new Map<string, Entry>();

  return (key, send) => {
    if (!key) return send();

    const now = Date.now();
    // Expired entries sit at the front, so this also forgets a stale entry for `key`.
    for (const [oldKey, entry] of entries) {
      if (entry.expiresAt > now && entries.size < MAX_ENTRIES) break;
      entries.delete(oldKey);
    }

    const existing = entries.get(key);
    if (existing) return existing.result;

    const entry: Entry = { result: send(), expiresAt: now + TTL_MS };
    entries.set(key, entry);
    entry.result.catch(() => {
      // Only this entry: after a failed send, the key may already hold a newer one.
      if (entries.get(key) === entry) entries.delete(key);
    });
    return entry.result;
  };
}
