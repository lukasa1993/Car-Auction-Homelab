#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL="https://auc.ldev.cloud"
MODEL="TESLA MODEL Y"
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage:
  ./auc-reject.sh [--dry-run] COLOR [COLOR...]

Examples:
  ./auc-reject.sh white
  ./auc-reject.sh WHITE blue Silver
  ./auc-reject.sh --dry-run white black
EOF
}

if [[ $# -eq 0 ]]; then
  usage
  exit 1
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      break
      ;;
  esac
done

[[ $# -gt 0 ]] || { echo "need at least one color" >&2; exit 1; }

command -v curl >/dev/null || { echo "missing curl" >&2; exit 1; }
command -v jq   >/dev/null || { echo "missing jq" >&2; exit 1; }

colors_json="$(
  printf '%s\n' "$@" |
    jq -Rsc 'split("\n") | map(select(length > 0) | ascii_downcase)'
)"

lots_json="$(curl -fsS "$BASE_URL/api/lots")"

mapfile -t targets < <(
  jq -r \
    --arg model "$MODEL" \
    --argjson colors "$colors_json" '
      .[]
      | select(.carType == $model)
      | select((.color // "" | ascii_downcase) as $c | $colors | index($c))
      | select((.workflowState // "" | ascii_downcase) != "rejected")
      | @base64
    ' <<<"$lots_json"
)

if [[ ${#targets[@]} -eq 0 ]]; then
  echo "no matching lots found"
  exit 0
fi

echo "targets:"
for row in "${targets[@]}"; do
  obj="$(printf '%s' "$row" | base64 --decode)"
  jq -r '[.id, .lotNumber, .modelYear, .color, .workflowState, .auctionDate, .location] | @tsv' <<<"$obj"
done | column -t -s $'\t'

for row in "${targets[@]}"; do
  obj="$(printf '%s' "$row" | base64 --decode)"

  id="$(jq -r '.id' <<<"$obj")"
  lot="$(jq -r '.lotNumber' <<<"$obj")"
  color="$(jq -r '.color' <<<"$obj")"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] would reject lot=$lot id=$id color=$color"
    continue
  fi

  code="$(
    curl -sS -o /tmp/auc-reject-body.$$ -w '%{http_code}' \
      -X POST \
      "$BASE_URL/lot/$id/reject"
  )"

  if [[ "$code" =~ ^2 ]]; then
    echo "rejected lot=$lot id=$id color=$color status=$code"
  else
    echo "FAILED lot=$lot id=$id color=$color status=$code body=$(tr '\n' ' ' < /tmp/auc-reject-body.$$ | head -c 300)" >&2
  fi
done