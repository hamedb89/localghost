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

## Update Awareness

As a developer, I want to know when Localghost itself is stale without paying for a network check on every run.

```sh
yarn localghost update
LOCALGHOST_NO_UPDATE_CHECK=1 yarn localghost doctor
```

Localghost checks npm after successful commands, caches the result for 24 hours, and ignores check failures. `LOCALGHOST_NO_UPDATE_CHECK=1` and `--no-update-check` disable the automatic check.

## One-Time Setup

As a developer, I want one explicit setup command that updates only the managed Localghost block in `/etc/hosts` and validates Caddy.

```sh
yarn localghost:setup
```

## Daily Dev

As a developer, I want a daily command that starts the local HTTP proxy from the same config file, with local HTTPS available only when I ask for it.

```sh
yarn localghost:ready
yarn localghost:proxy
```

Most repos will run this next to their app server, for example Vite on `127.0.0.1:5173`.

When a repo really needs local certificates:

```sh
yarn localghost:proxy:https
```

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
  http://app.localhost/ -> http://127.0.0.1:5173
  http://api.app.localhost/ -> http://127.0.0.1:8787
```

`setup` and `dev` print this same map before Caddy is validated or run.

## Vite Integration

As a Vite user, I want Localghost to set the dev host to my configured domain, keep strict `allowedHosts`, print browser-facing URLs, and never run in production/build mode.

```ts
import { localGhostPlugin } from "@hamedb89/localghost/vite";

export default {
  plugins: [localGhostPlugin({ port: 5173 })]
};
```

The plugin defaults to HTTP. Pass `https: true` only when Vite is expected to sit behind a Caddy HTTPS proxy. Localghost prints URLs but does not open browser tabs.

If `.localghost` is missing, an interactive `yarn dev` asks whether to create it, asks for the primary `.localhost` domain, allows extra domains, explains the `/etc/hosts` password prompt, and runs setup when confirmed. Non-interactive runs fail with the exact setup command instead of guessing.

## Ghost Tunnel

As a production app, I want one opt-in flag that makes `<route>-<project>-<owner>.ghost.<domain>` a known product entrypoint on top of the deployed Vite app, without running local Caddy or requiring the local `.localghost` file.

```js
export default defineLocalghostConfig({
  ghostTunnel: {
    domains: "moonlit-otter.example",
    mode: "manual"
  }
});
```

The production flow is DNS wildcard -> `constructGhostTunnelUrl` -> deployed app -> app auth -> `assertSecureGhostTunnelRequest`. By default the helper constructs and parses `route`, `project`, and `owner` from the wildcard label before `ghost.<domain>`, requires HTTPS, and requires the app to pass `authenticated: true`. See [Ghost Tunnel](./ghost-tunnel.md).

Relay registration is local-agent-only: signed exact-host claims, explicit local targets, private access by default, no arbitrary URL proxy endpoint, and safe offline behavior when the agent disconnects.

When `ghostTunnel` is configured, route and Vite startup logs print local defaults for `route`, `project`, and `owner`. Add `ghostTunnel.domains` to fill one or more production base domains; omit it to show the wildcard domain as `*`. When `ghostTunnel.preview` is configured, they print the concrete preview URL. In an interactive Vite terminal, press `g` to show Ghost Tunnel configuration and open a numbered concrete URL.

## Reset For Testing

As a developer, I want to retest setup without deleting my project config.

```sh
yarn localghost reset
yarn localghost setup
```

`reset` removes only the managed hosts block, generated Caddyfile, and setup state. It leaves `.localghost` in place.

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
yarn localghost update
```

The CLI reference lives in [localghost(1)](./localghost.1.md). Future flows can add MCP helpers and repo templates, but the base package should remain a small, predictable CLI.
