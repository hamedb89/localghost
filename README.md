<p align="center">
  <img src="./assets/localghost-banner.png" alt="Localghost - Friendly local hostnames" width="960">
</p>

# @hamedb89/localghost

Buh. Friendly local hostnames for app repos.

Localghost is a tiny Node.js CLI for local HTTPS domains in app repos. It gives each project one small contract for `.localhost` hostnames, Caddy reverse proxies, Vite `allowedHosts`, and the system hosts file, so developers can open `https://app.localhost/` instead of remembering which localhost port belongs to which process.

## What It Does

- Creates and reads `.localghost` in your app repo.
- Lets repos choose explicit config files or filename patterns when `.localghost` is not enough.
- Updates only a managed Localghost block in `/etc/hosts` during explicit setup.
- Generates `ops/local/Caddyfile` for local HTTPS reverse proxying.
- Checks whether Caddy is installed, but does not run Homebrew for you.
- Provides a Vite plugin that sets explicit `server.allowedHosts` entries.
- Prints parsed config as JSON for scripts, Codex, agents, and future MCP tools.

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

Daily proxy:

```sh
yarn localghost:proxy
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
    "localghost:print": "localghost print",
    "localghost:doctor": "localghost doctor"
  }
}
```

A full app might compose them with its own servers:

```json
{
  "scripts": {
    "dev:web": "vite --host 127.0.0.1 --port 5173 --strictPort",
    "dev:api": "wrangler dev --port 8787",
    "dev:local": "concurrently -k \"npm run dev:web\" \"npm run dev:api\" \"npm run localghost:proxy\""
  }
}
```

## Vite

```ts
import { defineConfig } from "vite";
import { localGhostPlugin } from "@hamedb89/localghost/vite";

export default defineConfig({
  plugins: [
    localGhostPlugin({
      port: 5173,
      https: true,
      configFiles: [".localghost.private", ".localghost"]
    })
  ]
});
```

The plugin generates an explicit `server.allowedHosts` list from the selected config file; it does not set `allowedHosts: true`.

When Vite starts, Localghost prints the browser-facing URLs:

```txt
localghost
open:   https://app.localhost/
also:   https://www.app.localhost/
target: http://127.0.0.1:5173/
proxy:  Caddy local HTTPS
```

`https: true` means the browser-facing URL is expected to go through Caddy on HTTPS, while Vite still runs behind it on `127.0.0.1:<port>`. The plugin uses that to set Vite websocket/HMR proxy settings and to print `https://...` local host URLs.

Set `log: false` if you want to keep Vite's default terminal output only.

## CLI

```sh
localghost init
localghost init --write-scripts
localghost doctor
localghost setup
localghost setup --project app
localghost setup --config .localghost.preview
localghost dev --config-pattern '^\.localghost\.'
localghost print
```

`setup` writes only a managed block in the system hosts file:

```txt
# localghost:start app
127.0.0.1 app.localhost
# localghost:end app
```

Localghost does not rewrite the whole hosts file. It replaces only its own managed block for the selected project.

## API

```ts
import {
  getConfigFileCandidates,
  initLocalghost,
  readDevHosts,
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

## Brand And Flows

Localghost copy can be mysterious, goofy, magical, funny, and a little absurd. The product behavior should stay boring in the best way: explicit commands, exact paths, clear errors, and no hidden installs.

- [Brand guidelines](./docs/brand.md)
- [Job-to-be-done flows](./docs/flows.md)
- [CLI reference](./docs/localghost.1.md)
- [GitHub discoverability and Pages notes](./docs/github.md)

## GitHub Pages

The repo includes a small static site in `site/` and a Pages workflow at `.github/workflows/pages.yml`.

```sh
npm run site:build
```

That builds `_site/` from `site/` plus the existing `assets/` folder. On `main`, GitHub Actions uploads `_site/` to GitHub Pages, so the public site can live at `https://hamedb89.github.io/localghost/` without duplicating image assets in the repo.

## Publishing

The recommended first setup is:

- GitHub repo: `hamedb89/localghost`
- npm package: `@hamedb89/localghost`
- CLI binary: `localghost`

The unscoped npm name `localghost` is already taken. A future `@localghost/*` npm scope can still make sense if Localghost becomes a multi-package project, but the personal scope is the clean path you can own now.

```sh
npm run release:check
npm publish --access public
```

## Assets

<p align="center">
  <img src="./assets/localghost-mascot.png" alt="Localghost mascot" width="180">
  <br>
  <img src="./assets/localghost-wordmark.png" alt="Localghost wordmark" width="420">
</p>

## License

MIT
