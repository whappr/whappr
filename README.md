# Whappr

![Whappr banner](.github/assets/banner.jpeg)

[![CI](https://img.shields.io/github/actions/workflow/status/whappr/whappr/ci.yml?branch=main&style=for-the-badge&logo=githubactions&logoColor=white&label=CI)](https://github.com/whappr/whappr/actions/workflows/ci.yml)
[![Docker image version](https://img.shields.io/github/package-json/v/whappr/whappr?filename=apps%2Fgateway%2Fpackage.json&style=for-the-badge&logo=docker&logoColor=white&color=2496ED&label=version)](https://github.com/whappr/whappr/pkgs/container/whappr-gateway)
[![Last commit](https://img.shields.io/github/last-commit/whappr/whappr/main?style=for-the-badge&logo=github&logoColor=white&color=181717)](https://github.com/whappr/whappr/commits/main)

Lightweight WhatsApp gateway. Built on [whatsapp-web.js](https://wwebjs.dev/) and
[Hono](https://hono.dev/), shipped as a Docker image.

Talk to it with [`@whappr/client`](https://github.com/whappr/whappr/tree/main/packages/client) or ingest its webhooks
with [`@whappr/flue`](https://github.com/whappr/whappr/tree/main/packages/flue) for Flue apps.

## Features

- **Simple, few dependencies** — a thin Hono API in front of whatsapp-web.js, no extra framework.
- **No database** — messages pass straight through to your webhook and aren't stored anywhere.
- **Signed end-to-end** — inbound webhooks and outbound API calls are both HMAC-signed.
- **Fine-grained event filtering** — `WHAPPR_EVENTS` controls which events reach your webhook.
- **Built-in bot commands** — `WHAPPR_COMMANDS` recognizes `/command` messages as commands.

## Install

The gateway ships as a Docker image published to `ghcr.io/whappr/whappr-gateway` — tagged `latest`
and per-release (e.g. `1.0.0`). Set at least `WHAPPR_SECRET` and `WHAPPR_WEBHOOK_URL`, then run it
either way:

### Using `docker run`

```sh
docker run -p 3000:3000 \
  -e WHAPPR_SECRET=your-shared-secret \
  -e WHAPPR_WEBHOOK_URL=https://example.com/webhook \
  -v wweb-session:/whappr/apps/gateway/.wwebjs_auth \
  ghcr.io/whappr/whappr-gateway:latest
```

### Using Docker Compose

```yaml
# docker-compose.yml
services:
  gateway:
    image: ghcr.io/whappr/whappr-gateway:latest
    environment:
      WHAPPR_SECRET: your-shared-secret
      WHAPPR_WEBHOOK_URL: https://example.com/webhook
    ports:
      - "3000:3000"
    volumes:
      - wweb-session:/whappr/apps/gateway/.wwebjs_auth
    restart: unless-stopped

volumes:
  wweb-session:
```

```sh
docker compose up
```

Either way, the `wweb-session` volume persists the paired WhatsApp session across restarts, so
you don't have to re-scan the QR code every time.

## Usage

Open `http://localhost:3000` and scan the QR code with WhatsApp on your phone
(*Linked devices → Link a device*). Once paired, inbound text messages are POSTed to
`WHAPPR_WEBHOOK_URL`, and you can send messages back through the API:

```sh
SECRET=your-secret
BODY='{"to":"1555123456","text":"hello"}'
TS=$(date +%s)
SIG="sha256=$(printf '%s' "$TS.$BODY" | openssl dgst -sha256 -hmac "$SECRET" | cut -d' ' -f2)"

curl -X POST http://localhost:3000/api/messages \
  -H "Content-Type: application/json" \
  -H "X-Whappr-Timestamp: $TS" \
  -H "X-Whappr-Signature: $SIG" \
  -d "$BODY"
```

Full environment variable reference, API endpoints, session states, error codes, webhook event
filtering and bot commands are documented in the
[gateway README](https://github.com/whappr/whappr/tree/main/apps/gateway#readme).

## Ecosystem

- [`@whappr/client`](https://github.com/whappr/whappr/tree/main/packages/client) — typed HTTP client for the gateway API. Talk to your gateway from any
  Web API-compatible runtime, including edge.
- [`@whappr/flue`](https://github.com/whappr/whappr/tree/main/packages/flue) — verified webhook ingress for [Flue](https://flueframework.com) apps. Turns
  gateway events into signals for your Flue agents.

## Contributing

Pull requests are welcomed.

## License

MIT © [Alexandru Bau](https://github.com/alexandrubau) and Whappr contributors.
