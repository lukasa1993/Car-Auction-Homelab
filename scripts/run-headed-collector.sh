#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="$(mktemp)"
CONFIG_FILE="$(mktemp)"
trap 'rm -f "$LOG_FILE" "$CONFIG_FILE"' EXIT

export AUCTION_REQUIRED_DISPLAY="${AUCTION_REQUIRED_DISPLAY:-${OPENCLAW_HEADED_DISPLAY:-:99}}"
export DISPLAY="${DISPLAY:-$AUCTION_REQUIRED_DISPLAY}"

PUBLIC_KEY_FILE="${AUCTION_COLLECTOR_PUBLIC_KEY_FILE:-$ROOT_DIR/runner-keys/collector-signing-key.pub.pem}"

is_enabled() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|on|ON|debug|DEBUG) return 0 ;;
    *) return 1 ;;
  esac
}

arg_value() {
  local flag="$1"
  shift
  local previous=""
  for value in "$@"; do
    if [[ "$previous" == "$flag" ]]; then
      printf '%s' "$value"
      return 0
    fi
    previous="$value"
  done
  return 1
}

print_scrape_config_debug() {
  local base_url="${AUCTION_BASE_URL:-https://auc.ldev.cloud}"
  local arg_base_url
  arg_base_url="$(arg_value --base-url "$@" || true)"
  if [[ -n "$arg_base_url" ]]; then
    base_url="$arg_base_url"
  fi
  base_url="${base_url%/}"

  local token="${AUCTION_INGEST_TOKEN:-change-me-ingest}"
  local url="$base_url/api/scrape-config"

  echo "collector debug: GET $url"
  echo "collector debug: authorization: Bearer <redacted>"
  echo "collector debug: cache-control: no-store"

  local status
  status="$({ curl -sS -w '%{http_code}' -H "authorization: Bearer $token" -H 'cache-control: no-store' "$url" -o "$CONFIG_FILE"; } || true)"
  echo "collector debug: scrape-config HTTP $status"

  if [[ "$status" != "200" ]]; then
    echo "collector debug: scrape-config body:" >&2
    cat "$CONFIG_FILE" >&2 || true
    return 0
  fi

  AUCTION_SCRAPE_CONFIG_FILE="$CONFIG_FILE" bun --eval '
    const file = process.env.AUCTION_SCRAPE_CONFIG_FILE;
    const config = JSON.parse(await Bun.file(file).text());
    const targets = Array.isArray(config.targets) ? config.targets : [];
    const normalize = (value) => String(value || "").toUpperCase().replace(/\s+/g, "").replace(/[?*]/g, "*");
    const prefix = (value) => {
      const normalized = normalize(value);
      const index = normalized.indexOf("*");
      return index === -1 ? normalized : normalized.slice(0, index);
    };
    console.log(JSON.stringify({
      message: "collector scrape-config response",
      configVersion: config.configVersion,
      targetCount: targets.length,
      targets: targets.map((target, index) => ({
        index,
        id: target.id,
        key: target.key,
        label: target.label,
        carType: target.carType,
        marker: target.marker,
        vinPattern: target.vinPattern,
        vinPrefix: target.vinPrefix,
        derivedPrefix: prefix(target.vinPattern),
        yearFrom: target.yearFrom,
        yearTo: target.yearTo,
        copartSlug: target.copartSlug,
        iaaiPath: target.iaaiPath,
        enabledCopart: target.enabledCopart,
        enabledIaai: target.enabledIaai,
        active: target.active,
        sortOrder: target.sortOrder,
      })),
    }, null, 2));
  '
}

# Debug runs must use the local TypeScript source, not the downloaded built runtime.
# The built runtime is minified and bootstrap patching can hide or corrupt debug output.
if is_enabled "${AUCTION_COLLECTOR_VERBOSE:-0}" || is_enabled "${AUCTION_COLLECTOR_VIN_DEBUG:-0}"; then
  if is_enabled "${AUCTION_COLLECTOR_VIN_DEBUG:-0}"; then
    print_scrape_config_debug "$@"
  fi
  exec bun "$ROOT_DIR/collector/auction-runner.ts" "$@"
fi

set +e
bun "$ROOT_DIR/collector/bootstrap.ts" --public-key-file "$PUBLIC_KEY_FILE" "$@" >"$LOG_FILE" 2>&1
STATUS=$?
set -e

if [[ $STATUS -eq 0 ]]; then
  exit 0
fi

cat "$LOG_FILE" >&2
exit "$STATUS"
