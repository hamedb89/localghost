# Localghost User Flows

## Drop-In Install

As a developer, I want Localghost to be a drop-in dev dependency so I can add friendly local hostnames without rebuilding the same Caddy and hosts setup in every repo.

```sh
yarn add -D @hamedb89/localghost
```

Then initialize the project contract:

```sh
yarn localghost init --write-scripts
```

## Project Contract

As a developer, I want one small file that explains the local domain map for this repo.

```txt
# .localghost
app.localhost 5173
www.app.localhost 5173
api.app.localhost 8787
```

`.localghost` is the canonical config file. `.dev-hosts` still works as a legacy fallback for older repos.

## Machine Readiness

As a developer, I want to know whether my laptop is ready before Localghost changes system files.

```sh
yarn localghost doctor
```

Localghost checks for Caddy and prints the exact install command when it is missing. It does not run Homebrew automatically.

## One-Time Setup

As a developer, I want one explicit setup command that updates only the managed Localghost block in `/etc/hosts` and validates Caddy.

```sh
yarn localghost:setup
```

## Daily Dev

As a developer, I want a daily command that starts the local HTTPS proxy from the same config file.

```sh
yarn localghost:proxy
```

Most repos will run this next to their app server, for example Vite on `127.0.0.1:5173`.

## Vite Integration

As a Vite user, I want Localghost to set strict `allowedHosts` and print the browser-facing HTTPS URLs.

```ts
import { localGhostPlugin } from "@hamedb89/localghost/vite";

export default {
  plugins: [localGhostPlugin({ port: 5173, https: true })]
};
```

## Agent-Friendly Tools

As a Codex or agent user, I want commands that are inspectable and scriptable without opening a browser.

```sh
yarn localghost print
yarn localghost doctor
```

The CLI reference lives in [localghost(1)](./localghost.1.md). Future flows can add MCP helpers and repo templates, but the base package should remain a small, predictable CLI.
