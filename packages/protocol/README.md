# @whappr/protocol

[![CI](https://img.shields.io/github/actions/workflow/status/whappr/whappr/ci.yml?branch=main&style=for-the-badge&logo=githubactions&logoColor=white&label=CI)](https://github.com/whappr/whappr/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@whappr/protocol?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@whappr/protocol)
[![npm downloads](https://img.shields.io/npm/dw/@whappr/protocol?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@whappr/protocol)
[![Last commit](https://img.shields.io/github/last-commit/whappr/whappr/main?style=for-the-badge&logo=github&logoColor=white&color=181717)](https://github.com/whappr/whappr/commits/main)

Shared types and webhook signing for Whappr.

The wire contract of the [Whappr Gateway](https://github.com/whappr/whappr/tree/main/apps/gateway):
TypeScript types for every webhook event and every API request and response, plus the webhook signing
helpers shared by the gateway and its clients. No dependencies; runs on Node, browsers and edge runtimes.

[`@whappr/client`](https://github.com/whappr/whappr/tree/main/packages/client) and
[`@whappr/flue`](https://github.com/whappr/whappr/tree/main/packages/flue) re-export all of its types. You
only need to install it directly to verify webhooks yourself (`verifyWebhook`) or to use the event list at
runtime (`WHAPPR_EVENT_TYPES`).

## Install

```sh
npm install @whappr/protocol
```

## Usage

```ts
import type { AnyWhapprEvent } from '@whappr/protocol';

function describe(event: AnyWhapprEvent): string {
  if (event.type === 'message.received' && event.data.kind === 'voice') {
    return `voice note, ${event.data.media.duration ?? '?'}s, in ${event.data.chat.id}`;
  }
  return event.type;
}
```

Verify a webhook against the exact raw body you received:

```ts
import { verifyWebhook, WHAPPR_SIGNATURE_HEADER, WHAPPR_TIMESTAMP_HEADER } from '@whappr/protocol';

const valid = await verifyWebhook(
  process.env.SECRET_KEY!,
  request.headers.get(WHAPPR_TIMESTAMP_HEADER) ?? '',
  rawBody,
  request.headers.get(WHAPPR_SIGNATURE_HEADER) ?? '',
);
```

## API

- **Messages** — `Message`, a union narrowed on `kind` (`text`, `image`, `video`, `audio`, `voice`,
  `document`, `sticker`, `location`, `contact`, `unsupported`), plus `Chat`, `Participant`, `MediaInfo` and
  `ReplyContext`.
- **Events** — `AnyWhapprEvent`, the union of every webhook event (`message.received`, `message.edited`,
  `message.deleted`, `reaction.added`, `reaction.removed`), `WHAPPR_EVENT_TYPES` listing them, and
  `WebhookPayload`, the body of one delivery (a single event).
- **API** — request/response bodies (`SendMessageRequest`, `MessageResponse`, `SessionState`, ...) and
  `ErrorResponse` with its `ErrorCode`s.
- **Webhook signatures** — `signWebhook()` and `verifyWebhook()` (HMAC-SHA256 over `${timestamp}.${body}`,
  via Web Crypto; signatures older than 5 minutes are rejected by default), and the
  `WHAPPR_TIMESTAMP_HEADER` / `WHAPPR_SIGNATURE_HEADER` names.

## Conventions

- Ids are opaque strings: store them and pass them back as-is.
- Timestamps are ISO 8601.
- Every event's `data` carries the conversation as `chat`.

## Contributing

Pull requests are welcome.

## License

MIT © [Alexandru Bau](https://github.com/alexandrubau) and Whappr contributors.
