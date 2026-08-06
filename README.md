<p align="center">
  <img src="./assets/localghost-banner.png" alt="Localghost - Friendly local hostnames" width="960">
</p>

# @hamedb89/localghost

Buh. Friendly local hostnames for app repos.

[![CI](https://github.com/hamedb89/localghost/actions/workflows/ci.yml/badge.svg)](https://github.com/hamedb89/localghost/actions/workflows/ci.yml)
[![GitHub Pages](https://github.com/hamedb89/localghost/actions/workflows/pages.yml/badge.svg)](https://github.com/hamedb89/localghost/actions/workflows/pages.yml)
[![Publish npm](https://github.com/hamedb89/localghost/actions/workflows/publish-npm.yml/badge.svg)](https://github.com/hamedb89/localghost/actions/workflows/publish-npm.yml)
[![npm version](https://img.shields.io/npm/v/@hamedb89/localghost?logo=npm)](https://www.npmjs.com/package/@hamedb89/localghost)

Localghost is a tiny Node.js CLI for clean local app domains. Add it as a dev dependency, keep running the command your team already knows, and use `http://app.localhost/` instead of remembering which port belongs to which process.

[Website](https://hamedb89.github.io/localghost/) · [Docs](https://hamedb89.github.io/localghost/docs/) · [npm](https://www.npmjs.com/package/@hamedb89/localghost) · [GitHub](https://github.com/hamedb89/localghost)

## Quick Start

Install it as a dev dependency:

```sh
npm install -D @hamedb89/localghost
pnpm add -D @hamedb89/localghost
yarn add -D @hamedb89/localghost
bun add -d @hamedb89/localghost
```

Use the command for your package manager; you only need one of the four lines above.

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
npm exec localghost
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
    "dev": "localghost run -- next dev",
    "dev:raw": "next dev"
  }
}
```

## The Simple Stuff

Start the detected development server with Localghost:

```sh
npm exec localghost
```

Localghost detects the package manager, prefers a non-recursive `dev:raw` script, falls back to `dev`, repairs stale setup when needed, then starts Caddy and the server. Preview the decision without starting anything:

```sh
npm exec localghost -- --dry-run
```

Supported runtime flags such as `--https`, `--clean-caddy`, `--auto-repair`, and `--dynamic-port` are forwarded by the bare command to the underlying run lifecycle.

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

Repair stale hosts, Caddy configuration, or setup state:

```sh
localghost repair
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

Give coding agents the supported workflow and repository conventions:

```sh
localghost guide --agent
localghost guide --agent --json
```

Localghost remembers project and instance port assignments in user-level state under `~/.localghost`. The registry is used only for Localghost-managed processes; the operating-system port check remains authoritative for unrelated processes.

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
    "localghost:repair": "localghost repair",
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

### Keep Your Existing Dev Command

Wrap the raw app server so teammates keep typing the normal command:

```json
{
  "scripts": {
    "dev": "localghost run -- vite",
    "dev:raw": "vite"
  }
}
```

For Turborepo, wrap the dev runner and keep dev uncached:

```json
{
  "scripts": {
    "dev": "localghost run -- turbo dev",
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
  autoRepair: true,
  wwwAlias: true
});
```

Localghost derives `project` from `package.json`, defaults to port `5173`, keeps HTTP as the default, enables dynamic ports and setup repair by default, and adds `www.` aliases by default. `run`, `dev`, and the Vite plugin perform a read-only readiness check first and repair only when the managed hosts block or setup state is stale.

With no subcommand, `command` takes precedence. Otherwise Localghost detects npm, pnpm, Yarn, or Bun and runs `dev:raw` or `dev`. Scripts that invoke Localghost are skipped to prevent recursion.

### Multiple Apps

For a monorepo where one root command already starts every app, keep using `command` and list the routes in `.localghost`.

When Localghost should own each process, configure explicit services:

```js
export default defineLocalghostConfig({
  services: [
    {
      name: "web",
      cwd: "apps/web",
      host: "xyz.localhost",
      port: 5173
    },
    {
      name: "api",
      cwd: "apps/api",
      host: "api.xyz.localhost",
      port: 8787
    }
  ]
});
```

Then bare `localghost` starts one Caddy instance and both services. Each command runs in its own `cwd` and receives its own `LOCALGHOST_PORT`, `VITE_PORT`, and `LOCALGHOST_SERVICE`. Dynamic-port selection and setup repair apply to every service. When Caddy or any service exits, Localghost stops the remaining processes.

Omit a service `command` to detect `dev:raw` or `dev` from that service directory. Service directories must stay inside the project root, and names and hosts must be unique.

Caddy startup and validation logs are quiet after success; configuration errors remain visible. Set `LOCALGHOST_CADDY_VERBOSE=1` when debugging Caddy itself. Once all service ports are listening, Localghost prints the final hostname-to-upstream map beneath the service startup logs.

Try the runnable Node example in [`examples/multi-service`](./examples/multi-service).

Disable automatic repair when you want strict failure behavior:

```sh
localghost run --auto-repair=no -- vite
```

Or set `autoRepair: false` in `localghost.config.mjs`. HTTPS certificate trust remains explicit.

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

### Public Ghost Tunnel (Experimental)

> [!WARNING]
> Ghost Tunnel is experimental. Its configuration, transport protocol, and public APIs may change between releases. Do not rely on it for production-critical access, and review its authentication and network exposure before sharing a tunnel.

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

Reconcile the managed hosts block, regenerate and validate the Caddyfile, and refresh setup state:

```sh
localghost repair
```

For HTTPS certificate trust problems, explicitly re-run Caddy's trust step:

```sh
localghost repair --https --trust
```

If a running Caddy process exits, `localghost run` exits with it; starting the normal development command again launches a fresh Caddy process.

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
localghost [--cwd path] [--dry-run]
localghost init [--write-scripts] [--config file] [--host host] [--port port]
localghost doctor
localghost setup [--project name] [--config file] [--config-pattern regex] [--https|--ssl]
localghost repair [--project name] [--config file] [--config-pattern regex] [--https|--ssl] [--trust]
localghost trust [--project name] [--config file] [--config-pattern regex] [--https|--ssl]
localghost reset [--project name]
localghost teardown [--project name] [--remove-caddyfile]
localghost status [--ready] [--json]
localghost ps [--json]
localghost update [--json]
localghost release <patch|minor|major>
localghost dev [--config file] [--config-pattern regex] [--https|--ssl] [--auto-repair yes|no] [--trust]
localghost run [--config file] [--config-pattern regex] [--https|--ssl] [--auto-repair yes|no] [--trust] [--dynamic-port] -- command
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
- To release the CLI, run `localghost release patch`, `localghost release minor`, or `localghost release major`. The command dispatches the **Release** workflow from `main`; it synchronizes version metadata, verifies the package and runtime matrix, commits and tags the bump, publishes npm, and creates a GitHub Release with generated notes. GitHub CLI must be installed and authenticated.
- Runtime dependencies are intentionally small: `commander` and `execa`. Vite is an optional peer dependency.
- No postinstall scripts, hidden Homebrew installs, surprise browser tabs, or broad hosts-file rewrites.
- Update checks are best-effort, cached for 24 hours, and can be disabled with `LOCALGHOST_NO_UPDATE_CHECK=1` or `--no-update-check`.

## More Docs

- [Website](https://hamedb89.github.io/localghost/)
- [Rendered docs](https://hamedb89.github.io/localghost/docs/)
- [User flows](./docs/flows.md)
- [CLI reference](./docs/localghost.1.md)
- [Ghost Tunnel guide (experimental)](./docs/ghost-tunnel.md)
- [macOS widget notes](./docs/macos-widget.md)
- [Brand guidelines](./docs/brand.md)

## License

MIT
