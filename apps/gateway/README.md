# @whappr/gateway

[![CI](https://img.shields.io/github/actions/workflow/status/whappr/whappr/ci.yml?branch=main&style=for-the-badge&logo=githubactions&logoColor=white&label=CI)](https://github.com/whappr/whappr/actions/workflows/ci.yml)
[![Docker image version](https://img.shields.io/github/package-json/v/whappr/whappr?filename=apps%2Fgateway%2Fpackage.json&style=for-the-badge&logo=docker&logoColor=white&color=2496ED&label=version)](https://github.com/whappr/whappr/pkgs/container/whappr-gateway)
[![Last commit](https://img.shields.io/github/last-commit/whappr/whappr/main?style=for-the-badge&logo=github&logoColor=white&color=181717)](https://github.com/whappr/whappr/commits/main)

Self-hosted WhatsApp gateway for AI agents.

Links to your WhatsApp account, sends every incoming message to your agent as a signed webhook, and lets
your agent reply through a small REST API. Built on [whatsapp-web.js](https://wwebjs.dev/) and
[Hono](https://hono.dev/), shipped as a Docker image.

Call it from TypeScript with [`@whappr/client`](https://github.com/whappr/whappr/tree/main/packages/client),
or connect it to Flue agents with [`@whappr/flue`](https://github.com/whappr/whappr/tree/main/packages/flue).

## Features

- **Built for agents** — one webhook per event, delivered in order. Every event carries its `chat.id`, so
  each conversation can go to its own agent instance.
- **Agent UX included** — typing indicator, read receipts, quoted replies, and voice notes in and out.
- **No database** — messages pass straight through to your webhook and aren't stored anywhere.
- **Secure by default** — the API takes a bearer token, and every webhook is HMAC-signed.
- **Simple, few dependencies** — a thin Hono API in front of whatsapp-web.js, no extra framework.

## Install

The gateway is published to `ghcr.io/whappr/whappr-gateway`, tagged `latest` and per release
(e.g. `1.0.0`). Set at least `SECRET_KEY` and `WEBHOOK_URL` (see [Configuration](#configuration)), then
run it either way.

### Using `docker run`

```sh
docker run -p 3000:3000 \
  -e SECRET_KEY=your-shared-secret \
  -e WEBHOOK_URL=https://example.com/webhook \
  -v whappr-data:/whappr/apps/gateway/data \
  ghcr.io/whappr/whappr-gateway:latest
```

### Using Docker Compose

```yaml
# docker-compose.yml
services:
  gateway:
    image: ghcr.io/whappr/whappr-gateway:latest
    environment:
      SECRET_KEY: your-shared-secret
      WEBHOOK_URL: https://example.com/webhook
    ports:
      - "3000:3000"
    volumes:
      - whappr-data:/whappr/apps/gateway/data
    restart: unless-stopped

volumes:
  whappr-data:
```

```sh
docker compose up
```

Either way, the `whappr-data` volume keeps the paired WhatsApp session across restarts, so you don't have
to scan the QR code again every time.

## Usage

1. Open `http://localhost:3000`, enter your `SECRET_KEY`, and scan the QR code with WhatsApp on your phone
   (*Linked devices → Link a device*).
2. Incoming messages are now sent to `WEBHOOK_URL` (see [Webhook events](#webhook-events)).
3. Your agent replies through the API:

```sh
curl -X POST http://localhost:3000/api/messages \
  -H "Authorization: Bearer your-shared-secret" \
  -H "Content-Type: application/json" \
  -d '{"to":"1555123456","text":"hello"}'
```

## Configuration

| Variable | Description |
|---|---|
| `SECRET_KEY` | Required, min 16 characters of letters, digits and `._~+/-` (e.g. `openssl rand -hex 32`). The bearer token for `/api/*`, and the key webhooks are signed with. |
| `WEBHOOK_URL` | Required. Where events are sent (see [Webhook events](#webhook-events)). |
| `PORT` | HTTP port (default `3000`). |
| `LOG_LEVEL` | Log verbosity: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` (default `info`). |
| `DATA_DIR` | Where the paired session and the WhatsApp Web version cache are kept (default `data`). |
| `WEBHOOK_EVENTS` | Comma-separated event types to send, e.g. `message.received,reaction.added` (default: all). |
| `MEDIA_MAX_SIZE` | Largest file, in megabytes, the gateway sends or downloads (default `64`). Files pass through the browser in memory as base64. Doesn't affect webhooks, which only carry media metadata. |

## API

Request and response bodies, and every webhook event, are typed in
[`@whappr/protocol`](https://github.com/whappr/whappr/tree/main/packages/protocol).

### Health

- `GET /health` — no auth. `{ ok: true, version, webhook }`. `webhook` is the most recent delivery since startup,
  `{ at, ok, status? }` (`status` is absent when no response arrived), or `null` before the first. It carries
  no URL or error details, and `ok` stays `true` when deliveries fail, so container health checks don't
  restart the gateway over a broken webhook receiver.

Every `/api/*` route requires `Authorization: Bearer <SECRET_KEY>`.

### Session

- `GET /api/session` — `{ status, qr, account, error? }`, see [Session states](#session-states). The bundled UI at
  `/` polls it.
- `POST /api/session/logout` — unpair the account. → `202 { ok: true }`. The gateway then restarts and
  shows a new QR code.

### Messages

Every route below requires the session to be `ready`, or it fails with `NOT_READY` (see [Errors](#errors)).
Routes that return a message return it normalized, in the same shape webhook events carry.

- `POST /api/messages` — send a message. `{ to, text?, media?, replyTo? }` → `201 { message }`.
  `to` is a chat id or a phone number in international format (`"1555123456"`); `replyTo` is the id of a
  message to quote. Without `media`, `text` is required; with it, `text` is the caption (dropped for audio,
  which WhatsApp can't caption). See [Sending media](#sending-media).
- `PATCH /api/messages/:id` — edit a message you sent. `{ text }` → `200 { message }`.
- `DELETE /api/messages/:id` — delete a message for everyone. → `204`.
- `GET /api/messages/:id/media` — download a message's file. → `200` with the raw bytes, `Content-Type`
  set to its MIME type and `Content-Disposition` carrying its file name, if any. Files are fetched from
  WhatsApp on every call; nothing is cached.
- `PUT /api/messages/:id/reaction` — set (or replace) your reaction. `{ emoji }` → `204`.
- `DELETE /api/messages/:id/reaction` — remove your reaction. → `204`.

#### Sending media

`media` takes the file either by URL (fetched by the gateway, from any `http(s)` host, within 60 seconds)
or inline as base64:

```jsonc
{ "to": "1555123456", "text": "Your invoice", "media": { "url": "https://example.com/invoice.pdf" } }
{ "to": "1555123456", "media": { "data": "<base64>", "mimeType": "audio/ogg; codecs=opus", "as": "voice" } }
```

| Field | Meaning |
|---|---|
| `url` / `data` | Exactly one. `data` requires `mimeType`. |
| `mimeType` | Defaults to the URL's `Content-Type`. |
| `fileName` | Shown for documents. Defaults to the URL's last path segment. |
| `as` | Optional. The file is sent as what `mimeType` implies (`image/*`, `video/*`, `audio/*`, anything else as a document). Set `voice` to send audio as a voice note (OGG/Opus is what WhatsApp records natively), or `document` to send any file as an attachment. |

Files are limited to `MEDIA_MAX_SIZE`, whichever way they're given.

### Chats

`ready`-only, like the message routes. `:chatId` is a chat id or a phone number.

- `PUT /api/chats/:chatId/typing` — show "typing…". → `204`. WhatsApp clears it after about 25 seconds or
  when a message is sent, so repeat it to keep it showing while your agent works.
- `DELETE /api/chats/:chatId/typing` — clear it. → `204`.
- `POST /api/chats/:chatId/read` — mark the chat's messages as read (blue ticks). → `204`.

`GET /` serves the bundled pairing/status UI (`public/index.html`). It isn't part of the API.

## Webhook events

Each event is sent to `WEBHOOK_URL` as an HTTP `POST` as soon as it happens, one event per request, in the
order the events occurred. Delivery is attempted once, with no retries, and your endpoint has 5 seconds to
respond. Acknowledge right away and run your agent afterwards, or later events will queue up behind it.

The body is the event itself, `{ id, type, timestamp, data }`, signed with the `X-Whappr-Timestamp` and
`X-Whappr-Signature` headers (HMAC-SHA256 of `${timestamp}.${body}` with `SECRET_KEY`). Check it with
`verifyWebhook` from [`@whappr/protocol`](https://github.com/whappr/whappr/tree/main/packages/protocol).
Every event's `data` carries the conversation as `chat` (`{ id, type: "direct" | "group" }`), so you can
route on `data.chat.id` regardless of the event type.

| Type | `data` |
|---|---|
| `message.received` | A message someone else sent to the paired account. |
| `message.edited` | `messageId`, `chat`, `sender`, `text`, `previousText`. |
| `message.deleted` | `messageId`, `chat`, `sender` — deleted for everyone. |
| `reaction.added` | `messageId`, `chat`, `sender`, `emoji`. Also sent when a reaction is replaced. |
| `reaction.removed` | `messageId`, `chat`, `sender`. |

Set `WEBHOOK_EVENTS` to receive only some of these types. Anything finer, like one conversation or group
messages that @-mention you, is a line of code in your handler, on fully typed events.

A message carries `id`, `chat`, `sender` (`{ id, name?, isMe }`), `timestamp` (ISO 8601), `kind` (`text`,
`image`, `video`, `audio`, `voice`, `document`, `sticker`, `location`, `contact` or `unsupported`), `text`
(the body, or a media caption), `replyTo` (the quoted message, if any), `mentions` and `mentionsMe`.
Kind-specific fields: `media` (`{ mimeType, fileName?, size?, duration? }`; download the file itself with
`GET /api/messages/:id/media`), `location` and `contacts`.

Ids (`chat.id`, `sender.id`, message ids) are opaque: store them and pass them back as-is.

Bot commands (`/subscribe daily`) are plain `message.received` text: parse `data.text` in your handler.

## Session states

`GET /api/session` returns `{ status, qr, account, error? }`. `status` is one of:

| Status | Meaning |
|---|---|
| `starting` | Starting whatsapp-web.js, or loading WhatsApp Web after a scan. |
| `awaiting_scan` | QR ready. `qr` is a data URL to render or scan. |
| `ready` | Connected. Messages can be sent. `account` is the paired account: `{ id, phone, name? }`, with `phone` in international format without `+`. It is `null` in every other state. |
| `failed` | The client couldn't start, or WhatsApp rejected authentication. See `error` and the logs. |
| `disconnected` | Session dropped. The gateway restarts it automatically. |

## Errors

Every error response is `{ error: { code, message } }`. Domain-specific codes:

| Code | Status | Meaning |
|---|---|---|
| `NOT_READY` | 503 | Session isn't `ready` yet. |
| `NOT_AUTHENTICATED` | 409 | `POST /api/session/logout` called with no authenticated session. |
| `RECIPIENT_NOT_FOUND` | 422 | The phone number in `to` isn't on WhatsApp. |
| `CHAT_NOT_FOUND` | 404 | No such chat, or one the gateway doesn't handle (status updates, channels). |
| `MESSAGE_NOT_FOUND` | 404 | No message with that id (also for `replyTo`). |
| `EDIT_NOT_ALLOWED` | 409 | WhatsApp no longer allows editing this message (e.g. too old). |
| `MEDIA_NOT_FOUND` | 404 | The message has no file. |
| `MEDIA_UNAVAILABLE` | 410 | WhatsApp no longer serves the file (e.g. expired or deleted from its servers). |
| `MEDIA_TOO_LARGE` | 413 | The file is larger than `MEDIA_MAX_SIZE`. |
| `MEDIA_FETCH_FAILED` | 422 | The gateway couldn't fetch `media.url` (unreachable, non-2xx, or timed out). |
| `OPERATION_FAILED` | 502 | whatsapp-web.js/WhatsApp Web rejected the operation. |

Other failures (missing or wrong bearer token, malformed body, unknown route, unexpected errors) use the
same shape with a status-derived code, e.g. `UNAUTHORIZED`, `BAD_REQUEST`, `NOT_FOUND`,
`INTERNAL_SERVER_ERROR`.

## Scope

The gateway is not a full WhatsApp Web API. It exposes what a conversational agent needs:

- **Supported** — direct and group chats; text, media, voice notes, locations and contacts in; text and
  media out; replies, edits, deletes, reactions, typing indicator, read receipts and media downloads.
- **Out of scope** — status updates, channels, broadcast lists, group and contact administration, polls,
  payments and calls. Status updates, broadcast lists and channels are never forwarded. Other message types
  the gateway doesn't model (polls, payments, ...) arrive as `unsupported` instead of being dropped.

## Development

To work on the gateway itself instead of just running the image, clone the monorepo and run it from source:

```sh
npm install                                  # from the repo root, installs every workspace
cp apps/gateway/.env.dist apps/gateway/.env
# edit apps/gateway/.env, see "Configuration" above
npm run dev -w apps/gateway
```

To run the compiled output with Node, the same way the Docker image's `CMD` does, use
`npm run build && npm start -w apps/gateway`. Build from the repo root, so `@whappr/protocol` is built
first.

## Contributing

Pull requests are welcome.

## License

MIT © [Alexandru Bau](https://github.com/alexandrubau) and Whappr contributors.
