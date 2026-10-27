#!/bin/bash
# Opens a visible, local-only Chromium window from the Docker Playwright image.
# The authenticated context stays in memory and is never exported.
set -euo pipefail
cd "$(dirname "$0")/.."

test -n "${DISPLAY:-}" || {
  echo "DISPLAY is not set; cannot attach a local visible Chromium window." >&2
  exit 1
}
display_id="${DISPLAY#*:}"
display_id="${display_id%%.*}"
test -S "/tmp/.X11-unix/X${display_id}" || {
  echo "The local X socket for DISPLAY=${DISPLAY} is unavailable." >&2
  exit 1
}

docker build --target test --tag iacoc:test-assisted-0.6.3-rc.6 .
evidence_dir="$(mktemp -d /tmp/iacoc-enterprise-evidence.XXXXXX)"
chmod 700 "$evidence_dir"
cleanup() { rm -rf -- "$evidence_dir"; }
trap cleanup EXIT INT TERM
docker_args=(
  run --rm --interactive --tty
  --network bridge
  --user 1000:1000
  --cap-drop ALL
  --security-opt no-new-privileges:true
  --env DISPLAY
  --env PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
  --env IACOC_ENTERPRISE_URL="${IACOC_ENTERPRISE_URL:-https://iacoc.cyberfuel.com}"
  --env IACOC_ASSISTED_EVIDENCE_DIR=/evidence
  --mount type=bind,source=/tmp/.X11-unix,target=/tmp/.X11-unix,readonly
  --mount type=bind,source="$evidence_dir",target=/evidence
  --mount type=bind,source="$PWD/scripts/verify-enterprise-assisted.mjs",target=/app/scripts/verify-enterprise-assisted.mjs,readonly
)
auth_file="${XAUTHORITY:-}"
if [ -n "$auth_file" ] && [ -r "$auth_file" ]; then
  docker_args+=(
    --env XAUTHORITY=/tmp/xauthority
    --mount type=bind,source="$auth_file",target=/tmp/xauthority,readonly
  )
fi
docker_args+=(
  --entrypoint node
  iacoc:test-assisted-0.6.3-rc.6
  --experimental-strip-types scripts/verify-enterprise-assisted.mjs
)
docker "${docker_args[@]}"
