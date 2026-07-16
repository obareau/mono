#!/usr/bin/env bash
# On-demand REAL-Android test: serves the production build and runs tests/android/smoke.mjs against
# ACTUAL Chrome on a physical Android device via Playwright's experimental _android API. This is a
# manual check (not part of CI, which uses fast desktop-Chromium emulation) — it exercises the
# touch-only save path, the real per-device canvas limit, and true Android Chrome behaviour.
#
# Requirements:
#   • Android platform-tools (adb) — installed at ~/Android/Sdk/platform-tools.
#   • A phone connected: USB with debugging enabled, OR wireless — `adb connect <phone-ip>:5555`.
#   • Node deps installed (npm ci) so Playwright is available.
# Run with: npm run test:android
set -euo pipefail

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

PORT="${PREVIEW_PORT:-4173}"
PREVIEW_PID=""

# 1) Find a connected device (first one in state "device").
SERIAL="$(adb devices | awk '/\tdevice$/{print $1; exit}')"
if [ -z "$SERIAL" ]; then
  echo "No Android device connected." >&2
  echo "  • USB: enable Developer options → USB debugging, plug in, accept the prompt." >&2
  echo "  • Wireless: enable wireless debugging, then  adb connect <phone-ip>:5555" >&2
  echo "Then re-run: npm run test:android" >&2
  exit 1
fi
export ANDROID_SERIAL="$SERIAL"
echo "› device: $SERIAL ($(adb -s "$SERIAL" shell getprop ro.product.model | tr -d '\r'))"

cleanup() {
  [ -n "$PREVIEW_PID" ] && kill "$PREVIEW_PID" 2>/dev/null || true
  adb -s "$SERIAL" reverse --remove "tcp:$PORT" 2>/dev/null || true
}
trap cleanup EXIT

# 2) Build + serve the production bundle, and reverse-forward it onto the phone's localhost so the
#    device reaches it at http://localhost:$PORT regardless of USB/Wi-Fi/network.
if [ "${SKIP_BUILD:-0}" != "1" ]; then echo "› building…"; npm run build >/dev/null; fi
echo "› serving build on :$PORT"
npx vite preview --host 127.0.0.1 --port "$PORT" --strictPort >/tmp/mono-preview.log 2>&1 &
PREVIEW_PID=$!
until curl -sf "http://localhost:$PORT/" >/dev/null 2>&1; do sleep 1; done
adb -s "$SERIAL" reverse "tcp:$PORT" "tcp:$PORT" >/dev/null

# 3) Run the real-Android smoke test (Playwright _android picks $ANDROID_SERIAL).
echo "› running real-Android smoke test…"
MONO_URL="http://localhost:$PORT/" node tests/android/smoke.mjs
