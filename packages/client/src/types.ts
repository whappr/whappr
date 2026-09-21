/**
 * DTOs mirroring the Gateway's wire contract (see apps/gateway/src/http/routes/*.ts).
 * Hand-defined rather than imported from @whappr/gateway: the gateway ships as a
 * Docker image and is never published, so its types aren't resolvable by anyone
 * installing this client outside this monorepo.
 */

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

export interface MessagePayload {
  id: string;
  from: string;
  to: string;
  body: string;
  timestamp: number;
  fromMe: boolean;
  type: string;
}

export interface MessageEditPayload {
  id: string;
  from: string;
  to: string;
  timestamp: number;
  newBody: string;
  oldBody: string;
}

export interface SendMessageInput {
  to: string;
  text: string;
}

export interface EditMessageInput {
  text: string;
}

export interface ReactInput {
  emoji: string;
}

export interface ReplyInput {
  text: string;
}
