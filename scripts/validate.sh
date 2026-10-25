#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
docker buildx build --check --target production .
./scripts/validate-portainer.sh
docker compose config --quiet
docker compose -f docker-compose.production.yml config --quiet
docker compose --profile test build iacoc-tests
docker compose --profile test run --rm iacoc-tests
