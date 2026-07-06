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

## Targets

The macOS widget code is split into three slices:

```txt
apps/macos-widget/LocalghostWidget.swift
apps/macos-widget/Shared/LocalghostWidgetSnapshot.swift
apps/macos-widget/WidgetExtension/LocalghostDesktopWidget.swift
apps/macos-widget/project.yml
```

- `LocalghostWidget.swift`: menu-bar helper and floating glass desktop panel.
- `Shared/LocalghostWidgetSnapshot.swift`: Codable snapshot contract shared by the helper app and WidgetKit extension.
- `WidgetExtension/LocalghostDesktopWidget.swift`: WidgetKit extension source for a real macOS desktop widget.
- `project.yml`: XcodeGen target definition for the containing app and the WidgetKit extension.

The helper app reads Localghost's live activity file and writes a smaller snapshot to the shared widget store. The WidgetKit target reads that snapshot because system widgets run in an extension context and should not depend on shell commands or arbitrary home-directory paths.

## Run

If `localghost` is installed on your shell path, launch the app bundle normally.

For source development, point the widget at the repo build:

```sh
LOCALGHOST_CLI="$PWD/dist/cli.js" dist/LocalghostWidget.app/Contents/MacOS/LocalghostWidget
```

## Desktop Widget Model

This helper behaves like a desktop widget: it is a small glass panel that can sit on the desktop and is shown or hidden from the menu-bar icon. Install or run it like a normal macOS app, then use the Localghost icon in the top bar to show or hide the panel.

The separate WidgetKit target is the source needed for a system desktop widget. To make it addable from macOS "Edit Widgets":

1. Create or open an Xcode macOS app project for `LocalghostWidget`.
2. Add `LocalghostWidget.swift`, `Shared/LocalghostWidgetSnapshot.swift`, and the resources to the app target.
3. Add a Widget Extension target named `LocalghostDesktopWidgetExtension`.
4. Add `WidgetExtension/LocalghostDesktopWidget.swift` and `Shared/LocalghostWidgetSnapshot.swift` to the extension target.
5. Enable the same App Group on both targets: `group.app.localghost`.
6. Sign and run/open the containing app once.
7. Control-click the desktop, choose `Edit Widgets`, search for `Localghost`, and add the widget.

The raw `npm run macos:widget:build` script builds only the standalone menu-bar helper. WidgetKit discovery requires the Xcode app + extension bundle/signing flow above.

If XcodeGen is installed, generate the Xcode project with:

```sh
cd apps/macos-widget
xcodegen generate
open LocalghostWidget.xcodeproj
```

Then set your development team and App Group identifier before building/running the app from Xcode.

## Data Source

The helper reads:

```txt
~/.local/state/localghost/activity.json
```

The helper writes the WidgetKit snapshot to the App Group container when available:

```txt
group.app.localghost/LocalghostWidgetSnapshot.json
```

The CLI can inspect the same state with:

```sh
localghost ps
localghost ps --json
```

The activity file stores setup records plus active run records. `localghost setup` registers configured projects in that shared file. `localghost dev`, `localghost run`, and the Vite plugin overlay active process data on top. `localghost reset` and `localghost teardown` remove the setup from the shared file.

Set `LOCALGHOST_ACTIVITY_PATH` when you want the CLI and widget to share a custom activity file during tests.
