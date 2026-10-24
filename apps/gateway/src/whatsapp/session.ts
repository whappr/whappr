import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { SessionState } from '@whappr/protocol';
import type { Logger } from 'pino';
import qrcode from 'qrcode';
import wwebjs from 'whatsapp-web.js';
import type { ConfigService } from '../config.js';
import { WhatsappError } from './errors.js';

const { Client, LocalAuth } = wwebjs;

// Holds the paired session (`auth/`) and the WhatsApp Web version cache (`cache/`). Relative to
// the cwd and fixed on purpose: the Docker image pre-creates it node-owned for the volume mount.
const DATA_DIR = 'data';
// LocalAuth's userDataDir when no clientId is set.
const CHROMIUM_PROFILE_DIR = join(DATA_DIR, 'auth', 'session');

/** The paired account. `ids` holds every id it may appear under (phone-based and `@lid`). */
export interface Me {
  id: string;
  ids: ReadonlySet<string>;
  phone: string;
  lid?: string;
  name?: string;
}

/** The phone-based (`pn`) and privacy (`lid`) ids WhatsApp knows for someone. */
export interface KnownIds {
  pn?: string;
  lid?: string;
}

/** What every operation on WhatsApp needs: the client and the account it's paired with. */
export interface ReadyContext {
  wa: wwebjs.Client;
  me: Me;
  /** The ids WhatsApp knows for others, by any id of theirs, as `peopleOf` found them. */
  known: Map<string, KnownIds>;
}

type State =
  | { status: 'starting' }
  | { status: 'awaiting_scan'; qr: string }
  | { status: 'ready'; me: Me; known: Map<string, KnownIds> }
  | { status: 'failed'; error: string }
  | { status: 'disconnected' };

export type Session = ReturnType<typeof createSession>;

/**
 * Owns the whatsapp-web.js client and its lifecycle: pairing, restarts after a disconnect, logout.
 * Every state change goes through `set`.
 */
export function createSession(config: ConfigService<'deviceName'>, logger: Logger) {
  const wa = new Client({
    // Left unset, whatsapp-web.js keeps its own.
    deviceName: config.get('deviceName'),
    authStrategy: new LocalAuth({ dataPath: join(DATA_DIR, 'auth') }),
    webVersionCache: { type: 'local', path: join(DATA_DIR, 'cache') },
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] },
  });
  let state: State = { status: 'starting' };
  // The QR code being rendered. Any state change drops it, so a late render can't undo one.
  let pendingQr: string | null = null;
  let restartInFlight: Promise<void> | null = null;

  function set(next: State): void {
    state = next;
    pendingQr = null;
  }

  async function start(): Promise<void> {
    set({ status: 'starting' });
    try {
      await unlockChromiumProfile();
      await wa.initialize();
    } catch (error) {
      logger.error({ error }, 'failed to initialize WhatsApp client');
      set({ status: 'failed', error: 'Failed to start the WhatsApp client' });
    }
  }

  async function stop(): Promise<void> {
    try {
      await wa.destroy();
    } finally {
      set({ status: 'disconnected' });
    }
  }

  async function logout(): Promise<void> {
    if (state.status !== 'ready') {
      throw new WhatsappError('Not authenticated', 'NOT_AUTHENTICATED');
    }
    try {
      await wa.logout();
    } finally {
      set({ status: 'disconnected' });
    }
    await restart();
  }

  function restart(): Promise<void> {
    restartInFlight ??= (async () => {
      try {
        await wa.destroy();
      } catch (error) {
        logger.error({ error }, 'error destroying WhatsApp client during restart');
      }
      await start();
    })().finally(() => {
      restartInFlight = null;
    });
    return restartInFlight;
  }

  /**
   * Removes a lock left by a Chromium that didn't exit cleanly. Chromium won't clear one
   * written under another hostname, which is every lock left by a previous container.
   */
  async function unlockChromiumProfile(): Promise<void> {
    await Promise.all(
      ['SingletonLock', 'SingletonCookie', 'SingletonSocket'].map((name) =>
        rm(join(CHROMIUM_PROFILE_DIR, name), { force: true }),
      ),
    );
  }

  async function resolveMe(): Promise<Me> {
    const { wid, pushname } = wa.info;
    const ids = new Set([wid._serialized]);
    let lid: string | undefined;
    try {
      const [entry] = await wa.getContactLidAndPhone([wid._serialized]);
      lid = entry?.lid || undefined;
      if (lid) ids.add(lid);
    } catch (error) {
      logger.warn({ error }, 'failed to resolve own @lid id; mentionsMe may miss mentions');
    }
    return { id: wid._serialized, ids, phone: wid.user, lid, name: pushname || undefined };
  }

  wa.on('qr', (qr) => {
    pendingQr = qr;
    qrcode
      .toDataURL(qr)
      .then((dataUrl) => {
        if (pendingQr === qr) set({ status: 'awaiting_scan', qr: dataUrl });
      })
      .catch((error) => logger.error({ error }, 'failed to render QR code'));
  });

  // Scanned; still loading until `ready`.
  wa.on('authenticated', () => set({ status: 'starting' }));

  wa.on('ready', () => {
    const before = state;
    resolveMe()
      .then((me) => {
        // Unless the state changed meanwhile, e.g. the client disconnected and is restarting.
        if (state === before) set({ status: 'ready', me, known: new Map() });
      })
      .catch((error) => logger.error({ error }, 'failed to resolve the paired account'));
  });

  wa.on('auth_failure', (message) => {
    logger.error({ reason: message }, 'WhatsApp authentication failure');
    set({ status: 'failed', error: 'WhatsApp authentication failed' });
  });

  wa.on('disconnected', (reason) => {
    logger.error({ reason }, 'WhatsApp client disconnected');
    set({ status: 'disconnected' });
    void restart();
  });

  return {
    wa,

    get state(): SessionState {
      return {
        status: state.status,
        qr: state.status === 'awaiting_scan' ? state.qr : null,
        ...(state.status === 'failed' && { error: state.error }),
        account:
          state.status === 'ready'
            ? { id: state.me.id, phone: state.me.phone, name: state.me.name }
            : null,
      };
    },

    /** The client and paired account while ready, else `null`. */
    current(): ReadyContext | null {
      return state.status === 'ready' ? { wa, me: state.me, known: state.known } : null;
    },

    /** The client and paired account, or `NOT_READY` until the session is ready. */
    ready(): ReadyContext {
      if (state.status !== 'ready') {
        throw new WhatsappError('WhatsApp client is not ready', 'NOT_READY');
      }
      return { wa, me: state.me, known: state.known };
    },

    start,
    stop,
    logout,
  };
}
