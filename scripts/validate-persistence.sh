#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
validation_project=iacoc-security-validation
validation_evidence=iacoc-security-validation-evidence
export IACP_ALLOWED_TARGETS='[{"origin":"https://iacp-fixture.invalid","addresses":["10.40.50.60"]}]'
export LIVE_ENABLED=false
compose(){ docker compose -p "$validation_project" -f docker-compose.production.yml "$@"; }
cleanup(){ compose down --volumes >/dev/null 2>&1 || true; docker volume rm "$validation_evidence" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
compose up -d --build
wait_health(){
  validation_count=0
  until [ "$(docker inspect "$(compose ps -q iacoc-web)" --format '{{.State.Health.Status}}')" = healthy ]; do
    if [ "$validation_count" -ge 45 ]; then compose logs; exit 1; fi
    sleep 1
    validation_count=$((validation_count + 1))
  done
}
wait_health
compose exec -T iacoc-web node --experimental-strip-types scripts/security-admin.mjs init-key
# Principales y secretos aleatorios exclusivamente del entorno desechable de prueba.
compose exec -T iacoc-web node --experimental-strip-types --input-type=module -e '
import {randomBytes} from "node:crypto";import{writeFileSync}from"node:fs";import{createUser}from"/app/src/lib/server/security/auth.ts";
const fixture={username:"persistence.fixture",password:randomBytes(24).toString("base64url"),token:randomBytes(32).toString("base64url")};await createUser(fixture.username,fixture.password,"Administrator","persistence-test");writeFileSync("/var/lib/iacoc/persistence-fixture.json",JSON.stringify(fixture),{mode:0o600});console.log("Disposable fixture initialized; no credentials printed");'
docker volume create "$validation_evidence" >/dev/null
run_browser(){
  docker run --rm --network "container:$(compose ps -q iacoc-web)" --user "${LOCAL_UID:-1000}:${LOCAL_GID:-1000}" --cap-drop ALL --security-opt no-new-privileges:true \
    --mount "type=bind,source=$(pwd)/scripts/verify-persistence.mjs,target=/app/scripts/verify-persistence.mjs,readonly" \
    --mount "type=volume,source=${validation_project}_configuration,target=/fixture,readonly" \
    --mount "type=volume,source=$validation_evidence,target=/app/test-results" \
    --env PLAYWRIGHT_BROWSERS_PATH=/ms-playwright --entrypoint node iacoc:test-0.1.0 /app/scripts/verify-persistence.mjs "$1"
}
run_browser before
compose up -d --force-recreate --no-build
wait_health
run_browser after
