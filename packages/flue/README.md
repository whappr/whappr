# @whappr/flue

[![CI](https://img.shields.io/github/actions/workflow/status/whappr/whappr/ci.yml?branch=main&style=for-the-badge&logo=githubactions&logoColor=white&label=CI)](https://github.com/whappr/whappr/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@whappr/flue?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@whappr/flue)
[![npm downloads](https://img.shields.io/npm/dw/@whappr/flue?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@whappr/flue)
[![Last commit](https://img.shields.io/github/last-commit/whappr/whappr/main?style=for-the-badge&logo=github&logoColor=white&color=181717)](https://github.com/whappr/whappr/commits/main)

Flue channel for the Whappr WhatsApp gateway.

> Whappr is under active development. Until v1 is released, any update may include breaking changes. It is
> recommended to pin exact versions.

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
code. See the next section.

## Wiring into a Flue app

Each chat gets its own agent instance. The channel dispatches each message as a signal carrying its sender,
and the agent replies through a tool bound to its chat. Install the client and Valibot first:

```sh
npm install @whappr/client valibot
```

```ts
// channels/whappr.ts
import { defineTool, dispatch } from '@flue/runtime';
import { createWhapprClient } from '@whappr/client';
import { createWhapprChannel } from '@whappr/flue';
import * as v from 'valibot';
import { Assistant } from '../agents/assistant.ts';

export const client = createWhapprClient({
  baseUrl: process.env.WHAPPR_GATEWAY_URL!,
  secret: process.env.SECRET_KEY!,
});

export const channel = createWhapprChannel({
  secret: process.env.SECRET_KEY!,
  async event({ event }) {
    if (event.type !== 'message.received') return;

    // Every event carries its conversation as `data.chat`, whatever its type.
    const { chat, sender } = event.data;

    // In a group the sender is the only way the model can tell who said what.
    // `name` is the sender's own display name, absent when WhatsApp doesn't provide one.
    const attributes: Record<string, string> = {
      messageId: event.data.id,
      kind: event.data.kind,
      senderId: sender.id,
      ...(sender.name ? { senderName: sender.name } : {}),
    };

    // Commands get their own signal type so the agent can route them to dedicated handlers.
    // e.g. "/subscribe daily digest" → command "subscribe", body "daily digest"
    const [command, ...args] =
      event.data.kind === 'text' && event.data.text.startsWith('/')
        ? event.data.text.slice(1).trim().split(/\s+/)
        : [];

    await dispatch(Assistant, {
      id: channel.instanceId(chat.id),
      initialData: { chatId: chat.id, chatType: chat.type },
      message: command
        ? {
            kind: 'signal',
            type: 'whappr.command.invoked',
            body: args.join(' '),
            attributes: { ...attributes, command },
          }
        : // `text` is the body or a media caption.
          { kind: 'signal', type: 'whappr.message.received', body: event.data.text ?? '', attributes },
    });
  },
});

// The model picks the text. The chat comes from trusted code, so the model can't send anywhere else.
export function replyInChat(ref: { chatId: string; messageId?: string }) {
  return defineTool({
    name: 'send_whatsapp_message',
    description:
      'Send a WhatsApp message to the chat this conversation belongs to. Set `quote` to reply to ' +
      'the latest message, which makes clear who you are answering in a group.',
    input: v.object({
      text: v.pipe(v.string(), v.minLength(1)),
      quote: v.optional(v.boolean()),
    }),
    async run({ data }) {
      const message = await client.messages.send({
        to: ref.chatId,
        text: data.text,
        replyTo: data.quote ? ref.messageId : undefined,
      });
      return { output: { messageId: message.id } };
    },
  });
}
```

```ts
// agents/assistant.ts
'use agent';
import { useDelivery, useInitialData, useModel, useTool } from '@flue/runtime';
import * as v from 'valibot';
import { replyInChat } from '../channels/whappr.ts';

export function Assistant() {
  useModel('anthropic/claude-sonnet-4-6');

  const { chatId, chatType } = useInitialData<v.InferOutput<typeof Assistant.initialData>>();
  const delivery = useDelivery();
  const messageId = delivery.kind === 'signal' ? delivery.attributes?.messageId : undefined;
  useTool(replyInChat({ chatId, messageId }));

  return chatType === 'group'
    ? 'You are one participant in a WhatsApp group. Each message carries its senderId and senderName. ' +
        'Reply with the send_whatsapp_message tool only when someone addresses you.'
    : 'You are chatting with one person on WhatsApp. Answer with the send_whatsapp_message tool.';
}

Assistant.initialData = v.object({
  chatId: v.string(),
  chatType: v.picklist(['direct', 'group']),
});
```

Set `WHAPPR_GATEWAY_URL` to the gateway's base URL, e.g. `https://gateway.example.com`.

## Contributing

Pull requests are welcome.

## License

MIT © [Alexandru Bau](https://github.com/alexandrubau) and Whappr contributors.
