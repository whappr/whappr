import type { AnyWhapprEvent } from '@whappr/protocol';
import type { Logger } from 'pino';
import type { ConfigService } from '../config.js';
import { createChats } from './chats.js';
import { createEvents } from './events.js';
import { createGroups } from './groups.js';
import { phoneIdOf } from './lookup.js';
import { createMessages } from './messages.js';
import { createSession } from './session.js';

export type Whatsapp = ReturnType<typeof createWhatsapp>;

/**
 * The gateway's WhatsApp: the session, the operations the API exposes (grouped like its routes),
 * and the webhook events it emits.
 */
export function createWhatsapp(
  config: ConfigService<'mediaMaxBytes' | 'deviceName'>,
  logger: Logger,
) {
  const session = createSession(config, logger);
  const events = createEvents(session, logger);

  return {
    session: {
      get state() {
        return session.state;
      },
      start: session.start,
      stop: session.stop,
      /** Unpairs the account, then restarts to show a new QR code. */
      logout: session.logout,
    },
    messages: createMessages(config, session),
    chats: createChats(session),
    groups: createGroups(session, events),

    onEvent(listener: (event: AnyWhapprEvent) => void): void {
      events.on('event', listener);
    },

    /** The phone-based (`@c.us`) id of a `@lid` account, or `null` if WhatsApp doesn't know it. */
    phoneIdOf(lid: string): Promise<string | null> {
      return phoneIdOf(session.ready(), lid);
    },
  };
}
