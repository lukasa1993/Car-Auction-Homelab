#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="$(mktemp)"
trap 'rm -f "$LOG_FILE"' EXIT

export AUCTION_REQUIRED_DISPLAY="${AUCTION_REQUIRED_DISPLAY:-${OPENCLAW_HEADED_DISPLAY:-:99}}"
export DISPLAY="${DISPLAY:-$AUCTION_REQUIRED_DISPLAY}"

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
exit "$STATUS"
