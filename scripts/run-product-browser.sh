#!/bin/bash
# Explicit GUI acceptance on the isolated local Docker project; never enterprise Portainer.
set -euo pipefail
cd "$(dirname "$0")/.."
mode="${1:-}"
approval="${2:-}"
case "$mode:$approval" in
  baseline:|read:) ;;
  mutating:--approve-single-disposable-mng) ;;
  *) echo 'REAL_INFRASTRUCTURE_E2E_SUSPENDED: use baseline/read, or the explicit single-disposable-MNG approval.' >&2; exit 1 ;;
esac
ssh -o BatchMode=yes -o ConnectTimeout=8 iacp-controlplane 'sudo -n python3 -c '\''import json;from pathlib import Path;p=Path("/etc/iacp/identity/handoff-integraciones-20261025T222001CR");print(json.dumps({"observation":(p/"lab-operation-center.token").read_text().strip()}))'\''' |
  docker run --rm -i --network container:iacoc-p0-061-iacoc-web-1 --user 1000:1000 --cap-drop ALL --security-opt no-new-privileges:true \
  --mount "type=bind,source=$PWD/scripts/verify-product-gui.mjs,target=/app/scripts/verify-product-gui.mjs,readonly" \
  --mount "type=bind,source=$PWD/scripts/real-e2e-policy.mjs,target=/app/scripts/real-e2e-policy.mjs,readonly" \
  --mount type=volume,source=iacoc-p0-061_configuration,target=/fixture,readonly \
  --mount type=volume,source=iacoc-p0-061_evidence,target=/app/test-results \
  --env PLAYWRIGHT_BROWSERS_PATH=/ms-playwright --entrypoint node iacoc:test-0.1.0 scripts/verify-product-gui.mjs "$mode" "$approval"
