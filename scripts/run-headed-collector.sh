#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="$(mktemp)"
trap 'rm -f "$LOG_FILE"' EXIT

export AUCTION_REQUIRED_DISPLAY="${AUCTION_REQUIRED_DISPLAY:-${OPENCLAW_HEADED_DISPLAY:-:99}}"
export DISPLAY="${DISPLAY:-$AUCTION_REQUIRED_DISPLAY}"

PUBLIC_KEY_FILE="${AUCTION_COLLECTOR_PUBLIC_KEY_FILE:-$ROOT_DIR/runner-keys/collector-signing-key.pub.pem}"

is_enabled() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|on|ON|debug|DEBUG) return 0 ;;
    *) return 1 ;;
  esac
}

# VIN debug must go through bootstrap so the downloaded built runtime gets the
# candidate-level debug patch injected before execution. Running local TS only
# logs regex construction, which hides where lots are accepted/rejected.
if is_enabled "${AUCTION_COLLECTOR_VERBOSE:-0}" && ! is_enabled "${AUCTION_COLLECTOR_VIN_DEBUG:-0}"; then
  exec bun "$ROOT_DIR/collector/auction-runner.ts" "$@"
fi

set +e
bun "$ROOT_DIR/collector/bootstrap.ts" --public-key-file "$PUBLIC_KEY_FILE" "$@" >"$LOG_FILE" 2>&1
STATUS=$?
set -e

cat "$LOG_FILE" >&2
exit "$STATUS"
