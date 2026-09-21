# @whappr/gateway

Lightweight WhatsApp gateway. Wraps [whatsapp-web.js](https://wwebjs.dev/) behind a small HTTP API
([Hono](https://hono.dev/)), so other systems can send and receive WhatsApp text messages without
touching WhatsApp Web automation directly. Single account, 1:1 text chats only.

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

| Variable | Required | Description |
|---|---|---|
| `WHAPPR_SECRET` | yes | Shared secret. Signs webhook requests and gates `POST /api/messages`. |
| `WHAPPR_WEBHOOK_URL` | yes | Inbound text messages are POSTed here. |
| `WHAPPR_WEBHOOK_INTERVAL` | no (default `2`) | Seconds to buffer events before POSTing as one batch. `0` disables buffering. |
| `PORT` | no (default `3000`) | HTTP port. |
| `WHAPPR_SESSION_PATH` | no (default `.wwebjs_auth`) | Where the paired session is persisted. |
| `WHAPPR_EVENT_FILTER` | no (default `*`) | Filters which events are sent to the webhook. See "Event filtering" below. |

### API

- `GET /api/status` — no auth. `{ status, qr }`, polled by the UI.
- `POST /api/logout` — `{ "secret": "<WHAPPR_SECRET>" }`.
- `POST /api/messages` — send a text message (see Usage above for signing). `{ to, text }` →
  `{ message }`.

### Webhook events

Delivered as a signed, batched JSON array (buffered per `WHAPPR_WEBHOOK_INTERVAL`, one delivery
attempt, no retries). Event types: `msg.received`, `msg.sent`, `msg.acked`, `msg.edited`,
`msg.reacted`, `msg.revoked`.

### Event filtering

`WHAPPR_EVENT_FILTER` takes a comma-separated list of entries — `*`, a bare type
(`msg.received`), or a type with conditions (`msg.received(fromMe=true)`). Type-specific entries
take precedence over `*` for that type. Example:

```sh
WHAPPR_EVENT_FILTER=msg.received(from=1555123456@c.us),*
```

## Known limitations

- Single account, 1:1 text chats only — no groups, no media.
- No webhook retries — a failed delivery drops the whole batch.
- No field normalization — payloads use raw whatsapp-web.js field names.
- No Docker packaging yet.

## Contributing

Pull requests accepted.

## License

MIT © [Alexandru Bau](https://github.com/alexandrubau) and Whappr contributors
