import type { SessionState } from '@whappr/protocol';
import type { RequestOptions, Transport } from '../transport.js';

export interface SessionApi {
  /** GET /api/session — pairing status, the QR code while awaiting a scan, and the paired account once ready. */
  get(options?: RequestOptions): Promise<SessionState>;
  /** POST /api/session/logout — unpairs the account; the gateway then shows a new QR code. */
  logout(options?: RequestOptions): Promise<void>;
}

export function createSessionApi(transport: Transport): SessionApi {
  return {
    get(options) {
      return transport.request<SessionState>({ method: 'GET', path: '/api/session' }, options);
    },
    async logout(options) {
      await transport.request({ method: 'POST', path: '/api/session/logout' }, options);
    },
  };
}
