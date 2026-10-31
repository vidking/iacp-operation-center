#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
docker compose -f deploy/v2/docker-compose.yml config --quiet
docker compose -f deploy/v2/docker-compose.yml --profile test build runner
docker compose -f deploy/v2/docker-compose.yml --profile test run --rm runner sh -c \
  'npm run lint && npm run check && npm test && npm run build && npm run test:e2e'
echo "V2_VALIDATION_PASS"
