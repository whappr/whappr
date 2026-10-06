import type { SessionState } from '@whappr/protocol';
import type { Transport } from '../transport.js';

export interface SessionApi {
  /** GET /api/session — pairing status, the QR code while awaiting a scan, and the paired account once ready. */
  status(): Promise<SessionState>;
  /** POST /api/session/logout — unpairs the account; the gateway then shows a new QR code. */
  logout(): Promise<void>;
}

export function createSessionApi(transport: Transport): SessionApi {
  return {
    status() {
      return transport.request<SessionState>({ method: 'GET', path: '/api/session' });
    },
    async logout() {
      await transport.request({ method: 'POST', path: '/api/session/logout' });
    },
  };
}
