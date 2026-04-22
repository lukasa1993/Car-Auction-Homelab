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
  ./auc-reject.sh WHITE blue silver
  ./auc-reject.sh --dry-run white
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) break ;;
  esac
done

[[ $# -gt 0 ]] || { usage; exit 1; }

command -v curl >/dev/null || { echo "missing curl" >&2; exit 1; }
command -v jq >/dev/null || { echo "missing jq" >&2; exit 1; }

colors_json="$(
  printf '%s\n' "$@" |
    jq -Rsc 'split("\n") | map(select(length > 0) | ascii_downcase)'
)"

lots_json="$(curl -fsS "$BASE_URL/api/lots")"

mapfile -t targets < <(
  jq -c \
    --arg model "$MODEL" \
    --argjson colors "$colors_json" '
      .[]
      | select(.carType == $model)
      | select((.color // "" | ascii_downcase) as $c | $colors | index($c))
      | select((.workflowState // "" | ascii_downcase) != "rejected")
    ' <<<"$lots_json"
)

if [[ ${#targets[@]} -eq 0 ]]; then
  echo "no matching lots found"
  exit 0
fi

echo "targets:"
printf '%s\n' "${targets[@]}" |
  jq -r '[.id, .lotNumber, .modelYear, .color, .workflowState, .auctionDate, .location] | @tsv' |
  column -t -s $'\t'

for obj in "${targets[@]}"; do
  id="$(jq -r '.id' <<<"$obj")"
  lot="$(jq -r '.lotNumber' <<<"$obj")"
  color="$(jq -r '.color' <<<"$obj")"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] would reject id=$id lot=$lot color=$color"
    continue
  fi

  code="$(
    curl -sS \
      -o /tmp/auc-reject-body.$$ \
      -w '%{http_code}' \
      -X POST \
      -H 'x-auction-request: async' \
      -F 'redirect=/?tab=all' \
      "$BASE_URL/lots/$id/reject"
  )"

  body="$(tr '\n' ' ' < /tmp/auc-reject-body.$$ | sed 's/[[:space:]]\+/ /g' | head -c 300)"

  if [[ "$code" =~ ^2 ]]; then
    echo "rejected id=$id lot=$lot color=$color status=$code"
  else
    echo "FAILED id=$id lot=$lot color=$color status=$code body=$body" >&2
  fi
done