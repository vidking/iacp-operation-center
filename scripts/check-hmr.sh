#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
hmr_css=src/lib/styles/console.css
hmr_original=$(mktemp)
hmr_log=$(mktemp)
hmr_container="iacoc-hmr-$$"
cp "$hmr_css" "$hmr_original"
cleanup() {
  cp "$hmr_original" "$hmr_css"
  docker stop "$hmr_container" >/dev/null 2>&1 || true
  rm "$hmr_original" "$hmr_log"
}
trap cleanup EXIT INT TERM
docker compose up -d iacoc-web
docker compose --profile test run --rm --no-deps --name "$hmr_container" --entrypoint node iacoc-tests scripts/check-hmr.mjs >"$hmr_log" 2>&1 &
hmr_pid=$!
hmr_count=0
until grep -q HMR_READY "$hmr_log"; do
  if ! kill -0 "$hmr_pid" 2>/dev/null || [ "$hmr_count" -ge 40 ]; then cat "$hmr_log"; exit 1; fi
  sleep 1
  hmr_count=$((hmr_count + 1))
done
printf '\n:root { --iacoc-hmr-probe: confirmed; }\n' >>"$hmr_css"
wait "$hmr_pid"
cat "$hmr_log"
grep -q HMR_PASS "$hmr_log"
