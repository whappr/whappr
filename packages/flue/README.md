# @whappr/flue

Verified [Whappr gateway](../../apps/gateway) webhook ingress for [Flue](https://flueframework.com) applications.

## Install

```sh
npm install @whappr/flue @flue/runtime hono
```

## Quick start

```ts
// channels/whappr.ts
import { createWhapprChannel } from '@whappr/flue';

export const channel = createWhapprChannel({
  secret: process.env.WHAPPR_SECRET!,

  // Path: /channels/whappr/webhook
  async events({ events }) {
    for (const event of events) {
      console.log('verified event:', event.type);
    }
  },
});
```

```ts
// app.ts
import { Hono } from 'hono';
import { channel } from './channels/whappr.ts';

const app = new Hono();
app.route('/channels/whappr', channel.route());

export default app;
```

Set the gateway's `WHAPPR_WEBHOOK_URL` to `https://<your-app>/channels/whappr/webhook`, and
`WHAPPR_SECRET` to the same value passed here.

This package has no dispatch-to-agent logic built in — deciding which agent, and calling
`dispatch()`/`init()`, is application-owned. See
[Wiring this into a Flue app](#wiring-this-into-a-flue-app) below.

## How it works

The route verifies the gateway's webhook signature (`X-Whappr-Timestamp` / `X-Whappr-Signature`,
HMAC-SHA256 over the entire raw request body — the same scheme `@whappr/client` uses to sign its
own outgoing requests) before your `events(...)` callback ever runs. Unlike per-item-signed
providers, Whappr signs the whole batch as one unit — verification is all-or-nothing per request.
A missing/invalid signature, a stale timestamp (older than 5 minutes by default), or a malformed
body gets rejected with `401`/`400`/`413` before your callback runs.

## API

### `createWhapprChannel(options)`

`options: { secret, bodyLimit?, maxSignatureAgeSeconds?, events(input) }`

- `secret` — must match the gateway's `WHAPPR_SECRET`.
- `bodyLimit` — maximum request body size in bytes (default 1 MiB).
- `maxSignatureAgeSeconds` — replay window (default 300, matching the gateway).
- `events({ c, events })` — called once per verified webhook delivery with the batch of
  `AnyWhapprEvent` (`msg.received`, `msg.sent`, `msg.acked`, `msg.edited`, `msg.reacted`,
  `msg.revoked`) that passed verification. `c` is the Hono context. Returning nothing produces an
  empty `200`; a JSON-compatible value becomes a JSON response; a `Response` passes through
  unchanged.

Throws `WhapprInvalidInputError` if `secret` or `events` is missing or malformed.

### `channel.route()`

Returns a mountable Hono sub-app serving the channel's routes relative to wherever you mount it
(`POST /webhook`).

### `channel.instanceId(ref)`

`ref: { chatId }` — the counterparty's WhatsApp JID (e.g. `"1555123456@c.us"`).

Derives a canonical agent-instance id — `whappr:v1:chat:<chatId>` — grouping one WhatsApp chat
into one agent instance. It's routing identity, not an authorization capability. Throws
`WhapprInvalidInputError` if `ref.chatId` is missing.

### `channel.parseInstanceId(id)`

Inverse of `instanceId()`. Throws `WhapprInvalidInstanceIdError` if `id` isn't a canonical id this
package produced.

## Error handling

Both errors extend `WhapprChannelError` (itself a `TypeError`), so `instanceof WhapprChannelError`
catches anything this package throws:

| Error | Thrown when |
|---|---|
| `WhapprInvalidInputError` | `createWhapprChannel()` or `instanceId()` receives a missing or malformed `secret`, `events`, `bodyLimit`, `maxSignatureAgeSeconds`, or ref field. Carries a `.field` naming the bad input. |
| `WhapprInvalidInstanceIdError` | `parseInstanceId()` receives a string that isn't a canonical id this package produced. |

## Good to know

- **Ingress-only.** This package verifies inbound webhooks and hands you the event batch — it
  never calls `dispatch()`/`init()` and never sends anything back to WhatsApp. Sending replies
  means calling [`@whappr/client`](../client) directly from your own agent/tool code, the same way
  an official Flue channel's docs have the application construct and call its own provider SDK
  client.
- **Single account, 1:1 chats only, today.** The Whappr gateway currently supports one WhatsApp
  account and text-only 1:1 chats — no groups yet (see the gateway's own "Known limitations").
  `instanceId()` reflects that: one segment, one chat.
- **No built-in redelivery dedup — but the gateway doesn't retry either.** Unlike Slack or Meta's
  WhatsApp Cloud API, which redeliver aggressively and expect consumers to deduplicate, the Whappr
  gateway sends each webhook batch **at most once** — a failed delivery is logged and dropped, not
  retried. So there's less need for `dispatch()`'s `idempotencyKey` here than for most other
  channels, though passing the event's own `id` is still cheap, good practice for defense in depth.
- **Node-only.** Signature verification uses `node:crypto`, matching `@whappr/client`'s own
  `sign.ts`.

## Wiring this into a Flue app

```ts
// channels/whappr.ts
import { createWhapprChannel } from '@whappr/flue';
import { dispatch } from '@flue/runtime';
import { Assistant } from '../agents/assistant.ts';

export const channel = createWhapprChannel({
  secret: process.env.WHAPPR_SECRET!,

  // Path: /channels/whappr/webhook
  async events({ events }) {
    for (const event of events) {
      if (event.type !== 'msg.received') continue;
      const { data } = event;

      await dispatch(Assistant, {
        id: channel.instanceId({ chatId: data.from }),
        // Recorded once when this event creates the instance; ignored after.
        initialData: { chatId: data.from },
        message: {
          kind: 'signal',
          type: 'whappr.message.received',
          body: data.body,
          attributes: { messageId: data.id },
        },
      });
    }
  },
});
```

```ts
// agents/assistant.ts
'use agent';
import { useInitialData, useModel } from '@flue/runtime';
import * as v from 'valibot';

const initialData = v.object({ chatId: v.string() });

export function Assistant() {
  useModel('anthropic/claude-sonnet-4-6');
  const data = useInitialData<v.InferOutput<typeof initialData>>();
  if (!data) throw new Error('This agent is created by the Whappr channel dispatch.');
  return `Reply concisely in the bound WhatsApp chat with ${data.chatId}.`;
}
Assistant.initialData = initialData;
```

Sending the reply is entirely up to your own agent/tool code, using
[`@whappr/client`](../client):

```ts
import { createWhapprClient } from '@whappr/client';

const client = createWhapprClient({
  baseUrl: process.env.WHAPPR_GATEWAY_URL!,
  secret: process.env.WHAPPR_SECRET!,
});
await client.messages.send({ to: data.chatId, text: reply });
```

Whether you fire-and-forget the `dispatch()` above (and send the reply from a tool the model calls
itself) or `init(...).dispatch(...)` / `.read(...)` the reply back before sending it yourself —
that choice depends on how `Assistant` sends its output, not on anything this package controls.
