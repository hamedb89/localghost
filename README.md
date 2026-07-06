<p align="center">
  <img src="./assets/localghost-banner.png" alt="Localghost - Friendly local hostnames" width="960">
</p>

# @hamedb89/localghost

Buh. Friendly local hostnames for app repos.

[![CI](https://github.com/hamedb89/localghost/actions/workflows/ci.yml/badge.svg)](https://github.com/hamedb89/localghost/actions/workflows/ci.yml)
[![GitHub Pages](https://github.com/hamedb89/localghost/actions/workflows/pages.yml/badge.svg)](https://github.com/hamedb89/localghost/actions/workflows/pages.yml)
[![Publish npm](https://github.com/hamedb89/localghost/actions/workflows/publish-npm.yml/badge.svg)](https://github.com/hamedb89/localghost/actions/workflows/publish-npm.yml)
[![npm version](https://img.shields.io/badge/npm-v0.1.11-CB3837?logo=npm)](https://www.npmjs.com/package/@hamedb89/localghost)

Localghost is a tiny Node.js CLI for clean local app domains. Add it as a dev dependency, keep running the command your team already knows, and use `http://app.localhost/` instead of remembering which port belongs to which process.

[Website](https://hamedb89.github.io/localghost/) · [Docs](https://hamedb89.github.io/localghost/docs/) · [npm](https://www.npmjs.com/package/@hamedb89/localghost) · [GitHub](https://github.com/hamedb89/localghost)

## Quick Start

Install it as a dev dependency:

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

## The Simple Stuff

Create the repo-local hostname contract:

```sh
localghost init --write-scripts
```

Check whether the machine is ready:

```sh
localghost doctor
```

Prepare `/etc/hosts` and the local Caddyfile:

```sh
localghost setup
```

Check setup readiness:

```sh
localghost status --ready
```

Run only the local proxy:

```sh
localghost dev
```

Wrap an app server:

```sh
localghost run -- vite
```

See the domain layer:

```sh
localghost routes
```

```txt
localghost routes
  http://app.localhost/ -> http://127.0.0.1:5173
  http://api.app.localhost/ -> http://127.0.0.1:8787
```

See active Localghost sessions:

```sh
localghost ps
localghost ps --json
```

Check for updates:

```sh
localghost update
```

Prefer `.localhost` names. `.local` is supported, but Localghost warns because `.local` can collide with mDNS/Bonjour.

## What It Changes

Localghost is intentionally small and explicit:

- Reads `.localghost` from your app repo and turns hostnames into local routes.
- Updates only a managed Localghost block in `/etc/hosts` during explicit setup.
- Generates `ops/local/Caddyfile` for local reverse proxying.
- Records setup state in `ops/local/localghost-state.json`.
- Keeps HTTP as the default; HTTPS is explicit with `--https`, `--ssl`, or config.
- Checks whether Caddy is installed, but never installs Homebrew packages for you.
- Gives Vite explicit `server.allowedHosts` entries without using `allowedHosts: true`.
- Never opens browser tabs by default.

`setup`, `dev`, and `teardown` refuse to run in production-like environments such as `NODE_ENV=production`, `VERCEL_ENV=production`, or `LOCALGHOST_ENV=production`.

## Configuration By Use Case

### One App Domain

Use a `.localghost` file when you want one stable local domain:

```txt
# .localghost
app.localhost 5173
```

Then run:

```sh
localghost setup
localghost run -- vite
```

### Multiple Local Services

Map each browser-facing host to the upstream port:

```txt
# .localghost
app.localhost 5173
www.app.localhost 5173
api.app.localhost 8787
admin.app.localhost 5174
```

`localghost routes` prints the same `domain -> upstream` map that `setup` and `dev` use.

### Add Package Scripts

`localghost init --write-scripts` adds missing scripts without replacing your existing ones:

```json
{
  "scripts": {
    "localghost:setup": "localghost setup",
    "localghost:proxy": "localghost dev",
    "localghost:proxy:https": "localghost dev --https",
    "localghost:run": "localghost run --",
    "localghost:ready": "localghost status --ready",
    "localghost:trust": "localghost trust",
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

### Keep `yarn dev` As The Daily Command

Wrap the raw app server so teammates keep typing the normal command:

```json
{
  "scripts": {
    "dev": "localghost run -- yarn dev:raw",
    "dev:raw": "vite"
  }
}
```

For Turborepo, wrap the dev runner and keep dev uncached:

```json
{
  "scripts": {
    "dev": "localghost run -- yarn dev:raw",
    "dev:raw": "turbo dev"
  }
}
```

```json
{
  "tasks": {
    "dev": { "cache": false, "persistent": true }
  }
}
```

`localghost run` starts Caddy, handles optional HTTPS trust, starts the child command, passes `LOCALGHOST_PORT` and `VITE_PORT`, and stops Caddy when the child exits.

### Vite Plugin

Use the plugin when you want Vite to bind to `127.0.0.1`, use the selected Localghost port, set strict `allowedHosts`, and print the browser-facing domain:

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

The plugin runs only during local `vite serve`; production/build mode does not configure Vite dev-server hosting. If `ghostTunnel` is configured, the build hook can still print the production URL shape for visibility.

### Custom Config Files

By default, Localghost reads `.localghost`. Repos that need another file name can be explicit:

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

The Vite plugin accepts the same idea through `fileName`, `configFiles`, or `configPattern`.

### Shared Project Defaults

Most repos do not need `localghost.config.mjs`. Add it when you want shared defaults for CLI and Vite:

```js
import { defineLocalghostConfig } from "@hamedb89/localghost";

export default defineLocalghostConfig({
  project: "app",
  port: 5173,
  dynamicPort: true,
  wwwAlias: true
});
```

Localghost derives `project` from `package.json`, defaults to port `5173`, keeps HTTP as the default, enables dynamic ports by default, and adds `www.` aliases by default.

### Fixed Ports

Dynamic ports are on by default. Localghost starts at the configured port, checks `127.0.0.1:<port>`, and walks upward until it finds a free port.

Use strict fixed-port behavior when you want startup to fail instead:

```sh
localghost run --dynamic-port=no -- vite
```

Or in config:

```js
export default defineLocalghostConfig({
  dynamicPort: false
});
```

### Local HTTPS

HTTP is the default. Use HTTPS only when you explicitly want Caddy local certificates:

```sh
localghost setup --https
localghost dev --https
```

Trust Caddy's local HTTPS CA when you want browsers to stop showing local certificate warnings:

```sh
localghost trust
localghost run --trust -- vite
```

macOS may ask for your password so Caddy can add its local CA to Keychain. Localghost records the trust result in `ops/local/localghost-state.json`.

You can also make HTTPS the repo default:

```js
export default defineLocalghostConfig({
  https: true
});
```

### Disable `www.` Aliases

By default, `app.localhost 5173` also creates `www.app.localhost`.

Disable that when the repo wants only exact hosts:

```js
export default defineLocalghostConfig({
  wwwAlias: false
});
```

### Public Ghost Tunnel

`ghostTunnel` is an opt-in production URL shape for deployed wildcard endpoints. It does not change local Caddy or `/etc/hosts` setup.

Use public mode when the deployed app should react to whatever route arrives:

```js
import { defineLocalghostConfig } from "@hamedb89/localghost";

export default defineLocalghostConfig({
  ghostTunnel: {
    mode: "public",
    domains: "copper-comet.example"
  }
});
```

Build output stays flexible instead of filling slots from the build machine:

```txt
localghost ghost tunnel
  mode: public
  configured: https://<route>-<project>-<owner>.ghost.copper-comet.example/
```

Production code can parse and validate the incoming wildcard host:

```ts
import {
  assertSecureGhostTunnelRequest,
  readLocalghostProjectConfig
} from "@hamedb89/localghost";

const { config } = await readLocalghostProjectConfig();

const route = assertSecureGhostTunnelRequest({
  host: request.headers.get("host") ?? "",
  domain: "copper-comet.example",
  protocol: "https",
  authenticated: Boolean(session),
  ghostTunnel: config.ghostTunnel
});
```

By default, secure requests require HTTPS and app-authenticated access.

### Concrete Ghost Tunnel Preview

Use `preview` only when you want one concrete URL in logs or menus:

```js
export default defineLocalghostConfig({
  ghostTunnel: {
    mode: "public",
    domains: "copper-comet.example",
    preview: {
      route: "decisionlayer",
      project: "decision-layer",
      owner: "hamedbahrami"
    }
  }
});
```

That prints:

```txt
localghost ghost tunnel
  mode: public
  configured: https://decisionlayer-decision-layer-hamedbahrami.ghost.copper-comet.example/
```

### Manual Ghost Tunnel

Manual mode is the default. It is useful for private or operator-mediated sharing flows:

```js
export default defineLocalghostConfig({
  ghostTunnel: {
    mode: "manual",
    domains: "moonlit-otter.example"
  }
});
```

Manual relay helpers are private by default: registration requires a local-agent bearer token plus an exact signed route claim, targets must be explicit local host/port objects, dangerous ports are blocked, sensitive headers/logs are redacted, and offline agents get a safe 503 page.

### Script And Agent Output

Use JSON when scripts, menu bar tools, or agents need stable output:

```sh
localghost print
localghost status --json
localghost ps --json
localghost update --json
```

`print` parses the selected config file. `status` reports the project-local setup state. `ps` reports active sessions across projects and whether each upstream port is listening.

### Reset Or Remove Localghost

Retest setup without deleting `.localghost`:

```sh
localghost reset
localghost setup
```

Remove only the managed hosts block for this project:

```sh
localghost teardown
```

Remove the generated Caddyfile too:

```sh
localghost teardown --remove-caddyfile
```

### macOS Widget

Localghost includes a tiny native macOS widget under `apps/macos-widget`. It reads the shared activity file and shows known setup/running instances.

Build it from source:

```sh
npm run build
npm run macos:widget:build
```

The app bundle is written to `dist/LocalghostWidget.app`.

## CLI Reference

```sh
localghost init [--write-scripts] [--config file] [--host host] [--port port]
localghost doctor
localghost setup [--project name] [--config file] [--config-pattern regex] [--https|--ssl]
localghost trust [--project name] [--config file] [--config-pattern regex] [--https|--ssl]
localghost reset [--project name]
localghost teardown [--project name] [--remove-caddyfile]
localghost status [--ready] [--json]
localghost ps [--json]
localghost update [--json]
localghost dev [--config file] [--config-pattern regex] [--https|--ssl] [--setup] [--trust]
localghost run [--config file] [--config-pattern regex] [--https|--ssl] [--setup] [--trust] [--dynamic-port] -- command
localghost routes [--https|--ssl]
localghost print [--config file] [--config-pattern regex]
```

## API

```ts
import {
  assertSecureGhostTunnelRequest,
  constructGhostTunnelUrl,
  getConfigFileCandidates,
  initLocalghost,
  readDevHosts,
  readLocalghostState,
  readLocalghostProjectConfig,
  removeSystemHosts,
  renderCaddyfile,
  renderHostsBlock,
  runDoctor,
  updateSystemHosts
} from "@hamedb89/localghost";

import { localGhostPlugin } from "@hamedb89/localghost/vite";
```

`localHostsPlugin` is also exported as a compatibility alias for the Vite helper.

## Trust

- CI runs typecheck, build, site build, and npm package dry-run on Node 20 and 22.
- GitHub Pages is deployed by Actions from the checked-in `site/`, `docs/`, and `assets/` sources.
- Preview the exact Pages artifact locally with `npm run site:serve`, then open `http://127.0.0.1:4173/`.
- npm publish is guarded by `prepublishOnly` and the release workflow publishes with npm provenance.
- Runtime dependencies are intentionally small: `commander` and `execa`. Vite is an optional peer dependency.
- No postinstall scripts, hidden Homebrew installs, surprise browser tabs, or broad hosts-file rewrites.
- Update checks are best-effort, cached for 24 hours, and can be disabled with `LOCALGHOST_NO_UPDATE_CHECK=1` or `--no-update-check`.

## More Docs

- [Website](https://hamedb89.github.io/localghost/)
- [Rendered docs](https://hamedb89.github.io/localghost/docs/)
- [User flows](./docs/flows.md)
- [CLI reference](./docs/localghost.1.md)
- [Ghost Tunnel guide](./docs/ghost-tunnel.md)
- [macOS widget notes](./docs/macos-widget.md)
- [Brand guidelines](./docs/brand.md)

## License

MIT
