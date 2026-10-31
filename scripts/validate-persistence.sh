#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
docker compose -f deploy/v2/docker-compose.yml --profile test run --rm runner \
  npm run test --workspace @iacoc/bff
echo "V2_PERSISTENCE_PASS"
