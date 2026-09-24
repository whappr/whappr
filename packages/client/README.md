# @whappr/client

[![npm version](https://img.shields.io/npm/v/@whappr/client)](https://www.npmjs.com/package/@whappr/client)
[![npm downloads](https://img.shields.io/npm/dy/@whappr/client)](https://www.npmjs.com/package/@whappr/client)
[![Last commit](https://img.shields.io/github/last-commit/whappr/whappr/main)](https://github.com/whappr/whappr/commits/main)

Client for [Whappr](https://github.com/whappr/whappr).

## Install

```sh
npm install @whappr/client
```

## Usage

```ts
import { createWhapprClient } from '@whappr/client';

const client = createWhapprClient({
  baseUrl: 'https://gateway.example.com',
  secret: process.env.WHAPPR_SECRET!,
});

const status = await client.session.getStatus();
if (status.status === 'READY') {
  const { id } = await client.messages.send({ to: '1555123456', text: 'Hello from Whappr!' });
  await client.messages.react(id, { emoji: '👍' });
}
```

Node-only (uses `node:crypto` to sign requests) — run it server-side, never ship the secret to a browser.

### API

Every method returns a `Promise` that rejects with a `WhapprClientError` on failure — see [Errors](#errors).

#### Health

**`client.health()`** — Unauthenticated liveness check. Resolves if the gateway is up, throws otherwise.

#### Session

**`client.session.getStatus()`** — Reads the current WhatsApp session state, including the pairing QR code while connecting. Unauthenticated.

**`client.session.logout()`** — Logs out and tears down the session. The configured `secret` is sent automatically.

#### Messages

Every `messages.*` call is HMAC-signed and requires the session to be `READY` — the gateway rejects it with a `NOT_READY` error code otherwise (see [Errors](#errors)).

**`client.messages.send({ to, text })`** — Sends a text message to a phone number or JID.

**`client.messages.edit(messageId, { text })`** — Edits the text of a message you previously sent. Throws `EDIT_NOT_ALLOWED` if WhatsApp no longer permits editing it (e.g. too old).

**`client.messages.delete(messageId)`** — Deletes a message for everyone.

**`client.messages.react(messageId, { emoji })`** — Sets an emoji reaction on a message.

**`client.messages.removeReaction(messageId)`** — Clears the reaction on a message.

**`client.messages.reply(messageId, { text })`** — Sends a text message as a reply to another message.

### Errors

Every failure extends `WhapprClientError`, so one `catch` handles them all — or narrow to a specific subclass:

- `WhapprApiError` — the gateway returned an error response; check `.status` and `.code` (e.g. `NOT_READY`)
- `WhapprNetworkError` — the request couldn't reach the gateway
- `WhapprTimeoutError` — the request timed out
- `WhapprInvalidResponseError` — the gateway returned a malformed response

```ts
import { WhapprApiError, WhapprClientError } from '@whappr/client';

try {
  await client.messages.send({ to: '1555123456', text: 'Hi' });
} catch (error) {
  if (error instanceof WhapprApiError && error.code === 'NOT_READY') {
    // session isn't connected yet — poll client.session.getStatus()
  } else if (error instanceof WhapprClientError) {
    // any other client/network/timeout failure
  } else {
    throw error;
  }
}
```

## Contributing

Pull requests are welcomed.

## License

MIT © [Alexandru Bau](https://github.com/alexandrubau) and Whappr contributors.
