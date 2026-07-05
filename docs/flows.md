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

`.localghost` is the default config file. Repos can opt into another file name with `--config`, an ordered list of names, or a filename regex.

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

## Config Discovery

As a developer, I want Localghost to fit repos that already have naming conventions without hidden file searches.

```sh
yarn localghost print --config .localghost.preview
yarn localghost print --config .localghost.private --config .localghost
yarn localghost print --config-pattern '^\.localghost\.(private|preview)$'
```

Localghost uses the first existing configured file. Regex discovery scans filenames in the project root.

## Domain Routing

As a developer, I want to see the local domain layer as a simple `domain -> upstream` map.

```sh
yarn localghost routes
```

```txt
localghost routes
  https://app.localhost/ -> http://127.0.0.1:5173
  https://api.app.localhost/ -> http://127.0.0.1:8787
```

`setup` and `dev` print this same map before Caddy is validated or run.

## Vite Integration

As a Vite user, I want Localghost to set strict `allowedHosts` and print the browser-facing HTTPS URLs.

```ts
import { localGhostPlugin } from "@hamedb89/localghost/vite";

export default {
  plugins: [localGhostPlugin({ port: 5173, https: true })]
};
```

## Teardown

As a developer, I want to cleanly remove Localghost from a project when the repo is archived or no longer needs friendly hostnames.

```sh
yarn localghost teardown
yarn localghost teardown --remove-caddyfile
```

`teardown` removes only the Localghost managed `/etc/hosts` block. The generated Caddyfile is kept unless `--remove-caddyfile` is passed.

## State Tracking

As a developer or agent, I want to see what Localghost changed without reading system files directly.

```sh
yarn localghost status
yarn localghost status --json
```

Localghost records setup and teardown in `ops/local/localghost-state.json`. That file is project-local state, not OS temp state.

## Agent-Friendly Tools

As a Codex or agent user, I want commands that are inspectable and scriptable without opening a browser.

```sh
yarn localghost print
yarn localghost doctor
```

The CLI reference lives in [localghost(1)](./localghost.1.md). Future flows can add MCP helpers and repo templates, but the base package should remain a small, predictable CLI.
