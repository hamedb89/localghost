<p align="center">
  <img src="./assets/localghost-banner.png" alt="Localghost - Friendly local hostnames" width="960">
</p>

# @hamedb89/localghost

Buh. Friendly local hostnames for app repos.

[![CI](https://github.com/hamedb89/localghost/actions/workflows/ci.yml/badge.svg)](https://github.com/hamedb89/localghost/actions/workflows/ci.yml)
[![GitHub Pages](https://github.com/hamedb89/localghost/actions/workflows/pages.yml/badge.svg)](https://github.com/hamedb89/localghost/actions/workflows/pages.yml)
[![Publish npm](https://github.com/hamedb89/localghost/actions/workflows/publish-npm.yml/badge.svg)](https://github.com/hamedb89/localghost/actions/workflows/publish-npm.yml)
[![npm version](https://img.shields.io/badge/npm-v0.1.6-CB3837?logo=npm)](https://www.npmjs.com/package/@hamedb89/localghost)

Localghost is a tiny Node.js CLI for friendly local domains in app repos. It gives each project one small contract for `.localhost` hostnames, Caddy reverse proxies, Vite `allowedHosts`, and the system hosts file, so developers can open `http://app.localhost/` instead of remembering which localhost port belongs to which process.

[Website](https://hamedb89.github.io/localghost/) · [npm](https://www.npmjs.com/package/@hamedb89/localghost) · [GitHub](https://github.com/hamedb89/localghost)

## What It Does

- Creates and reads `.localghost` in your app repo.
- Lets repos choose explicit config files or filename patterns when `.localghost` is not enough.
- Updates only a managed Localghost block in `/etc/hosts` during explicit setup.
- Generates `ops/local/Caddyfile` for local reverse proxying. HTTP is the default; HTTPS is explicit with `--https` or `--ssl`.
- Checks whether Caddy is installed, but does not run Homebrew for you.
- Provides a Vite plugin that sets explicit `server.allowedHosts` entries.
- Defaults Vite dev to the configured Localghost domain and no-ops during production/build.
- Prints parsed config and project-local state as JSON for scripts, Codex, agents, and future MCP tools.
- Checks npm for newer Localghost releases at most once per day, with an explicit opt-out.

## Trust

- CI runs typecheck, build, site build, and npm package dry-run on Node 20 and 22.
- GitHub Pages is deployed by Actions from the checked-in `site/` and `assets/` sources.
- npm publish is guarded by `prepublishOnly` and the release workflow publishes with npm provenance.
- Runtime dependencies are intentionally small: `commander` for the CLI and `execa` for process execution. Vite is an optional peer dependency for the Vite plugin.
- No postinstall scripts, hidden Homebrew installs, or broad hosts-file rewrites.
- Update checks are best-effort, cached for 24 hours, and can be disabled with `LOCALGHOST_NO_UPDATE_CHECK=1` or `--no-update-check`.

<p align="center">
  <img src="./assets/localghost-app-icon.png" alt="Localghost app icon" width="180">
</p>

## Install

```sh
yarn add -D @hamedb89/localghost
```

## Quick Start

Create the project config and optional package scripts:

```sh
yarn localghost init --write-scripts
```

This creates `.localghost`:

```txt
# Buh. Friendly names for local services.
# Format: <host> <port>
app.localhost 5173
www.app.localhost 5173
api.app.localhost 8787
```

Check the machine:

```sh
yarn localghost doctor
```

If Caddy is missing, Localghost prints:

```txt
Caddy: missing
Run: brew install caddy
Localghost will not install it for you. No surprise spells.
```

First time on a machine:

```sh
yarn localghost:setup
```

Check that the hosts block and Caddyfile are ready:

```sh
yarn localghost:ready
```

Daily proxy:

```sh
yarn localghost:proxy
```

Use HTTPS only when you explicitly want Caddy local certificates:

```sh
yarn localghost:proxy:https
```

Reset generated setup without deleting `.localghost`:

```sh
yarn localghost:reset
yarn localghost:setup
```

Prefer `.localhost` names. `.local` is supported, but Localghost warns because `.local` can collide with mDNS/Bonjour.

## Config Files

By default, Localghost reads `.localghost` from the project root. Repos that need another name can be explicit:

```sh
localghost print --config .localghost.preview
localghost setup --config .localghost.preview
```

You can pass `--config` more than once. Localghost uses the first file that exists:

```sh
localghost print --config .localghost.private --config .localghost
```

You can also search project-root filenames with a regular expression:

```sh
localghost print --config-pattern '^\.localghost\.(private|preview)$'
```

The Vite plugin accepts the same shape through `fileName`, `configFiles`, or `configPattern`. If you run `localghost init --config .localghost.preview --write-scripts`, generated package scripts include the matching `--config` flag.

## Package Scripts

`localghost init --write-scripts` adds these scripts when they are missing:

```json
{
  "scripts": {
    "localghost:setup": "localghost setup",
    "localghost:proxy": "localghost dev",
    "localghost:proxy:https": "localghost dev --https",
    "localghost:run": "localghost run --",
    "localghost:ready": "localghost status --ready",
    "localghost:ps": "localghost ps",
    "localghost:print": "localghost print",
    "localghost:routes": "localghost routes",
    "localghost:status": "localghost status",
    "localghost:reset": "localghost reset",
    "localghost:teardown": "localghost teardown",
    "localghost:doctor": "localghost doctor",
    "localghost:update": "localghost update",
    "caddy:setup": "localghost setup",
    "caddy:dev": "localghost dev"
  }
}
```

A full app might compose them with its own servers:

```json
{
  "scripts": {
    "dev": "localghost run -- vite",
    "dev:dynamic": "localghost run --dynamic-port -- vite",
    "dev:raw": "vite"
  }
}
```

In Turborepo, let Localghost wrap the dev runner and keep dev uncached:

```json
{
  "scripts": {
    "dev": "localghost run --dynamic-port -- turbo dev",
    "dev:raw": "turbo dev"
  }
}
```

Then keep persistent dev tasks uncached:

```json
{
  "tasks": {
    "dev": { "cache": false, "persistent": true }
  }
}
```

`localghost run` resolves one shared Localghost context, starts Caddy, passes the selected port to the child command through `LOCALGHOST_PORT` and `VITE_PORT`, and stops Caddy when the child exits. With `--dynamic-port`, Localghost starts at the configured port, checks `127.0.0.1:<port>`, and walks upward until it finds a free port.

When settings need to be shared by the CLI wrapper and the Vite plugin, put them in `localghost.config.mjs`:

```js
import { defineLocalghostConfig } from "@hamedb89/localghost";

export default defineLocalghostConfig({
  project: "app",
  port: 5173,
  https: true,
  dynamicPort: true
});
```

Then the daily script can stay small:

```json
{
  "scripts": {
    "dev": "localghost run -- vite"
  }
}
```

`www.` aliases are enabled by default. A `.localghost` entry like `app.localhost 5173` also sets up `www.app.localhost` unless `wwwAlias: false` is set in `localghost.config.mjs`.

`localghost dev` and `localghost run` also register their active sessions in a user-local activity file. Use `localghost ps` to see the Localghost apps currently running on the machine:

```txt
localghost ps

app  run: vite
  cwd: /Users/you/Projects/app
  pid: 12345, caddy: 12346, child: 12347
  started: 2026-07-05T12:00:00.000Z
  app.localhost -> 127.0.0.1:5173 (listening)
```

Pass `--json` when another helper, such as a menu bar app, needs to poll the same state.

## Vite

```ts
import { defineConfig } from "vite";
import { localGhostPlugin } from "@hamedb89/localghost/vite";

export default defineConfig({
  plugins: [
    localGhostPlugin({
      port: 5173,
      configFiles: [".localghost.private", ".localghost"]
    })
  ]
});
```

The plugin binds Vite to `127.0.0.1` by default, prints the selected Localghost domain, generates an explicit `server.allowedHosts` list from the selected config file, and does not set `allowedHosts: true`. It runs only during local `vite serve`; production/build mode no-ops. When `dynamicPort` is enabled in plugin options or `localghost.config.mjs`, the plugin uses the configured port when available and otherwise moves to the next free port before Vite starts.

If `.localghost` is missing and Vite is running in an interactive terminal, the plugin asks whether to create one, prompts for the primary domain and optional extra domains, and then asks whether to run setup. Before touching `/etc/hosts`, it explains why macOS may ask for your password and confirms that only Localghost's managed block is changed.

When Vite starts, Localghost prints the browser-facing URLs:

```txt
localghost
local:  http://app.localhost/
also:   http://www.app.localhost/
target: http://127.0.0.1:5173/
```

`https: true` means the browser-facing URL is expected to go through Caddy on HTTPS, while Vite still runs behind it on `127.0.0.1:<port>`. The plugin uses that to set Vite websocket/HMR proxy settings and to print `https://...` local host URLs. Localghost never opens browser tabs by default.

Set `log: false` if you want to keep Vite's default terminal output only.

## CLI

```sh
localghost init
localghost init --write-scripts
localghost doctor
localghost setup
localghost setup --project app
localghost setup --config .localghost.preview
localghost setup --https
localghost status
localghost status --ready
localghost ps
localghost ps --json
localghost reset
localghost teardown
localghost teardown --remove-caddyfile
localghost update
localghost --no-update-check doctor
localghost run -- vite
localghost run --dynamic-port -- turbo dev
localghost dev --config-pattern '^\.localghost\.'
localghost dev --https
localghost print
```

Localghost checks npm for newer releases after successful commands. The check has a short timeout, is cached for 24 hours, and never fails the command. Disable it with `LOCALGHOST_NO_UPDATE_CHECK=1` or `--no-update-check`. Run `localghost update` when you want an explicit update check.

`setup`, `dev`, and `teardown` refuse to run in production-like environments such as `NODE_ENV=production`, `VERCEL_ENV=production`, or `LOCALGHOST_ENV=production`.

`setup` writes only a managed block in the system hosts file:

```txt
# localghost:start app
127.0.0.1 app.localhost
# localghost:end app
```

Localghost does not rewrite the whole hosts file. It replaces only its own managed block for the selected project.

## Teardown And State

`setup` writes a project-local state file at `ops/local/localghost-state.json`. It records the last Localghost action, selected config path, generated Caddyfile path, hosts file path, proxy mode, and the host entries that were applied. This is durable enough for project tooling and avoids relying on OS temp folders for tracking. Most apps should treat it as generated local state and ignore it in git.

```sh
localghost status
localghost status --ready
localghost status --json
```

`localghost dev` requires setup to be ready before it starts Caddy. If setup is missing or stale, it prints the exact `localghost setup` command instead of silently running `sudo`. Use `localghost dev --setup` only when you explicitly want the dev command to perform setup first.

When a project no longer needs Localghost, teardown removes only the managed hosts block for the selected project:

```sh
localghost teardown
```

When you want to retest setup without deleting `.localghost`, use reset:

```sh
localghost reset
localghost setup
```

The generated Caddyfile is left in place by default. Remove it explicitly when you want a fuller cleanup:

```sh
localghost teardown --remove-caddyfile
```

Localghost still uses a short-lived OS temp file while copying `/etc/hosts` with `sudo`, but that temp file is not the source of truth.

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

readDevHosts({ configFiles: [".localghost.private", ".localghost"] });
readDevHosts({ configPattern: /^\.localghost\.(private|preview)$/ });
```

Vite helper:

```ts
import { localGhostPlugin } from "@hamedb89/localghost/vite";
```

`localHostsPlugin` is also exported as a compatibility alias.

## More Docs

Localghost copy can be mysterious, goofy, magical, funny, and a little absurd. The product behavior should stay boring in the best way: explicit commands, exact paths, clear errors, and no hidden installs.

- [Website](https://hamedb89.github.io/localghost/)
- [Brand guidelines](./docs/brand.md)
- [Job-to-be-done flows](./docs/flows.md)
- [CLI reference](./docs/localghost.1.md)

## Assets

<p align="center">
  <img src="./assets/localghost-mascot.png" alt="Localghost mascot" width="180">
  <br>
  <img src="./assets/localghost-wordmark.png" alt="Localghost wordmark" width="420">
</p>

## License

MIT
