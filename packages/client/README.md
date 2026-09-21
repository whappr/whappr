# @whappr/client

Typed HTTP client for the [Whappr gateway](../../apps/gateway) API.

## Install

```sh
npm install @whappr/client
```

## Quick start

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

`baseUrl` is the gateway's address; `secret` must match the gateway's `WHAPPR_SECRET`. The client
is Node-only (uses `node:crypto` to sign requests) and is meant to run server-side — never ship
the secret to a browser.

## API

- `client.health()` — liveness check. Resolves if the gateway is reachable, throws otherwise.
- `client.session.getStatus()` — current connection status and, while `AWAITING_SCAN`, a QR code
  data URL.
- `client.session.logout()` — ends the WhatsApp session. The configured secret is sent
  automatically; there's nothing to pass.
- `client.messages.send({ to, text })` — send a message. `to` accepts a bare phone number or a
  full WhatsApp JID.
- `client.messages.edit(messageId, { text })`
- `client.messages.delete(messageId)` — deletes for everyone.
- `client.messages.react(messageId, { emoji })`
- `client.messages.removeReaction(messageId)`
- `client.messages.reply(messageId, { text })`

## Errors

Every failure is a `WhapprClientError`. Catch that base class to handle any failure the same way,
or catch one of its subclasses to handle a specific one:

- `WhapprApiError` — the gateway responded with a non-2xx status. Has `.status` (HTTP status) and
  `.code` (the gateway's error code, e.g. `NOT_READY`, `INVALID_SIGNATURE`, `MESSAGE_NOT_FOUND`),
  when the response provided one.
- `WhapprNetworkError` — the request never reached the gateway.
- `WhapprTimeoutError` — the request was aborted after `timeoutMs` (default 10s) with no response.
- `WhapprInvalidResponseError` — the gateway returned a 2xx response the client couldn't parse.

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

These types describe the client's own contract, not the gateway's internals — the client talks
HTTP today, but that's an implementation detail callers shouldn't need to know about.
