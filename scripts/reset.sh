#!/usr/bin/env bash
# scripts/reset.sh — Wipe every trace of Sotto from this machine.
#
# Useful for:
#   - Testing onboarding from a clean slate
#   - Uninstalling Sotto entirely
#   - Recovering from corrupted settings / keychain state
#
# What gets wiped (macOS):
#   1. Running Sotto processes (force-quit)
#   2. Login-keychain "Safe Storage" entries (Anthropic + OpenAI keys)
#   3. macOS TCC permission grants (Microphone, Screen Recording,
#      Accessibility, AppleEvents) for bundle id com.shanto.sotto
#   4. App user data: settings.json, history.json, secrets.enc, caches
#   5. Login item (if "Launch at login" was enabled)
#
# Does NOT touch:
#   - Source code, git history, node_modules, or dist/ build output
#   - The Chrome extension (uninstall it from chrome://extensions if you want)
#
# Usage:
#   ./scripts/reset.sh           interactive (asks to confirm)
#   ./scripts/reset.sh --yes     non-interactive
#   npm run reset                same as above (interactive)

set -u

APP_NAME="Sotto"
BUNDLE_ID="com.shanto.sotto"
USER_DATA="$HOME/Library/Application Support/sotto"
KEYCHAIN_SERVICE="${APP_NAME} Safe Storage"

# ── helpers ──────────────────────────────────────────────────────────────────
BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'
RED=$'\033[31m'; CYAN=$'\033[36m'; RESET=$'\033[0m'
ok()   { echo "${GREEN}✓${RESET}  $*"; }
skip() { echo "${DIM}·  $*${RESET}"; }
warn() { echo "${YELLOW}!${RESET}  $*"; }
err()  { echo "${RED}✗${RESET}  $*"; }
hdr()  { echo; echo "${CYAN}${BOLD}$*${RESET}"; }

# Require macOS
if [ "$(uname)" != "Darwin" ]; then
  err "This script targets macOS only (you're on $(uname))."
  exit 1
fi

# ── confirm ──────────────────────────────────────────────────────────────────
echo "${BOLD}Reset Sotto${RESET}"
echo "This will wipe all Sotto data on this machine:"
echo "  · Force-quit any running Sotto"
echo "  · Delete keychain entry: \"${KEYCHAIN_SERVICE}\""
echo "  · Reset macOS permission grants for ${BUNDLE_ID}"
echo "  · Remove user data dir:  ${USER_DATA}"
echo "  · Remove login item (auto-launch)"
echo
if [ "${1:-}" != "--yes" ] && [ "${1:-}" != "-y" ]; then
  read -r -p "Continue? [y/N] " ans
  case "${ans}" in
    y|Y|yes|YES) ;;
    *) echo "Aborted."; exit 0 ;;
  esac
fi

# ── 1. force-quit running instances ──────────────────────────────────────────
hdr "1. Quitting Sotto processes"
killed=0
for pat in "${APP_NAME}.app" "${APP_NAME} Helper" "${BUNDLE_ID}"; do
  if pgrep -f "${pat}" >/dev/null 2>&1; then
    pkill -9 -f "${pat}" 2>/dev/null && killed=1
  fi
done
if [ "${killed}" = "1" ]; then
  sleep 1
  ok "Killed running Sotto processes"
else
  skip "No Sotto processes were running"
fi

# ── 2. keychain ──────────────────────────────────────────────────────────────
hdr "2. Removing Safe Storage keychain entry"
# `security delete-generic-password -s SERVICE` removes a generic-password
# item by service name. Exits non-zero if not found — that's fine.
removed=0
while security delete-generic-password -s "${KEYCHAIN_SERVICE}" >/dev/null 2>&1; do
  removed=$((removed + 1))
done
if [ "${removed}" -gt 0 ]; then
  ok "Removed ${removed} keychain entr$( [ "${removed}" = "1" ] && echo y || echo ies ) for \"${KEYCHAIN_SERVICE}\""
else
  skip "No \"${KEYCHAIN_SERVICE}\" entry in login keychain"
fi

# ── 3. TCC (permission grants) ───────────────────────────────────────────────
hdr "3. Resetting macOS permission grants"
for svc in Microphone ScreenCapture Accessibility AppleEvents Camera; do
  if tccutil reset "${svc}" "${BUNDLE_ID}" >/dev/null 2>&1; then
    ok "tccutil reset ${svc}"
  else
    skip "tccutil reset ${svc} (nothing cached)"
  fi
done

# ── 4. user data ─────────────────────────────────────────────────────────────
hdr "4. Removing user data"
if [ -d "${USER_DATA}" ]; then
  size=$(du -sh "${USER_DATA}" 2>/dev/null | awk '{print $1}')
  rm -rf "${USER_DATA}"
  ok "Removed ${USER_DATA} (${size:-?})"
else
  skip "No user data dir at ${USER_DATA}"
fi

# ── 5. login item (auto-launch) ──────────────────────────────────────────────
hdr "5. Removing login item"
# Best-effort; only succeeds if the user previously toggled "Launch at login".
osascript -e "tell application \"System Events\" to delete login item \"${APP_NAME}\"" >/dev/null 2>&1
ok "Login item cleared (if any)"

# ── done ─────────────────────────────────────────────────────────────────────
echo
echo "${GREEN}${BOLD}Reset complete.${RESET}"
echo
echo "Next steps:"
echo "  · Reload the Chrome extension at chrome://extensions"
echo "    (the extension is unchanged but its in-memory heartbeat clock resets"
echo "     on its next service-worker startup)"
echo "  · Launch fresh:  ${BOLD}npm run run:mac${RESET}"
echo "  · Onboarding will appear from step 1."
