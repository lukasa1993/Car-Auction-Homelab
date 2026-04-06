#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="$(mktemp)"
ENV_FILE="${AUCTION_HEADED_BROWSER_ENV_FILE:-$ROOT_DIR/.auction-headed-browser.env}"
trap 'rm -f "$LOG_FILE"' EXIT

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

export AUCTION_REQUIRED_DISPLAY="${AUCTION_REQUIRED_DISPLAY:-${OPENCLAW_HEADED_DISPLAY:-:99}}"
export DISPLAY="${DISPLAY:-$AUCTION_REQUIRED_DISPLAY}"
export AUCTION_HEADED_BROWSER_URL="${AUCTION_HEADED_BROWSER_URL:-${OPENCLAW_HEADED_BROWSER_URL:-}}"
export AUCTION_HEADED_BROWSER_FALLBACK_URL="${AUCTION_HEADED_BROWSER_FALLBACK_URL:-${OPENCLAW_HEADED_BROWSER_FALLBACK_URL:-}}"
export AUCTION_HEADED_BROWSER_PASSWORD="${AUCTION_HEADED_BROWSER_PASSWORD:-${OPENCLAW_HEADED_BROWSER_PASSWORD:-}}"

PUBLIC_KEY_FILE="${AUCTION_COLLECTOR_PUBLIC_KEY_FILE:-$ROOT_DIR/runner-keys/collector-signing-key.pub.pem}"

set +e
bun "$ROOT_DIR/collector/bootstrap.ts" --public-key-file "$PUBLIC_KEY_FILE" "$@" >"$LOG_FILE" 2>&1
STATUS=$?
set -e

if [[ $STATUS -eq 0 ]]; then
  if [[ "${AUCTION_COLLECTOR_VERBOSE:-0}" == "1" ]]; then
    cat "$LOG_FILE"
  fi
  exit 0
fi

cat "$LOG_FILE" >&2
printf '\n' >&2
if [[ -n "$AUCTION_HEADED_BROWSER_URL" ]]; then
  printf 'Shared headed browser: %s\n' "$AUCTION_HEADED_BROWSER_URL" >&2
fi
if [[ -n "$AUCTION_HEADED_BROWSER_FALLBACK_URL" ]]; then
  printf 'Fallback browser: %s\n' "$AUCTION_HEADED_BROWSER_FALLBACK_URL" >&2
fi
if [[ -n "$AUCTION_HEADED_BROWSER_PASSWORD" ]]; then
  printf 'Password: %s\n' "$AUCTION_HEADED_BROWSER_PASSWORD" >&2
fi
if [[ -z "$AUCTION_HEADED_BROWSER_URL" && -z "$AUCTION_HEADED_BROWSER_FALLBACK_URL" && -z "$AUCTION_HEADED_BROWSER_PASSWORD" ]]; then
  printf 'Shared headed browser details are not configured. Set AUCTION_HEADED_BROWSER_URL / AUCTION_HEADED_BROWSER_FALLBACK_URL / AUCTION_HEADED_BROWSER_PASSWORD or provide %s.\n' "$ENV_FILE" >&2
fi
exit "$STATUS"
