# Localghost macOS Widget

The Localghost widget is a tiny native macOS menu-bar helper. It does not start or stop apps. It only shows what Localghost already knows is running from `localghost ps --json`.

The menu-bar title is `LG n`, where `n` is the number of active Localghost-managed sessions. The menu lists each project, wrapper PID, working directory, route, target port, and whether the upstream port is listening.

## Build

Build the CLI first, then build the app bundle:

```sh
npm run build
npm run macos:widget:build
```

The app is written to:

```txt
dist/LocalghostWidget.app
```

## Run

If `localghost` is installed on your shell path, launch the app bundle normally.

For source development, point the widget at the repo build:

```sh
LOCALGHOST_CLI="$PWD/dist/cli.js" dist/LocalghostWidget.app/Contents/MacOS/LocalghostWidget
```

## Data Source

The widget polls:

```sh
localghost --no-update-check ps --json
```

That command reads the user-local activity file, prunes stale records, and probes each upstream port. The activity file defaults to:

```txt
~/.local/state/localghost/activity.json
```

Set `LOCALGHOST_ACTIVITY_PATH` when you want the CLI and widget to share a custom activity file during tests.
