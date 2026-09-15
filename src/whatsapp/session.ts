import qrcode from 'qrcode';
import type { Logger } from '../logging/logger.js';
import type { WhatsappClient } from './client.js';
import { WhatsappError } from './errors.js';

export type Status =
  | 'CREATED'
  | 'INITIALIZING'
  | 'AWAITING_SCAN'
  | 'AUTHENTICATED'
  | 'READY'
  | 'INIT_FAILED'
  | 'AUTH_FAILED'
  | 'DISCONNECTED';

export interface SessionState {
  status: Status;
  qr: string | null;
}

export class WhatsappSession {
  readonly #client: WhatsappClient;
  readonly #logger: Logger;
  #state: SessionState = { status: 'CREATED', qr: null };
  #restartInFlight: Promise<void> | null = null;

  constructor(client: WhatsappClient, logger: Logger) {
    this.#logger = logger;
    this.#client = client;
    this.#bindListeners();
  }

  get client(): WhatsappClient {
    return this.#client;
  }

  get state(): SessionState {
    return this.#state;
  }

  async initialize(): Promise<void> {
    this.#setState('INITIALIZING');
    try {
      await this.#client.initialize();
    } catch (error) {
      this.#setState('INIT_FAILED');
      this.#logger.error({ error }, 'failed to initialize WhatsApp client');
    }
  }

  async destroy(): Promise<void> {
    try {
      await this.#client.destroy();
    } finally {
      this.#setState('DISCONNECTED');
    }
  }

  async logout(): Promise<void> {
    const { status } = this.state;
    if (status !== 'AUTHENTICATED' && status !== 'READY') {
      throw new WhatsappError('Not authenticated', 'NOT_AUTHENTICATED');
    }
    try {
      await this.#client.logout();
    } finally {
      this.#setState('DISCONNECTED');
    }
    await this.#restart();
  }

  #restart(): Promise<void> {
    this.#restartInFlight ??= this.#doRestart().finally(() => {
      this.#restartInFlight = null;
    });
    return this.#restartInFlight;
  }

  async #doRestart(): Promise<void> {
    try {
      await this.#client.destroy();
    } catch (error) {
      this.#logger.error({ error }, 'error destroying WhatsApp client during restart');
    }
    await this.initialize();
  }

  #setState(status: Status, qr: string | null = null): void {
    this.#state = { status, qr };
  }

  #bindListeners(): void {
    this.#client.on('conn.qr_received', (qr) => {
      qrcode
        .toDataURL(qr)
        .then((dataUrl) => {
          this.#setState('AWAITING_SCAN', dataUrl);
        })
        .catch((error) => this.#logger.error({ error }, 'failed to render QR code'));
    });

    this.#client.on('conn.authenticated', () => {
      this.#setState('AUTHENTICATED');
    });

    this.#client.on('conn.ready', () => {
      this.#setState('READY');
    });

    this.#client.on('conn.auth_failed', (message) => {
      this.#logger.error({ reason: message }, 'WhatsApp authentication failure');
      this.#setState('AUTH_FAILED');
    });

    this.#client.on('conn.disconnected', (reason) => {
      this.#logger.error({ reason }, 'WhatsApp client disconnected');
      this.#setState('DISCONNECTED');
      void this.#restart();
    });
  }
}

export function createWhatsappSession(client: WhatsappClient, logger: Logger): WhatsappSession {
  return new WhatsappSession(client, logger);
}
