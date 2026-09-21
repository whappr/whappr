import type { Transport } from '../transport.js';
import type { SessionState } from '../types.js';

export interface SessionApi {
  /** GET /api/status — unauthenticated by design. */
  getStatus(): Promise<SessionState>;
  /** POST /api/logout — the configured secret is sent automatically. */
  logout(): Promise<void>;
}

export function createSessionApi(transport: Transport, secret: string): SessionApi {
  return {
    getStatus() {
      return transport.request<SessionState>({ method: 'GET', path: '/api/status' });
    },
    async logout() {
      await transport.request({ method: 'POST', path: '/api/logout', body: { secret } });
    },
  };
}
