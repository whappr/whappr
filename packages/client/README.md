# @whappr/client

Typed HTTP client for the [Whappr gateway](../../apps/gateway) API.

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

Node-only (uses `node:crypto` to sign requests) — run it server-side, never ship the secret to a
browser.

### API

- `client.health()`
- `client.session.getStatus()` / `client.session.logout()`
- `client.messages.send({ to, text })`
- `client.messages.edit(messageId, { text })`
- `client.messages.delete(messageId)`
- `client.messages.react(messageId, { emoji })` / `client.messages.removeReaction(messageId)`
- `client.messages.reply(messageId, { text })`

### Errors

Every failure is a `WhapprClientError`: `WhapprApiError` (non-2xx, has `.status`/`.code`),
`WhapprNetworkError`, `WhapprTimeoutError`, `WhapprInvalidResponseError`.

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

Pull requests accepted.

## License

MIT © [Alexandru Bau](https://github.com/alexandrubau) and Whappr contributors
