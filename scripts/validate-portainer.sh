#!/bin/sh
# Renderización y comprobación estructural únicamente; nunca hace pull/up/deploy.
set -eu
cd "$(dirname "$0")/.."
IACOC_IMAGE_DIGEST=0000000000000000000000000000000000000000000000000000000000000000 \
IACOC_KEYRING_HOST_FILE=/nonexistent/validation-keyring.json \
docker compose -f deploy/portainer/docker-compose.yml config --format json |
docker run --rm -i --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --entrypoint node node:22-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d --input-type=module -e '
import assert from "node:assert/strict";
let input="";for await(const chunk of process.stdin)input+=chunk;
const compose=JSON.parse(input),service=compose.services["iacoc-web"],labels=service.labels;
assert.match(service.image,/^scm\.cyberfuel\.com\/cyberfuel\/iacp-operation-center@sha256:[a-f0-9]{64}$/);
assert.ok(!service.build&&!service.ports);assert.equal(service.user,"1000:1000");assert.equal(service.read_only,true);
assert.equal(compose.networks.proxy.name,"proxy_network");assert.equal(compose.networks.proxy.external,true);
assert.equal(labels["traefik.enable"],"true");assert.equal(labels["traefik.docker.network"],"proxy_network");
assert.equal(labels["traefik.http.routers.iacoc.rule"],"Host(`iacoc.cyberfuel.com`)");
assert.equal(labels["traefik.http.routers.iacoc.entrypoints"],"websecure");assert.equal(labels["traefik.http.routers.iacoc.tls"],"true");
assert.equal(labels["traefik.http.routers.iacoc.service"],"iacoc");assert.equal(labels["traefik.http.services.iacoc.loadbalancer.server.port"],"3000");
assert.ok(!Object.keys(labels).some(key=>key.includes("certresolver")));
assert.equal(service.environment.PUBLIC_ORIGIN,"https://iacoc.cyberfuel.com");assert.equal(service.environment.TRUST_PROXY,"true");
assert.ok(service.volumes.some(v=>v.type==="volume"&&v.target==="/var/lib/iacoc"));
assert.ok(service.volumes.filter(v=>v.type==="bind").every(v=>v.read_only&&v.target==="/run/secrets/iacoc-keyring.json"));
assert.ok(service.healthcheck&&service.cap_drop.includes("ALL"));
console.log("PORTAINER_MANIFEST_PASS: immutable image, Traefik labels, no published port, persistence and runtime secret verified structurally");'
