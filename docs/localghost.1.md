# localghost(1)

## Name

localghost - friendly local hostnames for app repos

## Synopsis

```sh
localghost init [--write-scripts] [--host host] [--port port]
localghost doctor
localghost setup [--project name]
localghost dev
localghost print
```

## Description

Localghost reads `.localghost`, writes a managed `/etc/hosts` block, generates `ops/local/Caddyfile`, and runs a Caddy local HTTPS proxy. It is intentionally small and explicit: no hidden installs, no full hosts-file rewrites, and no broad Vite `allowedHosts: true` shortcut.

## Commands

### init

Creates `.localghost` in the current project.

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
- `--force`: overwrite an existing `.localghost` file.

### doctor

Checks machine prerequisites.

```sh
localghost doctor
```

Currently checks Caddy and prints `brew install caddy` when missing.

### setup

Updates the managed Localghost block in `/etc/hosts`, writes `ops/local/Caddyfile`, and validates it with Caddy.

```sh
localghost setup --project app
```

### dev

Writes `ops/local/Caddyfile`, validates it, and runs Caddy.

```sh
localghost dev
```

### print

Prints parsed `.localghost` entries as JSON.

```sh
localghost print
```

## Files

- `.localghost`: canonical project hostname config.
- `.dev-hosts`: legacy fallback.
- `ops/local/Caddyfile`: generated local Caddy config.
- `/etc/hosts`: managed block only, bounded by `# localghost:start` and `# localghost:end`.

## Exit Status

- `0`: command completed successfully.
- `1`: missing prerequisite, invalid config, or failed system command.
