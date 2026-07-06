<p align="center">
  <img src="./assets/localghost-banner.png" alt="Localghost - Friendly local hostnames" width="960">
</p>

# @hamedb89/localghost

Buh. Friendly local hostnames for app repos.

[![CI](https://github.com/hamedb89/localghost/actions/workflows/ci.yml/badge.svg)](https://github.com/hamedb89/localghost/actions/workflows/ci.yml)
[![GitHub Pages](https://github.com/hamedb89/localghost/actions/workflows/pages.yml/badge.svg)](https://github.com/hamedb89/localghost/actions/workflows/pages.yml)
[![Publish npm](https://github.com/hamedb89/localghost/actions/workflows/publish-npm.yml/badge.svg)](https://github.com/hamedb89/localghost/actions/workflows/publish-npm.yml)
[![npm version](https://img.shields.io/badge/npm-v0.1.10-CB3837?logo=npm)](https://www.npmjs.com/package/@hamedb89/localghost)

Localghost is a tiny Node.js CLI for clean local app domains. Add it as a dev dependency, keep running the command your team already knows, and use `http://app.localhost/` instead of remembering which port belongs to which process.

[Website](https://hamedb89.github.io/localghost/) · [Docs](https://hamedb89.github.io/localghost/docs/) · [npm](https://www.npmjs.com/package/@hamedb89/localghost) · [GitHub](https://github.com/hamedb89/localghost)

## Quick Start

```sh
yarn add -D @hamedb89/localghost
```

For Vite apps, add the plugin once:

```ts
import { defineConfig } from "vite";
import { localGhostPlugin } from "@hamedb89/localghost/vite";

export default defineConfig({
  plugins: [localGhostPlugin()]
});
```

Then keep using the command your repo already expects:

```sh
yarn dev
```

On the first interactive run, Localghost can create `.localghost`, explain the `/etc/hosts` change, write `ops/local/Caddyfile`, and print the browser-facing URL:

```txt
localghost
local:  http://app.localhost/
also:   http://www.app.localhost/
target: http://127.0.0.1:5173/
```

For non-Vite apps, wrap your raw dev command:

```json
{
  "scripts": {
    "dev": "localghost run -- yarn dev:raw",
    "dev:raw": "next dev"
  }
}
```

## What It Does

- Reads `.localghost` from your app repo and turns hostnames into local routes.
- Updates only a managed Localghost block in `/etc/hosts` during explicit setup.
- Generates `ops/local/Caddyfile` for local reverse proxying.
- Keeps HTTP as the default; HTTPS is explicit with `--https`, `--ssl`, or config.
- Checks whether Caddy is installed, but never installs Homebrew packages for you.
- Gives Vite explicit `server.allowedHosts` entries without using `allowedHosts: true`.
- Exposes CLI, config, state, and route output for scripts and agent workflows.

## Common Commands

```sh
localghost init --write-scripts
localghost doctor
localghost setup
localghost status --ready
localghost dev
localghost run -- vite
localghost routes
localghost ps
localghost reset
localghost teardown
localghost update
```

Prefer `.localhost` names. `.local` is supported, but Localghost warns because `.local` can collide with mDNS/Bonjour.

## Configuration

Most apps only need a `.localghost` file when they want explicit hostnames or multiple services:

```txt
# Format: <host> <port>
app.localhost 5173
www.app.localhost 5173
api.app.localhost 8787
```

Most repos do not need `localghost.config.mjs`. Add it only for decisions like HTTPS, dynamic-port behavior, `www.` aliases, custom config files, or `ghostTunnel` preview domains.

## Trust

- CI runs typecheck, build, site build, and npm package dry-run on Node 20 and 22.
- GitHub Pages is deployed by Actions from the checked-in `site/`, `docs/`, and `assets/` sources.
- Preview the exact Pages artifact locally with `npm run site:serve`, then open `http://127.0.0.1:4173/`.
- npm publish is guarded by `prepublishOnly` and the release workflow publishes with npm provenance.
- Runtime dependencies are intentionally small: `commander` and `execa`. Vite is an optional peer dependency.
- No postinstall scripts, hidden Homebrew installs, surprise browser tabs, or broad hosts-file rewrites.
- Update checks are best-effort, cached for 24 hours, and can be disabled with `LOCALGHOST_NO_UPDATE_CHECK=1` or `--no-update-check`.

## Docs

The full docs are served on GitHub Pages:

- [User flows](https://hamedb89.github.io/localghost/docs/flows/)
- [CLI reference](https://hamedb89.github.io/localghost/docs/localghost.1/)
- [Ghost Tunnel guide](https://hamedb89.github.io/localghost/docs/ghost-tunnel/)
- [macOS widget notes](https://hamedb89.github.io/localghost/docs/macos-widget/)
- [Brand guidelines](https://hamedb89.github.io/localghost/docs/brand/)
- [All docs](https://hamedb89.github.io/localghost/docs/)

## API

```ts
import {
  getConfigFileCandidates,
  initLocalghost,
  readDevHosts,
  readLocalghostState,
  removeSystemHosts,
  renderCaddyfile,
  renderHostsBlock,
  runDoctor,
  updateSystemHosts
} from "@hamedb89/localghost";

import { localGhostPlugin } from "@hamedb89/localghost/vite";
```

## License

MIT
