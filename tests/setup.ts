import { mkdirSync, writeFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
const root = resolve(".artifacts/unit-" + randomUUID());
mkdirSync(root + "/db", { recursive: true });
mkdirSync(root + "/keys");
writeFileSync(
  root + "/keys/keyring.json",
  JSON.stringify({
    active: "test",
    keys: { test: randomBytes(32).toString("base64") },
  }),
  { mode: 0o600 },
);
process.env.PUBLIC_ORIGIN = "https://iacoc.test";
process.env.IACOC_DB_PATH = root + "/db/test.sqlite";
process.env.IACOC_KEYRING_FILE = root + "/keys/keyring.json";
process.env.IACP_ALLOWED_TARGETS = JSON.stringify([
  { origin: "https://iacp-fixture.invalid", addresses: ["10.40.50.60"] },
]);
process.env.DATA_MODE = "MOCK";
process.env.LIVE_ENABLED = "true";
