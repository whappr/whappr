# whappr

Monorepo for the Whappr WhatsApp integration stack — an npm workspaces setup with independently
versioned, independently built packages.

`apps/` holds deployables (their own build/release lifecycle, not published to npm); `packages/`
holds publishable libraries.

## Apps

| App | Path | Description |
|---|---|---|
| [`@whappr/gateway`](apps/gateway) | `apps/gateway` | The WhatsApp gateway service. Built on whatsapp-web.js, ships as a Docker image. Not published to npm. |

## Packages

| Package | Path | Description |
|---|---|---|
| [`@whappr/client`](packages/client) | `packages/client` | Typed HTTP client for the gateway API. |
| [`@whappr/flue`](packages/flue) | `packages/flue` | Flue Framework channel for the gateway. |

Each is a standalone leaf today — none import from one another yet. See each one's own README for
details.

## Requirements

- Node.js 24+

## Getting started

```sh
npm install
```

Installs dependencies for every workspace into a single root `node_modules`.

To work on the gateway service specifically, see [apps/gateway/README.md](apps/gateway/README.md).

## Root scripts

| Script | Description |
|---|---|
| `npm run build` | Builds every package (`npm run build` in each workspace). |
| `npm run typecheck` | Type-checks the whole repo against the root `tsconfig.json` (no emit). |
| `npm run check` | Biome lint + format + import sort (check only). |
| `npm run check:fix` | Biome lint + format + import sort, writes changes. |

Per-package scripts (`dev`, `start`, etc.) are run from within that package, e.g.
`npm run dev -w apps/gateway`.

## Shared configuration

- `tsconfig.json` — base compiler options, `noEmit: true`. Used by editors/tsserver and by
  `npm run typecheck`.
- `tsconfig.build.json` — extends the base config and turns emit on. Each package's own
  `tsconfig.build.json` extends this and only overrides `rootDir`/`outDir`/`include`.
- `biome.json` — single lint/format config for the whole `apps/**` and `packages/**` tree. No
  per-package linter config.

## Versioning and releases

Each package is versioned and released independently via [Changesets](https://github.com/changesets/changesets) —
there's no monorepo-wide version number.

```sh
npm run changeset:generate   # record a change
npm run changeset:apply      # bump versions + changelogs from recorded changes
npm run changeset:publish    # publish changed, non-private packages
```

`@whappr/gateway` is `"private": true` and is skipped by `changeset publish` — it ships as a Docker
image, not an npm package.
