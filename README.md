# Whappr

Monorepo for the Whappr WhatsApp integration stack — an npm workspaces setup with independently
versioned, independently built packages.

## Install

```sh
npm install
```

Requires Node.js 24+. Installs dependencies for every workspace into a single root `node_modules`.

## Usage

### Apps

- [`@whappr/gateway`](https://github.com/whappr/whappr/tree/main/apps/gateway) — lightweight WhatsApp gateway. Wraps whatsapp-web.js behind a
  small HTTP API so other systems can send and receive WhatsApp messages, without touching
  WhatsApp Web automation directly.

### Packages

- [`@whappr/client`](https://github.com/whappr/whappr/tree/main/packages/client) — typed HTTP client for the gateway API.
- [`@whappr/flue`](https://github.com/whappr/whappr/tree/main/packages/flue) — verified gateway webhook ingress for Flue applications.

Each one's own README has full install/usage details and API reference.

## Contributing

Pull requests accepted.

## License

MIT © [Alexandru Bau](https://github.com/alexandrubau) and Whappr contributors.
