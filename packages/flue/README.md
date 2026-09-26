# @whappr/flue

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

### API

- `createWhapprChannel({ secret, bodyLimit?, maxSignatureAgeSeconds?, events })` — verifies the
  gateway's webhook signature before `events({ c, events })` runs.
- `channel.route()` — mountable Hono sub-app (`POST /webhook`).
- `channel.instanceId({ chatId })` — canonical agent-instance id: `whappr:v1:chat:<chatId>`.
- `channel.parseInstanceId(id)` — inverse of `instanceId()`.

Ingress-only: this package verifies inbound webhooks and hands you the event batch. Sending
replies means calling [`@whappr/client`](../client) directly from your own agent/tool code.

### Errors

Both extend `WhapprChannelError`: `WhapprInvalidInputError` (bad input to `createWhapprChannel()`
or `instanceId()`) and `WhapprInvalidInstanceIdError` (`parseInstanceId()` given a non-canonical
id).

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

      if (event.type !== 'msg.received') continue;
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
    }
  },
});
```

Giving `cmd.invoked` its own signal type (rather than folding it into
`whappr.message.received`) lets your agent's own routing dispatch to dedicated command handlers,
the same way you'd wire up per-command logic in a Telegram-style bot framework — `@whappr/flue`
itself stays agnostic to what a "command" is; that decision lives entirely in your `events()`
callback.

Replies are sent from your own agent/tool code via [`@whappr/client`](../client) — this package
never calls WhatsApp back itself.

## Contributing

Pull requests are welcomed.

## License

MIT © [Alexandru Bau](https://github.com/alexandrubau) and Whappr contributors.
