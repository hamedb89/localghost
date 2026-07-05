# Localghost macOS Widget

The Localghost widget is a tiny native macOS helper. It does not start or stop apps. It reads Localghost's shared activity file directly and shows the known setup/running instances.

The menu-bar title is `LG n`, where `n` is the number of known Localghost setups across the machine. The menu lists each project, working directory, route, target port, and whether the upstream port is listening. One widget tracks all setup instances; you do not run one widget per project. Running/listening routes use the green status dot, while configured but idle routes stay visible without the green state.

The app also opens a small floating desktop widget using the visual direction from `Resources/localghost-widget-ui-reference.png`: dark rounded panel, Localghost title, online count, route rows, ports, and an open-first-host footer. The black/white logo source at `Resources/localghost-logo-source.png` is bundled and processed at runtime into the app image, template menu-bar icon, and white panel logo.

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

The bundle includes:

```txt
Contents/Resources/localghost-logo-source.png
Contents/Resources/localghost-widget-ui-reference.png
```

## Run

If `localghost` is installed on your shell path, launch the app bundle normally.

For source development, point the widget at the repo build:

```sh
LOCALGHOST_CLI="$PWD/dist/cli.js" dist/LocalghostWidget.app/Contents/MacOS/LocalghostWidget
```

## Data Source

The widget reads:

```txt
~/.local/state/localghost/activity.json
```

The CLI can inspect the same state with:

```sh
localghost ps
localghost ps --json
```

The activity file stores setup records plus active run records. `localghost setup` registers configured projects in that shared file. `localghost dev`, `localghost run`, and the Vite plugin overlay active process data on top. `localghost reset` and `localghost teardown` remove the setup from the shared file.

Set `LOCALGHOST_ACTIVITY_PATH` when you want the CLI and widget to share a custom activity file during tests.
