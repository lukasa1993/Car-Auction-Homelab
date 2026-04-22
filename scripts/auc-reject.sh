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
      def normalize_text($value):
        ($value // "")
        | ascii_downcase
        | gsub("[^a-z0-9]+"; " ")
        | gsub("^ +| +$"; "");

      def normalize_location:
        normalize_text(.location);

      def matches_filtered_location:
        normalize_location as $loc
        | ($loc | test("(^| )california( |$)"))
          or ($loc | test("(^| )ca( |$)"))
          or ($loc | test("(^| )washington dc( |$)"))
          or ($loc | test("(^| )washington d c( |$)"))
          or ($loc | test("(^| )district of columbia( |$)"))
          or ($loc | test("(^| )dc( |$)"))
          or ($loc | test("(^| )d c( |$)"));

      .[]
      | select(.carType == $model)
      | select((.workflowState // "" | ascii_downcase) != "rejected")
      | (.color // "" | ascii_downcase) as $color
      | ($colors | index($color)) as $color_match
      | (matches_filtered_location) as $location_match
      | select($color_match or $location_match)
      | .matchReason = (
          [
            if $color_match then "color" else empty end,
            if $location_match then "location" else empty end
          ]
          | join("+")
        )
    ' <<<"$lots_json"
)

if [[ ${#targets[@]} -eq 0 ]]; then
  echo "no matching lots found"
  exit 0
fi

echo "targets:"
printf '%s\n' "${targets[@]}" |
  jq -r '[.id, .lotNumber, .modelYear, .color, .matchReason, .workflowState, .auctionDate, .location] | @tsv' |
  column -t -s $'\t'

for obj in "${targets[@]}"; do
  id="$(jq -r '.id' <<<"$obj")"
  lot="$(jq -r '.lotNumber' <<<"$obj")"
  color="$(jq -r '.color' <<<"$obj")"
  match_reason="$(jq -r '.matchReason' <<<"$obj")"
  location="$(jq -r '.location // ""' <<<"$obj")"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] would reject id=$id lot=$lot color=$color match=$match_reason location=$location"
    continue
  fi

  reject_url="$BASE_URL/lots/$id/reject"
  code="$(
    curl -sS \
      -o /tmp/auc-reject-body.$$ \
      -w '%{http_code}' \
      -X POST \
      -H 'x-auction-request: async' \
      -F 'redirect=/?tab=all' \
      "$reject_url"
  )"

  body="$(tr '\n' ' ' < /tmp/auc-reject-body.$$ | sed 's/[[:space:]]\+/ /g' | head -c 300)"

  if [[ "$code" =~ ^2 ]]; then
    echo "rejected id=$id lot=$lot color=$color match=$match_reason status=$code location=$location"
  else
    echo "FAILED id=$id lot=$lot color=$color match=$match_reason status=$code location=$location body=$body" >&2
  fi
done
