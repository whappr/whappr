# @whappr/flue

[![CI](https://img.shields.io/github/actions/workflow/status/whappr/whappr/ci.yml?branch=main&style=for-the-badge&logo=githubactions&logoColor=white&label=CI)](https://github.com/whappr/whappr/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@whappr/flue?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@whappr/flue)
[![npm downloads](https://img.shields.io/npm/dw/@whappr/flue?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@whappr/flue)
[![Last commit](https://img.shields.io/github/last-commit/whappr/whappr/main?style=for-the-badge&logo=github&logoColor=white&color=181717)](https://github.com/whappr/whappr/commits/main)

Flue channel for the Whappr WhatsApp gateway.

Connects your [Flue](https://flueframework.com) agents to WhatsApp. It verifies the gateway's signed
webhooks and hands you each event to dispatch to your agents. Built on Web APIs only, so it runs on Node and
edge runtimes.

Requires a running [Whappr Gateway](https://github.com/whappr/whappr/tree/main/apps/gateway).

## Install

```sh
npm install @whappr/flue @flue/runtime hono
```

## Usage

```ts
// channels/whappr.ts
import { createWhapprChannel } from '@whappr/flue';

export const channel = createWhapprChannel({
  secret: process.env.SECRET_KEY!,

  // Path: /channels/whappr/webhook
  async event({ event }) {
    console.log('verified event:', event.type);
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

Set the gateway's `WEBHOOK_URL` to `https://<your-app>/channels/whappr/webhook`, and its `SECRET_KEY` to the
same value passed here.

## Options

`createWhapprChannel(options)` accepts:

| Option | Description |
|---|---|
| `secret` | Required. Shared secret configured on the gateway as `SECRET_KEY`. Used to verify the webhook signature. |
| `event` | Required. Callback invoked with each verified webhook event: `({ c, event }) => void \| JsonValue \| Response`. Event types come from [`@whappr/protocol`](https://github.com/whappr/whappr/tree/main/packages/protocol) and are re-exported here. |

Requests with a missing, invalid or older-than-5-minutes signature get `401`; bodies over 1 MiB get `413`.
`createWhapprChannel()` throws a `TypeError` if `secret` or `event` is missing.

## API

**`createWhapprChannel(options)`** — Verifies the gateway's webhook signature before `event({ c, event })`
runs. See [Options](#options).

**`channel.route()`** — Mountable Hono sub-app (`POST /webhook`).

**`channel.instanceId(chatId)`** — Agent-instance id for one chat: `whappr:chat:<chatId>`.

This package only handles incoming webhooks. To send replies, call
[`@whappr/client`](https://github.com/whappr/whappr/tree/main/packages/client) from your own agent or tool
code.

## Wiring into a Flue app

Each chat gets its own agent instance. Commands and messages are dispatched as different signals:

```ts
// channels/whappr.ts
import { createWhapprChannel } from '@whappr/flue';
import { dispatch } from '@flue/runtime';
import { Assistant } from '../agents/assistant.ts';

export const channel = createWhapprChannel({
  secret: process.env.SECRET_KEY!,
  async event({ event }) {
    if (event.type !== 'message.received') return;

    // Every event carries its conversation as `data.chat`, whatever its type.
    const chatId = event.data.chat.id;
    const id = channel.instanceId(chatId);

    // Commands get their own signal type so the agent can route them to dedicated handlers.
    // e.g. "/subscribe daily digest" → command "subscribe", args ["daily", "digest"]
    const [command, ...args] =
      event.data.kind === 'text' && event.data.text.startsWith('/')
        ? event.data.text.slice(1).trim().split(/\s+/)
        : [];
    if (command) {
      await dispatch(Assistant, {
        id,
        initialData: { chatId },
        message: {
          kind: 'signal',
          type: 'whappr.command.invoked',
          body: args.join(' '),
          attributes: { command, args, messageId: event.data.id },
        },
      });
      return;
    }

    // Messages dispatch as a generic signal. `text` is the body or a media caption.
    await dispatch(Assistant, {
      id,
      initialData: { chatId },
      message: {
        kind: 'signal',
        type: 'whappr.message.received',
        body: event.data.text ?? '',
        attributes: { messageId: event.data.id, kind: event.data.kind },
      },
    });
  },
});
```

Your agent then replies with [`@whappr/client`](https://github.com/whappr/whappr/tree/main/packages/client),
for example `client.chats.whileTyping(chatId, ...)` around `client.messages.send(...)`.

## Contributing

Pull requests are welcome.

## License

MIT © [Alexandru Bau](https://github.com/alexandrubau) and Whappr contributors.
