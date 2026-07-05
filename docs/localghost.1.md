# localghost(1)

## Name

localghost - friendly local hostnames for app repos

## Synopsis

```sh
localghost init [--write-scripts] [--config file] [--host host] [--port port]
localghost doctor
localghost setup [--project name] [--config file] [--config-pattern regex]
localghost teardown [--project name] [--remove-caddyfile]
localghost status [--json]
localghost update [--json]
localghost dev [--config file] [--config-pattern regex]
localghost print [--config file] [--config-pattern regex]
```

## Description

Localghost reads `.localghost`, writes a managed `/etc/hosts` block, records `ops/local/localghost-state.json`, generates `ops/local/Caddyfile`, and runs a Caddy local HTTPS proxy. It is intentionally small and explicit: no hidden installs, no full hosts-file rewrites, and no broad Vite `allowedHosts: true` shortcut.

Localghost checks npm for newer releases after successful commands. The check is best-effort, cached for 24 hours, and can be disabled with `LOCALGHOST_NO_UPDATE_CHECK=1` or `--no-update-check`.

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

Updates the managed Localghost block in `/etc/hosts`, writes `ops/local/Caddyfile`, and validates it with Caddy. Pass `--config <file>` to look for a specific config file. Repeat `--config` to use the first existing file from an ordered list. Pass `--config-pattern <regex>` to search matching filenames in the project root.

```sh
localghost setup --project app
```

### teardown

Removes the managed Localghost block from `/etc/hosts` for the selected project and records the action in `ops/local/localghost-state.json`. It leaves `ops/local/Caddyfile` in place unless `--remove-caddyfile` is passed.

```sh
localghost teardown --remove-caddyfile
```

### status

Prints Localghost's project-local state file. Pass `--json` for scripts and agents.

```sh
localghost status --json
```

### update

Checks npm for a newer Localghost release. Pass `--json` for scripts and agents.

```sh
localghost update
```

### routes

Prints the local domain layer as `domain -> upstream` routes. Pass `--http` if the browser-facing domain should be shown as plain HTTP.

```sh
localghost routes
```

### dev

Writes `ops/local/Caddyfile`, validates it, and runs Caddy. Supports `--config` and `--config-pattern`.

```sh
localghost dev
```

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
