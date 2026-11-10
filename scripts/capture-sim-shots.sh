#!/usr/bin/env bash
# Capture Home, Arena, Free Play, a painted map, and Maps on three simulators.
set -euo pipefail

BUNDLE="com.horseshoeroundme.laststandtowerdefense"
ROOT="${RUNNER_TEMP:-/tmp}/sim-screenshots"
APP_PATH="${APP_PATH:?APP_PATH is required}"
mkdir -p "$ROOT"

pick() {
  PATTERN="$1" python3 -c 'import json,os,subprocess,sys
pattern=os.environ["PATTERN"].lower()
data=json.loads(subprocess.check_output(["xcrun","simctl","list","devices","available","-j"]))
for runtime in sorted(data.get("devices", {}), reverse=True):
    for device in data["devices"][runtime]:
        if not device.get("isAvailable", True):
            continue
        name=device.get("name", "")
        if pattern in name.lower():
            print(device["udid"])
            print(name, file=sys.stderr)
            sys.exit(0)
sys.exit(1)'
}

IPAD13="$(pick "ipad pro 13-inch (m4)" || pick "ipad pro 13-inch")"
IPAD11="$(pick "ipad pro 11-inch (m4)" || pick "ipad pro 11-inch")"
IPHONE="$(pick "iphone 17 pro max" || pick "iphone 16 pro max")"
IPHONE_SE="$(pick "iphone se (3rd generation)" || pick "iphone se")"
echo "iPad 13: $IPAD13"
echo "iPad 11: $IPAD11"
echo "iPhone: $IPHONE"
echo "iPhone SE: $IPHONE_SE"

approve_scheme() {
  local udid="$1"
  local plist="$HOME/Library/Developer/CoreSimulator/Devices/$udid/data/Library/Preferences/com.apple.launchservices.schemeapproval.plist"
  mkdir -p "$(dirname "$plist")"
  # iOS 26 reads this at boot. Writing it during the same session still shows "Open in?".
  /usr/libexec/PlistBuddy -c "Clear dict" "$plist" >/dev/null 2>&1 || true
  /usr/libexec/PlistBuddy -c "Add :com.apple.CoreSimulator.CoreSimulatorBridge-->laststandtd string $BUNDLE" "$plist"
}

capture_device() {
  local udid="$1"
  local folder="$2"
  local out="$ROOT/$folder"
  mkdir -p "$out"
  xcrun simctl shutdown all || true
  xcrun simctl boot "$udid" || true
  xcrun simctl bootstatus "$udid" -b
  xcrun simctl install "$udid" "$APP_PATH"
  xcrun simctl shutdown "$udid" || true
  approve_scheme "$udid"
  xcrun simctl boot "$udid"
  xcrun simctl bootstatus "$udid" -b
  xcrun simctl ui "$udid" orientation portrait || true
  shot() {
    local name="$1"
    local url="$2"
    local wait="$3"
    xcrun simctl terminate "$udid" "$BUNDLE" || true
    xcrun simctl openurl "$udid" "$url"
    sleep "$wait"
    xcrun simctl io booted screenshot "$out/$name.png"
  }
  shot home "laststandtd:///" 25
  shot arena "laststandtd:///shop?tab=arena" 18
  shot freeplay-10x14 "laststandtd:///game?proof=classic&size=0" 20
  shot freeplay-16x20 "laststandtd:///game?proof=classic&size=3" 20
  shot painted-boss "laststandtd:///game?proof=ash_pass" 22
  shot maps "laststandtd:///map-selection" 18
  xcrun simctl shutdown "$udid" || true
}

capture_device "$IPAD13" "ipad-13"
capture_device "$IPAD11" "ipad-11"
capture_device "$IPHONE" "iphone-6.9"

# 4.7-inch SE battle, for the compact tray.
mkdir -p "$ROOT/iphone-se"
xcrun simctl shutdown all || true
xcrun simctl boot "$IPHONE_SE" || true
xcrun simctl bootstatus "$IPHONE_SE" -b
xcrun simctl install "$IPHONE_SE" "$APP_PATH"
xcrun simctl shutdown "$IPHONE_SE" || true
approve_scheme "$IPHONE_SE"
xcrun simctl boot "$IPHONE_SE"
xcrun simctl bootstatus "$IPHONE_SE" -b
xcrun simctl ui "$IPHONE_SE" orientation portrait || true
xcrun simctl terminate "$IPHONE_SE" "$BUNDLE" || true
xcrun simctl openurl "$IPHONE_SE" "laststandtd:///game?proof=classic&size=0"
sleep 22
xcrun simctl io booted screenshot "$ROOT/iphone-se/battle.png"
xcrun simctl shutdown "$IPHONE_SE" || true

find "$ROOT" -name '*.png' -print
count="$(find "$ROOT" -name '*.png' | wc -l | tr -d ' ')"
test "$count" -eq 19
