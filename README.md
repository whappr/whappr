# whappr

Lightweight WhatsApp gateway. Wraps [whatsapp-web.js](https://wwebjs.dev/) behind a small HTTP API
([Hono](https://hono.dev/)), so other systems can send and receive WhatsApp text messages without
touching WhatsApp Web automation directly.

Supports a single WhatsApp account. Pair it once by scanning a QR code in the browser; after that,
inbound text messages are POSTed to a webhook URL you configure, and you can send text messages
back through the API.

## Requirements

- Node.js 24+

## Quick start

```sh
npm install
cp .env.example .env
# edit .env — see "Environment variables" below
npm run dev
```

`npm install` downloads Puppeteer's bundled Chromium (allowed via `allowScripts` in
`package.json`), so no separate Chrome/Chromium install is needed.

Open `http://localhost:3000`, scan the QR code with WhatsApp on your phone
(*Linked devices → Link a device*). Once paired, the page switches to an "Authenticated" view.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `WHAPPR_SECRET` | yes | Shared secret. Signs outgoing webhook requests, gates `POST /api/messages`, and is typed into the UI to confirm logout. Generate with `openssl rand -hex 32`. |
| `WHAPPR_WEBHOOK_URL` | yes | Inbound text messages are POSTed here. |
| `WHAPPR_WEBHOOK_FLUSH_INTERVAL` | no (default `2`) | How many seconds to buffer events before POSTing them as one batch. `0` sends each event immediately, with no buffering. |
| `PORT` | no (default `3000`) | HTTP port. |
| `WHAPPR_SESSION_PATH` | no (default `.wwebjs_auth`) | Where whatsapp-web.js's `LocalAuth` persists the paired session, so you don't have to re-scan the QR on every restart. |
| `WHAPPR_EVENT_FILTER` | no (default `*`, i.e. every event) | Filter which events get POSTed to the webhook. See "Filtering which events are sent" below. |

The service fails fast at startup with a clear error if `WHAPPR_SECRET` or `WHAPPR_WEBHOOK_URL` is
missing or invalid, or if the event filter configuration is invalid (see below).

## API

### `GET /api/status`

No auth. Polled by the frontend every second.

```json
{ "status": "CREATED" | "INITIALIZING" | "AWAITING_SCAN" | "AUTHENTICATED" | "READY" | "INIT_FAILED" | "AUTH_FAILED" | "DISCONNECTED", "qr": "data:image/png;base64,..." | null }
```

### `POST /api/logout`

Body: `{ "secret": "<WHAPPR_SECRET>" }`. Compares the secret directly (constant-time) — this is the
same check used by the UI's logout button. `401` on mismatch, `409` if not currently authenticated.

### `POST /api/messages`

Sends a text message. Requires an HMAC signature (see below).

Request body:

```json
{ "to": "1555123456", "text": "hello" }
```

`to` can be a bare phone number (in international format, no `+` or spaces) or a full WhatsApp JID
(`1555123456@c.us`).

Responses: `201` with `{ "message": {...} }` on success, `503 { "error": "not_ready" }` if the
WhatsApp session isn't ready, `502 { "error": "send_failed" }` if sending failed.

#### Signing requests

Every call to `POST /api/messages` must include:

- `X-Whappr-Timestamp`: current Unix time in seconds
- `X-Whappr-Signature`: `sha256=<hex>`, an HMAC-SHA256 of `"${timestamp}.${rawBody}"` using
  `WHAPPR_SECRET`

Example:

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

Signatures older than 5 minutes are rejected.

## Webhook

Text message activity is POSTed to `WHAPPR_WEBHOOK_URL` with the same signature scheme as
`POST /api/messages` (`X-Whappr-Timestamp` / `X-Whappr-Signature`), so receivers can verify the
request came from this service.

Events aren't sent one-by-one. They're buffered in memory and flushed as a single batch after
`WHAPPR_WEBHOOK_FLUSH_INTERVAL` seconds (default `2`) — the clock starts on the first event of a new batch,
and everything that arrives before it fires is included in the same POST. Set it to `0` to send
every event immediately instead, still as a batch of one. The request body is always a JSON array
of events, even when it holds just one. Delivery of a batch is a single attempt with a 5s timeout;
failures are logged, not retried, and drop the whole batch. Any events still buffered are flushed
before the process exits on `SIGTERM`/`SIGINT`.

The event shape is extensible — new types can be added later without changing the delivery
mechanism. Today's event types:

- `msg.received` — an inbound text message.
- `msg.sent` — an outbound text message, whether sent from the linked phone directly or via
  `POST /api/messages` (both look identical to whatsapp-web.js, so both produce this event; a
  message sent through the API also gets returned synchronously in that request's response).
- `msg.acked` — a delivery/read status change for a message this account sent. Fires once per
  transition (e.g. server → device → read), so a single message can produce several of these.
- `msg.edited` — a previously sent message was edited.
- `msg.reacted` — a message was reacted to (or had a reaction removed — `data.reaction` is
  `""` in that case).
- `msg.revoked` — a message was deleted "for everyone". `data.body` is the original text when
  available, `null` otherwise (whatsapp-web.js doesn't always have it cached).

```json
[
  {
    "type": "msg.received",
    "id": "generated-uuid",
    "timestamp": "2026-09-07T12:00:00.000Z",
    "data": {
      "id": "false_1555123456@c.us_ABCDEF",
      "from": "1555123456@c.us",
      "to": "1555999999@c.us",
      "body": "hello",
      "timestamp": 1757260800,
      "fromMe": false,
      "type": "chat"
    }
  }
]
```

`msg.sent` shares the same `data` shape as `msg.received` (`fromMe` is `true` instead).
The other event types have their own, smaller `data` shapes:

```json
// msg.acked
{ "id": "...", "from": "...", "to": "...", "type": "READ" }

// msg.edited
{ "id": "...", "from": "...", "to": "...", "timestamp": 1757260800, "newBody": "hi there", "prevBody": "hi" }

// msg.reacted
{ "msgId": "...", "senderId": "1555123456@c.us", "reaction": "👍", "timestamp": 1757260800 }

// msg.revoked
{ "id": "...", "from": "...", "to": "...", "timestamp": 1757260800, "body": "the original text" }
```

Field names inside `data` are passed through as whatsapp-web.js provides them, unchanged — no
renaming yet (see "Known limitations").

### Filtering which events are sent

By default every event is POSTed to the webhook. To only forward a subset, set a single
`WHAPPR_EVENT_FILTER` environment variable to a comma-separated list of entries — no JSON/YAML,
just a small dedicated syntax.

Each entry is one of:

- `*` — a wildcard: matches any event whose type has no more specific entry of its own (see
  "Precedence" below).
- `type` on its own (e.g. `msg.received`) — matches any event of that type, unconditionally.
- `type(condition&condition&...)` — matches that type AND every listed condition, e.g.
  `msg.received(fromMe=true)` or `msg.received(from=1555123456@c.us&fromMe=false)`.

**Conditions within one entry are ANDed together — all of them must match.** To OR conditions
instead, write separate entries for the same type (e.g.
`msg.received(from=X),msg.received(fromMe=true)` matches either one); see "Precedence"
below for exactly how same-type entries combine.

A condition is `field=value`, where `field` names a field inside that event's own `data` payload.
There's no `data.` prefix: the entry's head (`msg.received(...)`) already establishes which
event type you're matching, so there's no ambiguity with the event envelope's own `type`. For
example, WhatsApp messages have their own `type` field (`chat`, `image`, ...), so
`msg.received(type=chat)` unambiguously means "the message payload's own `type` field equals
`chat`".

Values are matched with strict equality after light type coercion: the exact strings `true`/`false`
become booleans, strings that look like integers or decimals (optionally negative) become numbers,
everything else stays a string. If a condition references a field that doesn't exist on a given
event's data, that condition simply doesn't match — it's not an error. Filtering never crashes the
process at runtime; only invalid *configuration* is rejected, and only at startup.

Examples:

```sh
# Only forward messages from one specific WhatsApp number
WHAPPR_EVENT_FILTER=msg.received(from=1555123456@c.us)

# Only forward messages from that number that the account itself sent (AND, one entry)
WHAPPR_EVENT_FILTER=msg.received(from=1555123456@c.us&fromMe=true)

# Forward messages from that number, OR anything the account itself sent (OR, two entries)
WHAPPR_EVENT_FILTER=msg.received(from=1555123456@c.us),msg.received(fromMe=true)

# Only forward messages from that number (other msg.received events are excluded, not
# rescued by the wildcard), but let every other event TYPE through via the wildcard fallback
WHAPPR_EVENT_FILTER=msg.received(from=1555123456@c.us),*

# Only forward read receipts, skipping the noisier server/device ack transitions
WHAPPR_EVENT_FILTER=msg.acked(type=READ)
```

#### Precedence: specific entries win over the wildcard

This is not a flat "OR of everything" — entries for a given event type take over completely from
the wildcard for events of that type. Concretely:

```sh
WHAPPR_EVENT_FILTER=msg.received(fromMe=true),*
```

- A `msg.received` event with `fromMe: true` → **allowed** (matches the specific entry).
- A `msg.received` event with `fromMe: false` → **rejected** — even though `*` is present
  elsewhere in the list, it is not consulted once a same-type entry exists. The specific entry
  wins; the wildcard does not act as a fallback for its own type.
- Any *other* event type → **allowed**, because it has no entry of its own, so the bare `*` entry
  applies.

Rule of thumb: if the event's type has one or more entries of its own, the event is allowed if it
matches **any one** of them (OR among same-type entries), and `*` is ignored entirely; only if the
event's type has *no* entry at all does a bare `*` entry get consulted.

#### Reserved characters and whitespace

`, ( ) &` are all reserved and can't appear literally in a value — there's no escaping. A value
containing one of them either produces a clear startup error (e.g. a `,` or `(` splits or extends
the entry in a way that no longer parses) or, for a lone unescaped `&`, is silently reinterpreted as
two separate conditions instead of one. Keep values to plain identifiers, numbers, booleans, or
JIDs — none of which ever need these characters.

Whitespace around commas, type names, and field names is tolerated and trimmed. Whitespace *inside*
a value is **not** trimmed and is preserved exactly — including right after the `=`. This means
`msg.received(fromMe = true)` does **not** work the way you'd expect: the value is captured as
`" true"` (with a leading space), which doesn't match the boolean-coercion string `true` exactly,
so it's kept as the literal string `" true"` instead of the boolean `true`. Don't put spaces around
`=` inside a condition.

#### Empty, unset, or `*`

`WHAPPR_EVENT_FILTER` being unset, empty/whitespace-only, or literally `*` all mean the same thing:
allow every event. **This is a behavior change from the old `WHAPPR_EVENT_FILTER_<N>` format**,
where an empty string was a hard startup error, distinct from leaving the variable unset. Under the
new format there is no such distinction — to disable filtering, either omit the variable or set it
to `*`.

At startup, the active filter is logged once, e.g.:

```
Event filter: no filter configured — all events will be dispatched
Event filter: 1 entry: msg.received
Event filter: 1 entry: msg.received(fromMe=true)
Event filter: 2 entries: msg.received(fromMe=true), *
```

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Run with `tsx watch`, loading `.env`. |
| `npm run build` | Compile to `dist/`. |
| `npm start` | Run the compiled build (`dist/index.js`). |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | Biome lint. |
| `npm run format` | Biome format, writes changes. |
| `npm run check` | Biome lint + format + import sort, writes changes. |

## Known limitations (current iteration)

- Single WhatsApp account, 1:1 text chats only — no groups, no media.
- No webhook retries — one attempt per batch, logged on failure; a failed request drops every
  event in that batch.
- No field normalization/renaming yet — webhook and API payloads use raw whatsapp-web.js field
  names; shapes may change once normalization is added.
- Event filtering (`WHAPPR_EVENT_FILTER`) supports only flat equality conditions — no `ne`/`gt`/
  `contains`/regex operators and no nested `data.` paths (e.g. `data.contact.id`) yet. Condition
  values also can't contain a literal `,` `(` `)` or `&` — there's no escaping (see "Filtering
  which events are sent" above).
- A malformed `WHAPPR_EVENT_FILTER` entry isn't always caught at startup: two type names separated
  by a space instead of a comma (e.g. `msg.received msg.deleted`, a forgotten comma) is
  parsed as one long, literal (and unmatchable) type name rather than rejected — that entry
  silently becomes dead, with no startup error to explain why its events never arrive.
- No Docker packaging yet.
- `GET /api/status` and the static UI page are unauthenticated by design (a browser page can't
  safely compute an HMAC). Don't expose this service's port publicly without a reverse proxy in
  front.
