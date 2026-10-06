# @whappr/client

[![CI](https://img.shields.io/github/actions/workflow/status/whappr/whappr/ci.yml?branch=main&style=for-the-badge&logo=githubactions&logoColor=white&label=CI)](https://github.com/whappr/whappr/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@whappr/client?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@whappr/client)
[![npm downloads](https://img.shields.io/npm/dw/@whappr/client?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@whappr/client)
[![Last commit](https://img.shields.io/github/last-commit/whappr/whappr/main?style=for-the-badge&logo=github&logoColor=white&color=181717)](https://github.com/whappr/whappr/commits/main)

Typed client for the Whappr WhatsApp gateway.

Lets your AI agent send WhatsApp messages, media, reactions and typing indicators. Built on Web APIs only,
so it runs on Node and edge runtimes.

Requires a running [Whappr Gateway](https://github.com/whappr/whappr/tree/main/apps/gateway).

## Install

```sh
npm install @whappr/client
```

## Usage

```ts
import { createWhapprClient } from '@whappr/client';

const client = createWhapprClient({
  baseUrl: 'https://gateway.example.com',
  secret: process.env.SECRET_KEY!,
});

await client.messages.send({ to: '1555123456', text: 'Hello from Whappr!' });
```

In an agent, reply to the message you received, with "typing…" showing while your agent works:

```ts
await client.chats.whileTyping(chatId, async () => {
  const reply = await agent.generateReply(event.data); // may take longer than 25s
  return client.messages.send({ to: chatId, text: reply, replyTo: event.data.id });
});
```

Voice notes arrive as `kind: 'voice'`. Download them to transcribe:

```ts
if (event.type === 'message.received' && event.data.kind === 'voice') {
  const audio = await client.messages.media.download(event.data.id);
  const form = new FormData();
  form.append('file', audio, 'voice.ogg'); // e.g. for a speech-to-text API
}
```

## Options

`createWhapprClient(options)` accepts:

| Option | Description |
|---|---|
| `baseUrl` | Required. Base URL of the gateway, e.g. `"https://gateway.example.com"`. |
| `secret` | Required. Shared secret configured on the gateway as `SECRET_KEY`, sent as a bearer token. |
| `fetch` | Override the `fetch` implementation used for requests, useful for testing or environments without a global `fetch` (default: global `fetch`). |
| `timeoutMs` | Per-request timeout in milliseconds. Requests that exceed this throw `WhapprTimeoutError` (default `10000`). |

```ts
const client = createWhapprClient({
  baseUrl: 'https://gateway.example.com',
  secret: process.env.SECRET_KEY!,
  timeoutMs: 5_000,
  fetch: customFetch, // e.g. undici's fetch, or a mock for tests
});
```

## API

Every method returns a `Promise` that rejects with a `WhapprClientError` on failure. See [Errors](#errors).

Methods that return a message return the same normalized `Message` that webhook events carry. Every type of
the [wire contract](https://github.com/whappr/whappr/tree/main/packages/protocol) (`Message`,
`SendMessageRequest`, `SessionState`, ...) is re-exported from this package.

### Health

**`client.health()`** — Unauthenticated liveness check. Resolves with `{ ok, version, session, webhook }` if
the gateway is up, throws otherwise, including a `WhapprApiError` with status `503` once the session is `failed`. `webhook` is the most recent delivery since the gateway started (`{ at, ok, status? }`), or
`null` before the first, so you can tell whether your receiver is getting events:

```ts
const { version, webhook } = await client.health();
if (webhook && !webhook.ok) console.warn(`webhook failing: ${webhook.status ?? 'no response'}`);
```

### Session

**`client.session.status()`** — Reads the current WhatsApp session state (`starting`, `awaiting_scan`,
`ready`, `failed` or `disconnected`), including the pairing QR code while awaiting a scan and the paired
account (`id`, `phone`, `name`) once ready.

**`client.session.logout()`** — Unpairs the account. The gateway then restarts and shows a new QR code.

### Messages

Every `messages.*` call requires the session to be `ready`. Otherwise the gateway rejects it with the
`NOT_READY` error code.

**`client.messages.send({ to, text?, media?, replyTo? }, options?)`** — Sends a message to a chat id or a
phone number (international format, e.g. `"1555123456"`). Set `replyTo` to a message id to send it as a
reply. Throws `RECIPIENT_NOT_FOUND` if the number isn't on WhatsApp.

`media` sends a file, by `url` (fetched by the gateway) or as base64 `data` with a `mimeType`; `text`
becomes its caption. It's sent as what its MIME type implies unless you set `as`: `voice` for a voice note,
`document` for an attachment. See the
[gateway README](https://github.com/whappr/whappr/tree/main/apps/gateway#sending-media) for every field
and the `MEDIA_*` errors.

```ts
await client.messages.send({ to, text: 'Your invoice', media: { url: 'https://example.com/invoice.pdf' } });
await client.messages.send({ to, media: { data: base64Audio, mimeType: 'audio/ogg; codecs=opus', as: 'voice' } });
```

Large files can take longer than the client's `timeoutMs`; pass `{ timeoutMs }` as `options` to extend it
for one call. A timeout means the gateway didn't answer in time, not that the message wasn't sent. Check
before retrying, or you may send it twice.

**`client.messages.edit(messageId, { text })`** — Edits the text of a message you previously sent. Throws
`EDIT_NOT_ALLOWED` if WhatsApp no longer permits editing it (e.g. too old).

**`client.messages.delete(messageId)`** — Deletes a message for everyone.

**`client.messages.media.download(messageId, options?)`** — Downloads a message's file as a `Blob`
(`blob.type` is its MIME type; the file name, if any, is in the event's `media.fileName`). Throws
`MEDIA_NOT_FOUND`, `MEDIA_UNAVAILABLE` (WhatsApp no longer serves it) or `MEDIA_TOO_LARGE` (over the
gateway's `MEDIA_MAX_SIZE`).

**`client.messages.react(messageId, { emoji })`** — Sets, or replaces, your reaction on a message.

**`client.messages.unreact(messageId)`** — Removes your reaction from a message.

### Chats

Every `chats.*` call accepts a chat id or a phone number, and throws `CHAT_NOT_FOUND` for a chat that
doesn't exist.

**`client.chats.startTyping(chatId)`** / **`client.chats.stopTyping(chatId)`** — Shows or clears
"typing…" in a chat. WhatsApp clears it by itself after about 25 seconds or when you send a message.

**`client.chats.whileTyping(chatId, task)`** — Shows "typing…" for as long as `task` runs, refreshing it
before it expires, and clears it afterwards. Returns whatever `task` returns. Best-effort: a failure to show
the indicator never fails `task`.

**`client.chats.markAsRead(chatId)`** — Marks the chat's messages as read (blue ticks).

## Errors

Every failure extends `WhapprClientError`, so one `catch` handles them all. You can also narrow to a
specific subclass:

- `WhapprApiError` — the gateway returned an error response; check `.status` and `.code` (e.g. `NOT_READY`)
- `WhapprNetworkError` — the request couldn't reach the gateway
- `WhapprTimeoutError` — the request timed out
- `WhapprParseError` — the gateway returned a malformed response

```ts
import { WhapprApiError, WhapprClientError } from '@whappr/client';

try {
  await client.messages.send({ to: '1555123456', text: 'Hi' });
} catch (error) {
  if (error instanceof WhapprApiError && error.code === 'NOT_READY') {
    // session isn't connected yet, poll client.session.status()
  } else if (error instanceof WhapprClientError) {
    // any other client/network/timeout failure
  } else {
    throw error;
  }
}
```

The full list of error codes is in the
[gateway README](https://github.com/whappr/whappr/tree/main/apps/gateway#errors).

## Contributing

Pull requests are welcome.

## License

MIT © [Alexandru Bau](https://github.com/alexandrubau) and Whappr contributors.
