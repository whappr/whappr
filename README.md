# Whappr

![Whappr banner](.github/assets/banner.jpeg)

[![CI](https://img.shields.io/github/actions/workflow/status/whappr/whappr/ci.yml?branch=main&style=for-the-badge&logo=githubactions&logoColor=white&label=CI)](https://github.com/whappr/whappr/actions/workflows/ci.yml)
[![Docker image version](https://img.shields.io/github/package-json/v/whappr/whappr?filename=apps%2Fgateway%2Fpackage.json&style=for-the-badge&logo=docker&logoColor=white&color=2496ED&label=version)](https://github.com/whappr/whappr/pkgs/container/whappr-gateway)
[![Last commit](https://img.shields.io/github/last-commit/whappr/whappr/main?style=for-the-badge&logo=github&logoColor=white&color=181717)](https://github.com/whappr/whappr/commits/main)

WhatsApp gateway for AI agents.

Give your agent a WhatsApp number. The [Whappr Gateway](https://github.com/whappr/whappr/tree/main/apps/gateway)
is a self-hosted Docker container that links to your WhatsApp account. It sends every incoming message to your
agent as a signed webhook, and your agent replies through a small REST API.

## Why Whappr

- **Built for agents** — one webhook per event, delivered in order. Every event carries its `chat.id`, so
  each conversation can go to its own agent instance.
- **Agent UX included** — show "typing…" while your agent thinks, mark messages as read, quote the message
  you're answering, and send or receive voice notes.
- **No database** — messages pass straight through and aren't stored anywhere. Your agent owns its memory.
- **Secure by default** — the API takes a bearer token, and every webhook is HMAC-signed.
- **Small and self-hosted** — one Docker image: a thin [Hono](https://hono.dev/) API in front of
  [whatsapp-web.js](https://wwebjs.dev/).

## Quickstart

**1. Run the gateway.** Point `WEBHOOK_URL` at your agent's endpoint:

```sh
docker run -p 3000:3000 \
  -e SECRET_KEY=$(openssl rand -hex 32) \
  -e WEBHOOK_URL=https://example.com/webhook \
  -v whappr-data:/whappr/apps/gateway/data \
  ghcr.io/whappr/whappr-gateway:latest
```

The `whappr-data` volume keeps the paired session, so you only scan the QR code once.

**2. Pair your WhatsApp account.** Open `http://localhost:3000`, enter your `SECRET_KEY`, and scan the QR
code with WhatsApp on your phone (*Linked devices → Link a device*).

**3. Receive and reply.** Incoming messages are now sent to `WEBHOOK_URL`. Reply through the API:

```sh
curl -X POST http://localhost:3000/api/messages \
  -H "Authorization: Bearer <SECRET_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"to":"1555123456","text":"hello"}'
```

Docker Compose, every environment variable, the full API, webhook events and error codes are documented in
the [Gateway README](https://github.com/whappr/whappr/tree/main/apps/gateway#readme).

## Build an agent

A minimal agent in TypeScript using [`@whappr/client`](https://github.com/whappr/whappr/tree/main/packages/client)
and [`@whappr/protocol`](https://github.com/whappr/whappr/tree/main/packages/protocol). It verifies the
webhook, acknowledges it right away, then answers while showing "typing…":

```ts
import { createWhapprClient, type Message, type WebhookPayload } from '@whappr/client';
import { verifyWebhook, WHAPPR_SIGNATURE_HEADER, WHAPPR_TIMESTAMP_HEADER } from '@whappr/protocol';

const secret = process.env.SECRET_KEY!;
const whappr = createWhapprClient({ baseUrl: 'http://localhost:3000', secret });

// Serve this at your WEBHOOK_URL, with any Web-standard server (Hono, Bun, Deno, ...).
export async function webhook(request: Request): Promise<Response> {
  const body = await request.text();
  const valid = await verifyWebhook(
    secret,
    request.headers.get(WHAPPR_TIMESTAMP_HEADER) ?? '',
    body,
    request.headers.get(WHAPPR_SIGNATURE_HEADER) ?? '',
  );
  if (!valid) return new Response(null, { status: 401 });

  const event: WebhookPayload = JSON.parse(body);
  if (event.type === 'message.received') {
    // Don't make the gateway wait for your agent: it gives each webhook 5 seconds.
    reply(event.data).catch(console.error);
  }
  return new Response(null, { status: 204 });
}

async function reply(message: Message) {
  const chatId = message.chat.id;
  await whappr.chats.whileTyping(chatId, async () => {
    const text = await myAgent.run(message.text ?? ''); // your LLM / agent call
    await whappr.messages.send({ to: chatId, text, replyTo: message.id });
  });
}
```

Building with [Flue](https://flueframework.com)? [`@whappr/flue`](https://github.com/whappr/whappr/tree/main/packages/flue)
verifies webhooks for you and dispatches them to your Flue agents.

## Scope

Whappr is not a full WhatsApp Web API. It exposes what a conversational agent needs:

- **Supported** — direct and group chats; text, media, voice notes, locations and contacts in; text and
  media out; replies, edits, deletes, reactions, typing indicator, read receipts and media downloads.
- **Out of scope** — status updates, channels, broadcast lists, group and contact administration, polls,
  payments and calls. Message types the gateway doesn't model still arrive as `unsupported` instead of
  being dropped.

## Packages

| Package | What it's for |
|---|---|
| [`@whappr/gateway`](https://github.com/whappr/whappr/tree/main/apps/gateway) | The gateway itself, shipped as a Docker image. |
| [`@whappr/client`](https://github.com/whappr/whappr/tree/main/packages/client) | Typed client for the gateway API. Runs on Node and edge runtimes. |
| [`@whappr/flue`](https://github.com/whappr/whappr/tree/main/packages/flue) | Connects your [Flue](https://flueframework.com) agents to WhatsApp. |
| [`@whappr/protocol`](https://github.com/whappr/whappr/tree/main/packages/protocol) | Shared types and webhook signing, used by all of the above. |

## Contributing

Pull requests are welcome. To run the gateway from source, see
[Development](https://github.com/whappr/whappr/tree/main/apps/gateway#development).

## License

MIT © [Alexandru Bau](https://github.com/alexandrubau) and Whappr contributors.
