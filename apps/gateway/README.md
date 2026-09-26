# @whappr/gateway

Lightweight WhatsApp gateway. Wraps [whatsapp-web.js](https://wwebjs.dev/) behind a small HTTP API
([Hono](https://hono.dev/)), so other systems can send and receive WhatsApp text messages without
touching WhatsApp Web automation directly. Single account, text chats only.

## Install

```sh
npm install         # from the repo root — installs every workspace
cp .env.dist .env
# edit .env — see "Environment variables" below
npm run dev -w apps/gateway
```

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
| `WHAPPR_SECRET` | Required. Shared secret. Signs webhook requests and gates `POST /api/messages`. |
| `WHAPPR_WEBHOOK_URL` | Required. Inbound text messages are POSTed here. |
| `PORT` | HTTP port (default `3000`). |
| `LOG_LEVEL` | Log verbosity: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` (default `info`). |
| `WWEB_SESSION_PATH` | Where the paired session is persisted (default `.wwebjs_auth`). |
| `WWEB_CACHE_PATH` | Where the WhatsApp Web version cache is persisted (default `.wwebjs_cache`). |
| `WHAPPR_WEBHOOK_INTERVAL` | Seconds to buffer events before POSTing as one batch (default `2`). `0` disables buffering. |
| `WHAPPR_EVENTS` | Filters which events are sent to the webhook (default `*`). See "Event filtering" below. |
| `WHAPPR_COMMANDS` | Comma-separated command names that trigger `cmd.invoked` instead of `msg.received` (default none). See "Commands" below. |

### API

- `GET /api/status` — no auth. `{ status, qr }`, polled by the UI.
- `POST /api/logout` — `{ "secret": "<WHAPPR_SECRET>" }`.
- `POST /api/messages` — send a text message (see Usage above for signing). `{ to, text }` →
  `{ message }`.

### Webhook events

Delivered as a signed, batched JSON array (buffered per `WHAPPR_WEBHOOK_INTERVAL`, one delivery
attempt, no retries). Event types: `msg.received`, `msg.sent`, `msg.acked`, `msg.edited`,
`msg.reacted`, `msg.revoked`, `cmd.invoked`.

### Event filtering

`WHAPPR_EVENTS` takes a comma-separated list of entries — `*`, a bare type
(`msg.received`), or a type with conditions (`msg.received(fromMe=true)`). Type-specific entries
take precedence over `*` for that type. A field name may use `.` to reach into nested objects or
array indices, e.g. `cmd.invoked(args.0=daily)` matches a command whose first argument is
`daily`. Examples:

```sh
WHAPPR_EVENTS=msg.received(from=1555123456@c.us),*
WHAPPR_EVENTS=cmd.invoked(args.0=daily)
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
commands (and from whom) actually reach the webhook, e.g.:

```sh
WHAPPR_EVENTS=cmd.invoked(command=subscribe),cmd.invoked(command=admin&author=1555123456@c.us)
```

## Known limitations

- Single account, text chats only — no media.
- No webhook retries — a failed delivery drops the whole batch.
- No field normalization — payloads use raw whatsapp-web.js field names.
- No Docker packaging yet.

## Contributing

Pull requests are welcomed.

## License

MIT © [Alexandru Bau](https://github.com/alexandrubau) and Whappr contributors.
