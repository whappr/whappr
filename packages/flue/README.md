# @whappr/flue

[![CI](https://img.shields.io/github/actions/workflow/status/whappr/whappr/ci.yml?branch=main&style=for-the-badge&logo=githubactions&logoColor=white&label=CI)](https://github.com/whappr/whappr/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@whappr/flue?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@whappr/flue)
[![npm downloads](https://img.shields.io/npm/dy/@whappr/flue?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@whappr/flue)
[![Last commit](https://img.shields.io/github/last-commit/whappr/whappr/main?style=for-the-badge&logo=github&logoColor=white&color=181717)](https://github.com/whappr/whappr/commits/main)

Official [Whappr](https://github.com/whappr/whappr) channel for [Flue](https://flueframework.com). Web API-compatible, deployable on edge runtimes.

## Install

```sh
npm install @whappr/flue @flue/runtime hono
```

## Usage

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

### Options

`createWhapprChannel(options)` accepts:

| Option | Description |
|---|---|
| `secret` | Required. Shared secret configured on the gateway as `WHAPPR_SECRET`. Used to verify the webhook signature. |
| `events` | Required. Callback invoked with each verified batch of webhook events: `({ c, events }) => void \| JsonValue \| Response`. |
| `bodyLimit` | Maximum accepted request body size in bytes (default `1_048_576`, i.e. 1 MiB). |
| `maxSignatureAgeSeconds` | Maximum age of a signed request before it's rejected as stale (default `300`). |

### API

**`createWhapprChannel(options)`** — Verifies the gateway's webhook signature before `events({ c, events })` runs — see [Options](#options).

**`channel.route()`** — Mountable Hono sub-app (`POST /webhook`).

**`channel.instanceId({ chatId })`** — Canonical agent-instance id: `whappr:v1:chat:<chatId>`.

**`channel.parseInstanceId(id)`** — Inverse of `instanceId()`.

Ingress-only: this package verifies inbound webhooks and hands you the event batch. Sending
replies means calling [`@whappr/client`](https://github.com/whappr/whappr/tree/main/packages/client) directly from your own agent/tool code.

### Errors

Every failure extends `WhapprChannelError`, so one `catch` handles them all — or narrow to a specific subclass:

- `WhapprInvalidInputError` — bad input to `createWhapprChannel()` or `instanceId()`; check `.field` for which option/argument failed
- `WhapprInvalidInstanceIdError` — `parseInstanceId()` was given a non-canonical id

```ts
import { WhapprChannelError, WhapprInvalidInputError } from '@whappr/flue';

try {
  const channel = createWhapprChannel({ secret: process.env.WHAPPR_SECRET!, events });
} catch (error) {
  if (error instanceof WhapprInvalidInputError) {
    // error.field tells you which option was invalid
  } else if (error instanceof WhapprChannelError) {
    // any other channel error
  } else {
    throw error;
  }
}
```

### Wiring into a Flue app

```ts
// channels/whappr.ts
import { createWhapprChannel } from '@whappr/flue';
import { dispatch } from '@flue/runtime';
import { Assistant } from '../agents/assistant.ts';

export const channel = createWhapprChannel({
  secret: process.env.WHAPPR_SECRET!,
  async events({ events }) {
    for (const event of events) {
      const id = channel.instanceId({ chatId: event.data.from });

      // Plain messages dispatch as a generic signal.
      if (event.type === 'msg.received') {
        await dispatch(Assistant, {
          id,
          initialData: { chatId: event.data.from },
          message: {
            kind: 'signal',
            type: 'whappr.message.received',
            body: event.data.body,
            attributes: { messageId: event.data.id },
          },
        });
        continue;
      }

      // Commands get their own signal type so the agent can route them to dedicated
      // handlers — @whappr/flue stays agnostic to what a "command" is.
      if (event.type === 'cmd.invoked') {
        await dispatch(Assistant, {
          id,
          initialData: { chatId: event.data.from },
          message: {
            kind: 'signal',
            type: 'whappr.command.invoked',
            body: event.data.args.join(' '),
            attributes: {
              command: event.data.command,
              args: event.data.args,
              messageId: event.data.id,
            },
          },
        });
        continue;
      }
    }
  },
});
```

Replies are sent from your own agent/tool code via [`@whappr/client`](https://github.com/whappr/whappr/tree/main/packages/client), as noted above.

## Contributing

Pull requests are welcomed.

## License

MIT © [Alexandru Bau](https://github.com/alexandrubau) and Whappr contributors.
