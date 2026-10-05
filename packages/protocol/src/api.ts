import type { Message } from './messages.js';

// --- Session ---

export type SessionStatus = 'starting' | 'awaiting_scan' | 'ready' | 'failed' | 'disconnected';

/** The WhatsApp account the gateway is paired with. */
export interface SessionAccount {
  /** Opaque id, the same one `sender.id` carries on messages the account sent. */
  id: string;
  /** Phone number in international format without `+` (e.g. `"1555123456"`). */
  phone: string;
  /** The display name set on the account, when WhatsApp provides one. */
  name?: string;
}

/** `GET /api/session`. `POST /api/session/logout` → `202` unpairs the account. */
export interface SessionState {
  status: SessionStatus;
  /** Pairing QR code as a data URL, while `status` is `awaiting_scan`. */
  qr: string | null;
  /** The paired account, while `status` is `ready`. */
  account: SessionAccount | null;
  /** Why the client couldn't start or authenticate, while `status` is `failed`. */
  error?: string;
}

// --- Health ---

/** The outcome of a webhook POST. */
export interface WebhookDelivery {
  /** When the attempt finished, ISO 8601. */
  at: string;
  /** `true` when the webhook answered with a 2xx status. */
  ok: boolean;
  /** The webhook's HTTP status. Absent when no response arrived (timeout, network error). */
  status?: number;
}

/** `GET /health`. Unauthenticated, so it carries no URLs or error details. */
export interface HealthResponse {
  /** Always `true` while the server responds; webhook failures don't change it. */
  ok: true;
  /** The gateway's version. */
  version: string;
  /** The most recent webhook delivery since the gateway started, or `null` before the first. */
  webhook: WebhookDelivery | null;
}

// --- Messages ---

/**
 * A file to send, either fetched by the gateway from an `http(s)` `url` or inlined as base64
 * `data`. With a `url`, `mimeType` defaults to the response's `Content-Type` and `fileName`
 * to the URL's last path segment. The file is sent as what its `mimeType` implies (`image/*`,
 * `video/*`, `audio/*`, anything else as a document); set `as` to send audio as a `voice`
 * note, or any file as a `document`.
 */
export type MediaInput = {
  as?: 'voice' | 'document';
  fileName?: string;
} & ({ url: string; mimeType?: string } | { data: string; mimeType: string });

interface SendMessageBase {
  /** A chat id, or a phone number in international format without `+` (e.g. `"1555123456"`). */
  to: string;
  /** Id of a message in the same chat to reply to (quote). */
  replyTo?: string;
}

export interface SendTextRequest extends SendMessageBase {
  text: string;
  media?: never;
}

export interface SendMediaRequest extends SendMessageBase {
  media: MediaInput;
  /** Caption. Ignored for `voice` and `audio`, which WhatsApp can't caption. */
  text?: string;
}

/** `POST /api/messages` → `201 MessageResponse`. */
export type SendMessageRequest = SendTextRequest | SendMediaRequest;

/** `PATCH /api/messages/:id` → `200 MessageResponse`. */
export interface EditMessageRequest {
  text: string;
}

/** `PUT /api/messages/:id/reaction` → `204`. `DELETE` the same path to remove it. */
export interface SetReactionRequest {
  emoji: string;
}

export interface MessageResponse {
  message: Message;
}

// Routes without a JSON body:
//   DELETE /api/messages/:id          → 204 (deletes for everyone)
//   GET    /api/messages/:id/media    → 200, the raw file (Content-Type, Content-Disposition)
//   PUT    /api/chats/:chatId/typing  → 204 (shows "typing…" for ~25s, or until a message is sent)
//   DELETE /api/chats/:chatId/typing  → 204
//   POST   /api/chats/:chatId/read    → 204 (marks the chat as read)
// `:chatId` accepts a phone number too, like `to` does.

// --- Errors ---

/** Codes the gateway defines for WhatsApp-domain failures. */
export type DomainErrorCode =
  | 'NOT_READY'
  | 'NOT_AUTHENTICATED'
  | 'RECIPIENT_NOT_FOUND'
  | 'CHAT_NOT_FOUND'
  | 'MESSAGE_NOT_FOUND'
  | 'EDIT_NOT_ALLOWED'
  | 'MEDIA_NOT_FOUND'
  | 'MEDIA_UNAVAILABLE'
  | 'MEDIA_FETCH_FAILED'
  | 'MEDIA_TOO_LARGE'
  | 'OPERATION_FAILED';

/**
 * Either a {@link DomainErrorCode} or one derived from the HTTP status text (e.g.
 * `BAD_REQUEST`, `UNAUTHORIZED`) — an open set, so `string` is kept assignable.
 */
export type ErrorCode = DomainErrorCode | (string & {});

/** Body of every non-2xx response. */
export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
  };
}
