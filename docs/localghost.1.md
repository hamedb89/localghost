# localghost(1)

## Name

localghost - friendly local hostnames for app repos

## Synopsis

```sh
localghost init [--write-scripts] [--config file] [--host host] [--port port]
localghost doctor
localghost setup [--project name] [--config file] [--config-pattern regex] [--https|--ssl]
localghost reset [--project name]
localghost teardown [--project name] [--remove-caddyfile]
localghost status [--ready] [--json]
localghost ps [--json]
localghost update [--json]
localghost dev [--config file] [--config-pattern regex] [--https|--ssl] [--setup]
localghost run [--config file] [--config-pattern regex] [--https|--ssl] [--setup] [--dynamic-port] -- command
localghost print [--config file] [--config-pattern regex]
```

## Description

Localghost reads `.localghost`, writes a managed `/etc/hosts` block, records `ops/local/localghost-state.json`, generates `ops/local/Caddyfile`, and runs a Caddy local proxy. HTTP is the default; local HTTPS is explicit with `--https` or `--ssl`. It is intentionally small and explicit: no hidden installs, no full hosts-file rewrites, no surprise browser tabs, and no broad Vite `allowedHosts: true` shortcut.

Localghost checks npm for newer releases after successful commands. The check is best-effort, cached for 24 hours, and can be disabled with `LOCALGHOST_NO_UPDATE_CHECK=1` or `--no-update-check`.

`setup`, `dev`, and `teardown` refuse to run in production-like environments such as `NODE_ENV=production`, `VERCEL_ENV=production`, or `LOCALGHOST_ENV=production`.

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
- `--package-manager <npm|yarn|pnpm>`: package manager for suggested commands.
- `--write-scripts`: add Localghost scripts to `package.json`.
- `--force`: overwrite an existing config file.

### doctor

Checks machine prerequisites.

```sh
localghost doctor
```

Currently checks Caddy and prints `brew install caddy` when missing.

### setup

Updates the managed Localghost block in `/etc/hosts`, writes `ops/local/Caddyfile`, and validates it with Caddy. Pass `--config <file>` to look for a specific config file. Repeat `--config` to use the first existing file from an ordered list. Pass `--config-pattern <regex>` to search matching filenames in the project root. Pass `--https` or `--ssl` to generate a local HTTPS Caddyfile.

```sh
localghost setup --project app
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

### update

Checks npm for a newer Localghost release. Pass `--json` for scripts and agents.

```sh
localghost update
```

### routes

Prints the local domain layer as `domain -> upstream` routes. HTTP is the default. Pass `--https` or `--ssl` if the browser-facing domain should be shown as HTTPS.

```sh
localghost routes
```

### dev

Requires setup to be ready, writes `ops/local/Caddyfile`, validates it, and runs Caddy. Supports `--config` and `--config-pattern`. HTTP is the default. Pass `--https` or `--ssl` to run a local HTTPS proxy. Pass `--setup` to explicitly allow `dev` to run setup first when setup is missing or stale.

```sh
localghost dev
```

### run

Resolves one Localghost context, ensures setup is ready, writes the runtime Caddyfile, starts Caddy, and runs a child dev command. The selected port is passed to the child as `LOCALGHOST_PORT` and `VITE_PORT`.

```sh
localghost run -- vite
localghost run --dynamic-port -- turbo dev
```

Pass `--dynamic-port` or `--dynamic-port=yes` to start at the configured port and walk upward until `127.0.0.1:<port>` is free. Pass `--setup` to explicitly allow setup when the hosts block is missing or stale.

`dev` and `run` register active sessions in a user-local activity file so `localghost ps` can show what is running across projects.

### print

Prints parsed Localghost config entries as JSON. Supports `--config` and `--config-pattern`.

```sh
localghost print
```

## Files

- `.localghost`: default project hostname config.
- custom config files: pass `--config <file>` or `--config-pattern <regex>`.
- `ops/local/Caddyfile`: generated local Caddy config.
- `ops/local/localghost-state.json`: last setup or teardown action.
- `/etc/hosts`: managed block only, bounded by `# localghost:start` and `# localghost:end`.

## Exit Status

- `0`: command completed successfully.
- `1`: missing prerequisite, invalid config, or failed system command.
