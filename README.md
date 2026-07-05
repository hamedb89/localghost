<p align="center">
  <img src="./assets/localghost-banner.png" alt="Localghost - Friendly local hostnames" width="960">
</p>

# @localghost/dev

Friendly local hostnames for app repos.

Localghost gives a project one small contract for local domains, Caddy, Vite, and the system hosts file. It is meant for teams that want to open `https://app.localhost/` instead of remembering which localhost port belongs to which process.

## What It Does

- Reads a `.dev-hosts` file from your app repo.
- Updates a managed block in `/etc/hosts` during one-time setup.
- Generates `ops/local/Caddyfile` for local HTTPS reverse proxying.
- Validates the Caddyfile before running Caddy.
- Provides a Vite plugin that sets explicit `server.allowedHosts` entries.
- Prints the friendly local URLs when Vite starts.

<p align="center">
  <img src="./assets/localghost-app-icon.png" alt="Localghost app icon" width="180">
</p>

## Install

```sh
npm install -D @localghost/dev
```

With Yarn:

```sh
yarn add -D @localghost/dev
```

With pnpm:

```sh
pnpm add -D @localghost/dev
```

You also need Caddy installed on the machine:

```sh
brew install caddy
```

## Repo Contract

Create `.dev-hosts` in your app repo:

```txt
app.localhost 5173
www.app.localhost 5173
api.app.localhost 8787
```

Prefer `.localhost` names. `.local` is supported, but Localghost warns because `.local` can collide with mDNS/Bonjour.

## Package Scripts

Add scripts like these:

```json
{
  "scripts": {
    "local:setup": "localghost setup --project app",
    "local:proxy": "localghost dev",
    "dev:web": "vite --host 127.0.0.1 --port 5173 --strictPort",
    "dev:api": "wrangler dev --port 8787",
    "dev:local": "concurrently -k \"npm run dev:web\" \"npm run dev:api\" \"npm run local:proxy\""
  }
}
```

First time on a machine:

```sh
npm run local:setup
```

Daily:

```sh
npm run dev:local
```

## Vite

```ts
import { defineConfig } from "vite";
import { localGhostPlugin } from "@localghost/dev/vite";

export default defineConfig({
  plugins: [
    localGhostPlugin({
      port: 5173,
      https: true
    })
  ]
});
```

The plugin generates an explicit `server.allowedHosts` list from `.dev-hosts`; it does not set `allowedHosts: true`.

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
localghost setup
localghost setup --project app
localghost dev
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
  readDevHosts,
  renderCaddyfile,
  renderHostsBlock,
  updateSystemHosts
} from "@localghost/dev";
```

Vite helper:

```ts
import { localGhostPlugin } from "@localghost/dev/vite";
```

`localHostsPlugin` is also exported as a compatibility alias.

## Publishing

The recommended setup is:

- GitHub repo: `hamedbahrami/localghost`
- npm package: `@localghost/dev`
- CLI binary: `localghost`

The unscoped npm name `localghost` is already taken, so the scoped package is the clean publish path. To publish under `@localghost/dev`, create or own the `localghost` npm organization/scope, then run:

```sh
npm run release:check
npm publish --access public
```

If the `@localghost` npm scope is not available to your account, publish the same package under a personal scope first, for example `@hamedbahrami/localghost`, while keeping the CLI command as `localghost`.

## Assets

<p align="center">
  <img src="./assets/localghost-mascot.png" alt="Localghost mascot" width="180">
  <br>
  <img src="./assets/localghost-wordmark.png" alt="Localghost wordmark" width="420">
</p>

## License

MIT
