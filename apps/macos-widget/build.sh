#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
APP_DIR="$ROOT_DIR/dist/LocalghostWidget.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
SOURCE_FILE="$ROOT_DIR/apps/macos-widget/LocalghostWidget.swift"
EXECUTABLE="$MACOS_DIR/LocalghostWidget"
MODULE_CACHE_DIR="${TMPDIR:-/tmp}/localghost-swift-module-cache"

rm -rf "$APP_DIR"
mkdir -p "$MACOS_DIR"
mkdir -p "$MODULE_CACHE_DIR"

swiftc \
  -parse-as-library \
  -O \
  -module-cache-path "$MODULE_CACHE_DIR" \
  -framework AppKit \
  "$SOURCE_FILE" \
  -o "$EXECUTABLE"

cat > "$CONTENTS_DIR/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>LocalghostWidget</string>
  <key>CFBundleIdentifier</key>
  <string>app.localghost.widget</string>
  <key>CFBundleName</key>
  <string>Localghost Widget</string>
  <key>CFBundleDisplayName</key>
  <string>Localghost Widget</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

echo "Built $APP_DIR"
