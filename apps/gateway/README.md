# @whappr/gateway

[![CI](https://img.shields.io/github/actions/workflow/status/whappr/whappr/ci.yml?branch=main&style=for-the-badge&logo=githubactions&logoColor=white&label=CI)](https://github.com/whappr/whappr/actions/workflows/ci.yml)
[![Docker image version](https://img.shields.io/github/package-json/v/whappr/whappr?filename=apps%2Fgateway%2Fpackage.json&style=for-the-badge&logo=docker&logoColor=white&color=2496ED&label=version)](https://github.com/whappr/whappr/pkgs/container/whappr-gateway)
[![Last commit](https://img.shields.io/github/last-commit/whappr/whappr/main?style=for-the-badge&logo=github&logoColor=white&color=181717)](https://github.com/whappr/whappr/commits/main)

Self-hosted WhatsApp gateway for AI agents.

> Whappr is under active development. Until v1 is released, any update may include breaking changes. It is
> recommended to pin exact versions.

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

## Risks

The gateway is unofficial: it uses [whatsapp-web.js](https://wwebjs.dev/), not Meta's official
[WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api), so WhatsApp can restrict or
ban the number you link.

- **Use a dedicated number** you can afford to lose, never your primary one.
- **Only message people who expect it.** Don't cold-message strangers or send in bulk.
- **Keep a fallback** for anything critical. For regulated use, choose the official Cloud API.

## Install

The gateway is published to `ghcr.io/whappr/whappr-gateway` for `linux/amd64` and `linux/arm64`,
tagged `latest` and per release (e.g. `1.0.0`). Set at least `SECRET_KEY` and `WEBHOOK_URL` (see [Configuration](#configuration)), then
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
to scan the QR code again every time. The session lives at `/whappr/apps/gateway/data` inside the
container. If you bind-mount a host folder there instead (`-v ./data:/whappr/apps/gateway/data`), it
must be writable by uid 1000, the `node` user the gateway runs as.

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
| `FILTER_EVENT_TYPES` | Comma-separated event types to send, e.g. `message.received,reaction.added` (default: all). |
| `FILTER_CHAT_IDS` | Comma-separated chats to send events for: phone numbers or chat ids, e.g. `40712345678,120363…@g.us` (default: all). See [Filtering events](#filtering-events). |
| `FILTER_SENDER_IDS` | Comma-separated senders to send events for, in direct and group chats: phone numbers or sender ids, e.g. `40712345678,…@lid` (default: all). Group events have no sender and aren't affected. See [Filtering events](#filtering-events). |
| `MEDIA_MAX_SIZE` | Largest file, in megabytes, the gateway sends or downloads (default `64`). Files pass through the browser in memory as base64. Doesn't affect webhooks, which only carry media metadata. |
| `DEVICE_NAME` | The name WhatsApp shows for the gateway under Linked devices, set when pairing (default: whatsapp-web.js's own). |

## API

Request and response bodies, and every webhook event, are typed in
[`@whappr/protocol`](https://github.com/whappr/whappr/tree/main/packages/protocol).

### Health

- `GET /health` — no auth. `{ ok, version, session: { ok, status }, webhook }`. `session.status` is the WhatsApp
  session's status (see [Session states](#session-states)); once it's `failed` (e.g. Chromium couldn't launch),
  `session.ok` and the top-level `ok` turn `false` and the response is a `503`, which marks the container
  unhealthy. The top-level `ok` is the overall result across components. `webhook` is the most recent delivery since startup,
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

  Send an `Idempotency-Key` header to make retries safe: the message is sent once per key for 24 hours.
  Repeating the request with the same key answers with the message already sent (waiting for it if it's
  still being sent), whatever the body. A failed send forgets the key so you can retry it. Keys are kept
  in memory, at most the 10,000 most recent, so a restart forgets them.
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
- `DELETE /api/chats/:chatId` — delete the chat and its history on the paired account only. → `204`.
  A group's chat can only be deleted once the account left it (e.g. after being removed):
  `STILL_IN_GROUP` while it's a member. Leave first, or leave with `deleteChat`.

### Groups

`ready`-only. `:groupId` is a group chat id (`…@g.us`); anything else answers `CHAT_NOT_FOUND`.

- `GET /api/groups` — the groups the account is a member of. → `200 { groups: [{ id, name }] }`.
  Slow on accounts with many groups, since each group is refreshed from WhatsApp.
- `GET /api/groups/:groupId` — `200 { id, name, participants }`, each participant
  `{ id, phone?, lid?, name?, isMe, isAdmin }`. `CHAT_NOT_FOUND` for a group the account isn't in.
- `POST /api/groups/:groupId/leave` — leave the group. Optional body `{ deleteChat?: boolean }`: `true` also
  deletes the group's chat and history on the paired account. → `204`, and a `group.left` event with
  `reason: "left"`. `CHAT_NOT_FOUND` for a group the account isn't in.

To delete the chat of a group the account already left, use `DELETE /api/chats/:chatId`. Deleting only
ever affects the paired account: WhatsApp can't delete a group for everyone, and the group
and its history stay for the other members.

Anyone can add the account to a group, and WhatsApp offers no way to refuse. Deciding which groups to stay
in is up to you: check `participants` on `group.joined` (or with `GET /api/groups/:groupId`) and
leave the groups you don't want to be in.

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
| `message.edited` | `messageId`, `chat`, `sender`, `text`, `previousText`, `mentions`, `mentionsMe` (for the new `text`). |
| `message.deleted` | `messageId`, `chat`, `sender` — deleted for everyone. |
| `reaction.added` | `messageId`, `chat`, `sender`, `emoji`. Also sent when a reaction is replaced. |
| `reaction.removed` | `messageId`, `chat`, `sender`. |
| `group.joined` | `chat`, `author?`, `participants` — the account was added to a group, or was a member when it was created. |
| `group.left` | `chat`, `author?`, `reason` (`removed` or `left`) — an admin removed the account, or it left through the API. |
| `group.participant.joined` | `chat`, `author?`, `participant` — someone else joined a group the account is in. |
| `group.participant.left` | `chat`, `author?`, `participant`, `reason` (`left` or `removed`) — someone else left, or was removed. |

A message carries `id`, `chat`, `sender` (`{ id, phone?, lid?, name?, isMe }`), `timestamp` (ISO 8601), `kind` (`text`,
`image`, `video`, `audio`, `voice`, `document`, `sticker`, `location`, `contact` or `unsupported`), `text`
(the body, or a media caption), `replyTo` (the quoted message, if any), `mentions` (the @-mentioned
participants, `{ id, phone?, lid?, name?, isMe }` each) and `mentionsMe` (whether one of them is the paired account).
A mention's `name` is the contact's name as saved by the paired account, or else their own display name.
In `text`, WhatsApp writes each mention as `@` plus the part of its `id` before the `@` (`@40712345678`
for `40712345678@c.us`).
Kind-specific fields: `media` (`{ mimeType, fileName?, size?, duration? }`; download the file itself with
`GET /api/messages/:id/media`), `location` and `contacts`.

Group events carry people as `{ id, phone?, lid?, name?, isMe }`, without names except your own. `author` is whoever
added or removed someone, when WhatsApp says. `participants` lists every member, you included. When several
people are added or removed at once, each gets their own `group.participant.*` event. A change that includes
you produces only your `group.joined` or `group.left`. Leaving a group from the phone (or another linked
device) produces no `group.left`: WhatsApp doesn't notify it. Changes made while the gateway was stopped produce
no events, and deliveries aren't retried: compare against `GET /api/groups` if you track membership.

Ids (`chat.id`, `sender.id`, message ids) are opaque: store them and pass them back as-is.
A person's `id` is the same in every event: phone-based (`…@c.us`) when WhatsApp knows their number,
else their privacy id (`…@lid`). `phone` and `lid` carry whichever of the two WhatsApp knows. A mention's
`id` is the exception: exactly as written in `text`.

Bot commands (`/subscribe daily`) are plain `message.received` text: parse `data.text` in your handler.

### Filtering events

Set `FILTER_EVENT_TYPES` to receive only some event types, `FILTER_CHAT_IDS` to receive only some
conversations, and `FILTER_SENDER_IDS` to receive only some senders. An event is sent when it passes all
three, so `FILTER_CHAT_IDS=120363…@g.us` with `FILTER_SENDER_IDS=40712345678` sends only that person's
events in that group. Filtered-out events never leave the gateway, but the API can still reach every chat.

`FILTER_CHAT_IDS` takes phone numbers in international format (`40712345678`), direct chat ids (`…@c.us`,
`…@lid`) and group chat ids (`…@g.us`). A phone number or `@c.us` id also matches the chat when WhatsApp
addresses it by its privacy id (`…@lid`). Phone numbers aren't looked up, so write them as they appear in
`@c.us` ids. To find a chat id, run with `LOG_LEVEL=debug`: every event skipped for its chat is logged with
its `chatId`.

`FILTER_SENDER_IDS` matches `sender.id`, in direct and group chats alike. Group events have no sender, so
it doesn't filter them: use `FILTER_EVENT_TYPES` and `FILTER_CHAT_IDS` for those. It takes phone numbers and sender
ids (`…@c.us`, `…@lid`), and matches `@lid` senders the same way. In groups WhatsApp often names senders by
`@lid`, so list their phone number or `@c.us` id. Events skipped for their sender are logged at `debug` with
their `senderId`. Your own reactions, edits and deletions have you as sender, so list your own number to keep
them.

Anything finer, like group messages that @-mention you, is a line of code in your handler, on fully typed
events.

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
| `CHAT_NOT_FOUND` | 404 | No such chat, or one the gateway doesn't handle (status updates, channels). For `/api/groups`, also a group the account isn't in. |
| `STILL_IN_GROUP` | 409 | `DELETE /api/chats/:chatId` on a group the account is still a member of. |
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
  media out; replies, edits, deletes, reactions, typing indicator, read receipts and media downloads;
  group membership events, listing and leaving groups, and deleting group chats.
- **Out of scope** — status updates, channels, broadcast lists, creating and administering groups, contact
  administration, polls, payments and calls. Status updates, broadcast lists and channels are never forwarded. Other message types
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
