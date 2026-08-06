# localghost(1)

## Name

localghost - friendly local hostnames for app repos

## Synopsis

```sh
localghost [--cwd path] [--dry-run]
localghost init [--write-scripts] [--config file] [--host host] [--port port]
localghost doctor [--cwd path] [--config file] [--config-pattern regex] [--json]
localghost setup [--project name] [--config file] [--config-pattern regex] [--https|--ssl]
localghost repair [--project name] [--config file] [--config-pattern regex] [--https|--ssl] [--trust] [--reallocate-port] [--prune-registry]
localghost trust [--project name] [--config file] [--config-pattern regex] [--https|--ssl]
localghost reset [--project name]
localghost teardown [--project name] [--remove-caddyfile]
localghost status [--ready] [--json]
localghost ps [--json]
localghost guide [--agent] [--json]
localghost tunnel [--cwd path] [--config file] [--config-pattern regex] [--ghost-config file] [--target-host host]
localghost release <patch|minor|major>
localghost update [--json]
localghost dev [--config file] [--config-pattern regex] [--https|--ssl] [--auto-repair yes|no] [--trust]
localghost run [--config file] [--config-pattern regex] [--https|--ssl] [--auto-repair yes|no] [--trust] [--dynamic-port] -- command
localghost print [--config file] [--config-pattern regex]
```

With no subcommand, Localghost detects npm, pnpm, Yarn, or Bun from `packageManager` or a lockfile, prefers a non-recursive `dev:raw` script, falls back to `dev`, and runs the result through the normal Caddy lifecycle. Supported runtime flags such as `--https`, `--clean-caddy`, `--auto-repair`, and `--dynamic-port` are forwarded to that lifecycle. `--dry-run` prints the detected command without checking or changing machine setup. Set `command: ["<package-manager>", "dev:web"]` in `localghost.config.mjs` when inference should be explicit.

For multiple independently started applications, configure `services` in `localghost.config.mjs`. Each service declares a unique name and host plus its project-relative working directory, requested port, and optional command. Bare `localghost` starts one Caddy process and all service commands, passes service-specific `LOCALGHOST_PORT`, `VITE_PORT`, and `LOCALGHOST_SERVICE` variables, and stops the group when any process exits.

```js
export default {
  services: [
    { name: "web", cwd: "apps/web", host: "xyz.localhost", port: 5173 },
    { name: "api", cwd: "apps/api", host: "api.xyz.localhost", port: 8787 }
  ]
};
```

## Description

Localghost reads `.localghost`, optionally reads `localghost.config.mjs`, writes a managed `/etc/hosts` block, records `ops/local/localghost-state.json`, generates `ops/local/Caddyfile`, and runs a Caddy local proxy. The project name is derived from `package.json`, port `5173` is the fallback, HTTP is the default, dynamic ports are on by default, and local HTTPS is explicit with `--https`, `--ssl`, or `https: true` in `localghost.config.mjs`. It is intentionally small and explicit: no hidden installs, no full hosts-file rewrites, no surprise browser tabs, and no broad Vite `allowedHosts: true` shortcut.

Localghost checks npm for newer releases after successful commands. The check is best-effort, cached for 24 hours, and can be disabled with `LOCALGHOST_NO_UPDATE_CHECK=1` or `--no-update-check`.

`setup`, `dev`, and `teardown` refuse to run in production-like environments such as `NODE_ENV=production`, `VERCEL_ENV=production`, or `LOCALGHOST_ENV=production`.

When HTTPS is enabled, `dev` and `run` can trust Caddy's local HTTPS CA before the child app starts. Localghost asks once in interactive terminals, records the answer in `ops/local/localghost-state.json`, and supports `--trust` or `localghost trust` when you want to rerun the trust step intentionally.

## Commands

### init

Creates `.localghost` in the current project by default. Pass `--config <file>` to create a differently named config file.

```sh
localghost init --write-scripts
```

Options:

- `--cwd <path>`: project directory.
- `--host <host>`: primary hostname.
- `--port <number>`: primary app port.
- `--api-host <host>`: API hostname.
- `--api-port <number>`: API port.
- `--package-manager <npm|pnpm|yarn|bun>`: package manager for suggested commands.
- `--write-scripts`: add Localghost scripts to `package.json`.
- `--force`: overwrite an existing config file.

### doctor

Checks machine prerequisites, the configured project port, and Localghost registry state. Use `--json` for agent-readable output. The command reports occupied ports, stale leases, and duplicate allocations without changing state.

```sh
localghost doctor
```

It checks Caddy and prints `brew install caddy` when missing.

### setup

Updates the managed Localghost block in `/etc/hosts`, writes `ops/local/Caddyfile`, and validates it with Caddy. Pass `--config <file>` to look for a specific config file. Repeat `--config` to use the first existing file from an ordered list. Pass `--config-pattern <regex>` to search matching filenames in the project root. Pass `--https` or `--ssl` to generate a local HTTPS Caddyfile.

```sh
localghost setup --project app
```

### trust

Validates the HTTPS Caddyfile and runs `caddy trust --config <Caddyfile>` so browsers can trust Caddy's local development certificates. macOS may ask for your password to add Caddy's local CA to Keychain.

```sh
localghost trust
```

### repair

Reconciles the managed hosts block, regenerates and validates the Caddyfile, and refreshes project setup state. Use `--https --trust` to also re-run Caddy's local certificate trust step. `--reallocate-port` selects and remembers a stable available replacement for an occupied port without editing `.localghost`. `--prune-registry` removes expired or dead leases.

```sh
localghost repair
localghost repair --https --trust
localghost repair --reallocate-port --prune-registry
```

### teardown

Removes the managed Localghost block from `/etc/hosts` for the selected project and records the action in `ops/local/localghost-state.json`. It leaves `ops/local/Caddyfile` in place unless `--remove-caddyfile` is passed.

```sh
localghost teardown --remove-caddyfile
```

### reset

Removes the managed Localghost hosts block, generated Caddyfile, and setup state, but keeps `.localghost` in place so setup can be tested again.

```sh
localghost reset
localghost setup
```

### status

Prints Localghost's project-local state file and setup readiness. Pass `--ready` to exit non-zero when the hosts block or Caddyfile is missing or stale. Pass `--json` for scripts and agents.

```sh
localghost status --ready
```

### ps

Shows Localghost `dev` and `run` sessions that are currently running on the machine. Stale records are pruned automatically when their wrapper process is gone. Each route also reports whether its upstream `127.0.0.1:<port>` is listening. Pass `--json` for menu bar helpers or other polling tools.

```sh
localghost ps
localghost ps --json
```

### guide

Prints the recommended repository integration and command workflow. Use `--agent` for the coding-agent-oriented guide and `--json` for machine-readable integration hints.

```sh
localghost guide --agent
localghost guide --agent --json
```

Localghost stores remembered project and instance port assignments in `~/.localghost`. Only Localghost-managed processes are represented there; unrelated processes are still checked by the operating system when a port is selected.

### tunnel (experimental)

Ghost Tunnel is experimental. Its configuration, transport protocol, CLI behavior, and public APIs may change between releases; do not rely on it for production-critical access.

Runs the local Ghost Tunnel agent for `ghostTunnel.transport: "tunnel"`. The command reads the Localghost project config, reads exact public hosts from `.ghosttunnel`, sends route heartbeats to the configured Redis REST store, polls for queued requests, and serves them from the matching local port.

```sh
localghost tunnel
```

Use `--ghost-config <file>` when the exact route file is not `.ghosttunnel`. Use `--target-host <host>` when the local app listens somewhere other than `127.0.0.1`.

### update

Checks npm for a newer Localghost release. Pass `--json` for scripts and agents.

```sh
localghost update
```

### release

Dispatches the repository's guarded GitHub Actions release pipeline from `main`. The command requires an installed and authenticated GitHub CLI.

```sh
localghost release patch
localghost release minor
localghost release major
```

The pipeline synchronizes version metadata, runs package and runtime verification, creates the version commit and tag, publishes npm with provenance, and creates generated GitHub release notes.

### routes

Prints the local domain layer as `domain -> upstream` routes. HTTP is the default. Pass `--https` or `--ssl` if the browser-facing domain should be shown as HTTPS.

```sh
localghost routes
```

### dev

Performs a read-only readiness check, repairs stale setup when needed, writes and validates `ops/local/Caddyfile`, and runs Caddy. Supports `--config` and `--config-pattern`. HTTP is the default. Pass `--https` or `--ssl` to run a local HTTPS proxy, `--auto-repair=no` for strict failure behavior, or `--trust` to force the Caddy trust step before the proxy stays running.

```sh
localghost dev
```

### run

Resolves one Localghost context, ensures setup is ready, writes the runtime Caddyfile, starts Caddy, handles the optional HTTPS trust prompt, and then runs a child dev command. The selected port is passed to the child as `LOCALGHOST_PORT` and `VITE_PORT`.

```sh
localghost run -- vite
localghost run --trust -- vite
localghost run --dynamic-port=no -- vite
```

By default, Localghost starts at the configured port and walks upward until `127.0.0.1:<port>` is free. It performs a read-only readiness check and repairs stale setup before starting the child. Pass `--dynamic-port=no` for strict fixed-port behavior or `--auto-repair=no` to fail instead of repairing.

When `localghost.config.mjs` exists, `run`, `dev`, `setup`, `status`, `routes`, and the Vite plugin use it as an override layer. Most repos can skip it; add it only for decisions like `https: true`, `dynamicPort: false`, `autoRepair: false`, `wwwAlias: false`, custom ports, explicit project names, or the production `ghostTunnel` opt-in.

`ghostTunnel` does not change local Caddy or `/etc/hosts` setup. It marks `<route>-<project>-<owner>.ghost.<domain>` as a production app entrypoint. Use `ghostTunnel: { domains: "example.com", mode: "manual" }` when the production base domain is known, or omit `domains` to keep logs wildcarded as `https://<route>-<project>-<owner>.ghost.*/`. Production code can call `readLocalghostProjectConfig()`, `constructGhostTunnelUrl()`, and `assertSecureGhostTunnelRequest()` to read the flag, construct default tunnel URLs, validate the wildcard host shape, require HTTPS by default, and require an app-authenticated request by default.

`ghostTunnel.transport` is separate from the deployment adapter. `transport: "none"` proves ingress and exact-route lookup without forwarding. `transport: "ip"` signs a direct address into the shared URL, verifies that token against the exact ghost host, and redirects to the signed address plus the local port from `.ghosttunnel`. `transport: "tunnel"` uses Redis REST env vars plus `localghost tunnel` to queue deployed requests for a local agent. For LAN or private-address IP redirects, set `transport: { kind: "ip", allowPrivateNetworkAddress: true }` explicitly.

Relay helpers are private by default. Registration requires an authenticated local-agent bearer token plus an exact signed route claim. Targets must be explicit local host/port objects, dangerous ports are blocked, private/LAN targets require explicit opt-in, internal and hop-by-hop headers are stripped, sensitive logs are redacted, and offline agents get a safe 503 page. The IP transport follows the same posture: the shared URL carries only a signed `{ host, address, protocol, expiresAt }` claim, while the redirect port still comes from the exact `.ghosttunnel` entry.

When `ghostTunnel` is configured, route output and Vite startup logs print the production URL shape. Manual mode can fill local defaults for `route`, `project`, and `owner`; public mode leaves those slots as `<route>`, `<project>`, and `<owner>` unless `ghostTunnel.preview` pins a concrete URL. Add `ghostTunnel.domains` to fill one or more production base domains. When `ghostTunnel.preview` is configured with `route`, `project`, and `owner`, logs print the concrete URL, inheriting `ghostTunnel.domains` unless `preview.domain` is set. In an interactive Vite terminal, press `g` to show Ghost Tunnel configuration and open a numbered concrete URL.

`dev` and `run` register active sessions in a user-local activity file so `localghost ps` can show what is running across projects.

### print

Prints parsed Localghost config entries as JSON. Supports `--config` and `--config-pattern`.

```sh
localghost print
```

## Files

- `.localghost`: default project hostname config.
- `localghost.config.mjs`: optional shared context for CLI and Vite settings.
- custom config files: pass `--config <file>` or `--config-pattern <regex>`.
- `ops/local/Caddyfile`: generated local Caddy config.
- `ops/local/localghost-state.json`: last setup or teardown action.
- `/etc/hosts`: managed block only, bounded by `# localghost:start` and `# localghost:end`.

## Exit Status

- `0`: command completed successfully.
- `1`: missing prerequisite, invalid config, or failed system command.
