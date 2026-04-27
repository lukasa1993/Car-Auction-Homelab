#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export AUCTION_REQUIRED_DISPLAY="${AUCTION_REQUIRED_DISPLAY:-${OPENCLAW_HEADED_DISPLAY:-:99}}"
export DISPLAY="${DISPLAY:-$AUCTION_REQUIRED_DISPLAY}"

# Headed collector is for local debugging. Run source directly so console.log
# statements in collector/auction-runner.ts are exactly what you see.
exec bun "$ROOT_DIR/collector/auction-runner.ts" "$@"
