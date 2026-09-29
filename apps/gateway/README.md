# @whappr/gateway

[![CI](https://img.shields.io/github/actions/workflow/status/whappr/whappr/ci.yml?branch=main&style=for-the-badge&logo=githubactions&logoColor=white&label=CI)](https://github.com/whappr/whappr/actions/workflows/ci.yml)
[![Docker image version](https://img.shields.io/github/package-json/v/whappr/whappr?filename=apps%2Fgateway%2Fpackage.json&style=for-the-badge&logo=docker&logoColor=white&color=2496ED&label=version)](https://github.com/whappr/whappr/pkgs/container/whappr-gateway)
[![Last commit](https://img.shields.io/github/last-commit/whappr/whappr/main?style=for-the-badge&logo=github&logoColor=white&color=181717)](https://github.com/whappr/whappr/commits/main)

Lightweight WhatsApp gateway. Built on [whatsapp-web.js](https://wwebjs.dev/) and
[Hono](https://hono.dev/), shipped as a Docker image.

Talk to it with [`@whappr/client`](https://github.com/whappr/whappr/tree/main/packages/client) or ingest its webhooks
with [`@whappr/flue`](https://github.com/whappr/whappr/tree/main/packages/flue) for Flue apps.

## Features

- **Simple, few dependencies** — a thin Hono API in front of whatsapp-web.js, no extra framework.
- **No database** — messages pass straight through to your webhook and aren't stored anywhere.
- **Signed end-to-end** — inbound webhooks and outbound API calls are both HMAC-signed.
- **Fine-grained event filtering** — `WHAPPR_EVENTS` controls which events reach your webhook.
- **Built-in bot commands** — `WHAPPR_COMMANDS` recognizes `/command` messages as commands.

## Install

The gateway ships as a Docker image published to `ghcr.io/whappr/whappr-gateway` — tagged `latest`
and per-release (e.g. `1.0.0`). Set at
least `WHAPPR_SECRET` and `WHAPPR_WEBHOOK_URL` (see "Environment variables" below), then run it
either way:

### Using `docker run`

```sh
docker run -p 3000:3000 \
  -e WHAPPR_SECRET=your-shared-secret \
  -e WHAPPR_WEBHOOK_URL=https://example.com/webhook \
  -v wweb-session:/whappr/apps/gateway/.wwebjs_auth \
  ghcr.io/whappr/whappr-gateway:latest
```

### Using Docker Compose

```yaml
# docker-compose.yml
services:
  gateway:
    image: ghcr.io/whappr/whappr-gateway:latest
    environment:
      WHAPPR_SECRET: your-shared-secret
      WHAPPR_WEBHOOK_URL: https://example.com/webhook
    ports:
      - "3000:3000"
    volumes:
      - wweb-session:/whappr/apps/gateway/.wwebjs_auth
    restart: unless-stopped

volumes:
  wweb-session:
```

```sh
docker compose up
```

Either way, the `whappr-session` volume persists the paired WhatsApp session across restarts, so
you don't have to re-scan the QR code every time.

## Usage

Open `http://localhost:3000` and scan the QR code with WhatsApp on your phone
(*Linked devices → Link a device*). Once paired, inbound text messages are POSTed to
`WHAPPR_WEBHOOK_URL`, and you can send messages back through the API:

```sh
SECRET=your-secret
BODY='{"to":"1555123456","text":"hello"}'
TS=$(date +%s)
SIG="sha256=$(printf '%s' "$TS.$BODY" | openssl dgst -sha256 -hmac "$SECRET" | cut -d' ' -f2)"

curl -X POST http://localhost:3000/api/messages \
  -H "Content-Type: application/json" \
  -H "X-Whappr-Timestamp: $TS" \
  -H "X-Whappr-Signature: $SIG" \
  -d "$BODY"
```

### Environment variables

| Variable | Description |
|---|---|
| `WHAPPR_SECRET` | Required, min 16 characters. Signs webhook requests and gates the `/api/messages*` routes. |
| `WHAPPR_WEBHOOK_URL` | Required. Inbound text messages are POSTed here. |
| `PORT` | HTTP port (default `3000`). |
| `LOG_LEVEL` | Log verbosity: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` (default `info`). |
| `WWEB_SESSION_PATH` | Where the paired session is persisted (default `.wwebjs_auth`). |
| `WWEB_CACHE_PATH` | Where the WhatsApp Web version cache is persisted (default `.wwebjs_cache`). |
| `WHAPPR_WEBHOOK_INTERVAL` | Seconds to buffer events before POSTing as one batch (default `2`). `0` disables buffering. |
| `WHAPPR_EVENTS` | Filters which events are sent to the webhook (default `*`). See "Event filtering" below. |
| `WHAPPR_COMMANDS` | Comma-separated command names that trigger `cmd.invoked` instead of `msg.received` (default none). See "Commands" below. |

### API

#### Health

- `GET /health` — no auth. `{ ok: true }`.

#### Session

- `GET /api/status` — no auth. `{ status, qr }` — see "Session state" below. Polled by the bundled
  UI at `/`.
- `POST /api/logout` — `{ "secret": "<WHAPPR_SECRET>" }` → `202 { ok: true }`. `401` if the secret
  doesn't match.

#### Messages

Every route below is HMAC-signed (see Usage above) and requires the session to be `READY`, or it
fails with `NOT_READY` (see Errors).

- `POST /api/messages` — send a text message. `{ to, text }` → `201 { message }`.
- `PATCH /api/messages/:id` — edit a message you sent. `{ text }` → `200 { message }`. The
  returned `message` here is an edit record (`id, from, to, timestamp, newBody, oldBody`) — a
  different shape than `message` from send/reply below.
- `DELETE /api/messages/:id` — delete a message for everyone. → `204`.
- `POST /api/messages/:id/reactions` — set an emoji reaction. `{ emoji }` → `204`.
- `DELETE /api/messages/:id/reactions` — clear the reaction. → `204`.
- `POST /api/messages/:id/replies` — send a text message as a reply. `{ text }` → `201 { message }`.

`GET /` serves the bundled pairing/status UI (`public/index.html`) — it isn't part of the API above.

### Session state

`GET /api/status` returns `{ status, qr }`. `status` is one of:

| Status | Meaning |
|---|---|
| `CREATED` | Session created, initialization not started yet. |
| `INITIALIZING` | Starting whatsapp-web.js / Puppeteer. |
| `AWAITING_SCAN` | QR ready — `qr` is a data URL to render or scan. |
| `AUTHENTICATED` | Paired, waiting for WhatsApp Web to finish loading. |
| `READY` | Connected — messages can be sent. |
| `INIT_FAILED` | Initialization threw. |
| `AUTH_FAILED` | WhatsApp rejected authentication. |
| `DISCONNECTED` | Session dropped. The gateway restarts it automatically. |

### Errors

Every error response is `{ error: { code, message } }`. Domain-specific codes:

| Code | Status | Meaning |
|---|---|---|
| `NOT_READY` | 503 | Session isn't `READY` yet. |
| `MESSAGE_NOT_FOUND` | 404 | No message with that id. |
| `EDIT_NOT_ALLOWED` | 409 | WhatsApp no longer allows editing this message (e.g. too old). |
| `NOT_AUTHENTICATED` | 409 | `POST /api/logout` called with no authenticated session. |
| `OPERATION_FAILED` | 502 | whatsapp-web.js/WhatsApp Web rejected the operation. |

Other failures (invalid signature, malformed body, unknown route, unexpected errors) use the same
shape with a status-derived code, e.g. `UNAUTHORIZED`, `BAD_REQUEST`, `NOT_FOUND`,
`INTERNAL_SERVER_ERROR`.

### Webhook events

Delivered as a signed, batched JSON array (buffered per `WHAPPR_WEBHOOK_INTERVAL`, one delivery
attempt, no retries). Event types: `msg.received`, `msg.sent`, `msg.acked`, `msg.edited`,
`msg.reacted`, `msg.revoked`, `cmd.invoked`.

### Event filtering

`WHAPPR_EVENTS` takes a comma-separated list of entries — `*`, a bare type
(`msg.received`), or a type with conditions (`msg.received(fromMe=true)`). Type-specific entries
take precedence over `*` for that type. A field name may use `.` to reach into a nested field or
array index, should a future event carry one. Example:

```sh
WHAPPR_EVENTS=msg.received(from=1555123456@c.us),*
```

### Commands

`WHAPPR_COMMANDS` is a comma-separated allow-list of command names, e.g.:

```sh
WHAPPR_COMMANDS=start,help,subscribe
```

An inbound message whose body starts with `/` followed by one of these names produces a
`cmd.invoked` event instead of `msg.received` — e.g. `/subscribe daily digest` becomes
`{ command: "subscribe", args: ["daily", "digest"], ... }` (plus the same `id`/`from`/`to`/
`author`/`body`/`timestamp` fields as a regular message payload). The match replaces
`msg.received` for that message; it isn't emitted twice. A `/` message whose name isn't
configured is left as plain `msg.received` — nothing is silently dropped. This is a whappr text
convention, not a WhatsApp platform feature: whatsapp-web.js has no native concept of bot
commands.

There's no separate authorization mechanism — use `WHAPPR_EVENTS` to restrict which
commands (and from whom) actually reach the webhook. `args` is an array, so a field path can
index into it with `.0`, `.1`, etc. — e.g. `cmd.invoked(args.0=daily)` matches a command whose
first argument is `daily`:

```sh
WHAPPR_EVENTS=cmd.invoked(command=subscribe),cmd.invoked(command=admin&author=1555123456@c.us)
WHAPPR_EVENTS=cmd.invoked(args.0=daily)
```

## Development

To work on the gateway itself instead of just running the image, clone the monorepo and run it
from source:

```sh
npm install                                  # from the repo root — installs every workspace
cp apps/gateway/.env.dist apps/gateway/.env
# edit apps/gateway/.env — see "Environment variables" above
npm run dev -w apps/gateway
```

`npm run build -w apps/gateway && npm start -w apps/gateway` runs the compiled output directly
with Node, the same way the Docker image's `CMD` does, without building the image itself.

## Contributing

Pull requests are welcomed.

## License

MIT © [Alexandru Bau](https://github.com/alexandrubau) and Whappr contributors.
