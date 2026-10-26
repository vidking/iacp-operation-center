// Fixture aislada de pruebas: jamás se importa desde el servidor de producción.
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
const port = process.argv[2];
if (!["4173", "4174", "4175", "4176", "4177", "4178", "4179"].includes(port))
  throw new Error("Test port required");
const root = resolve(".artifacts/e2e-" + port);
mkdirSync(root, { recursive: true });
for (const name of ["test.sqlite", "test.sqlite-wal", "test.sqlite-shm"])
  rmSync(root + "/" + name, { force: true });
process.env.PUBLIC_ORIGIN =
  port === "4175" ? "https://127.0.0.1:4443" : "http://127.0.0.1:" + port;
if (port === "4175") process.env.TRUST_PROXY = "true";
process.env.LOCAL_HTTP = "true";
process.env.HOST = "127.0.0.1";
process.env.PORT = port;
process.env.DATA_MODE = "MOCK"; // Regression: an obsolete external value cannot enable fixtures.
process.env.LIVE_ENABLED = "true";
process.env.IACOC_DB_PATH = root + "/test.sqlite";
process.env.IACOC_KEYRING_FILE = root + "/keyring.json";
process.env.IACP_ALLOWED_TARGETS = JSON.stringify([
  {
    origin:
      port === "4176" || port === "4178" || port === "4179"
        ? "https://iac.cyberfuel.com"
        : "https://iacp-fixture.invalid",
    addresses: ["10.40.50.60"],
  },
]);
writeFileSync(
  process.env.IACOC_KEYRING_FILE,
  JSON.stringify({
    active: "test",
    keys: { test: randomBytes(32).toString("base64") },
  }),
  { mode: 0o600 },
);
const { createUser } = await import("../src/lib/server/security/auth.ts");
const credentials = {};
if (port === "4176" || port === "4177" || port === "4178" || port === "4179") {
  process.env.IACOC_TEST_UPSTREAM_FILE = root + "/upstream.json";
  writeFileSync(
    root + "/upstream.json",
    JSON.stringify({
      token: randomBytes(32).toString("base64url"),
      tenant: "fda59e7c-ce1f-4a5e-9a5b-1371ca8c2407",
      revoked: false,
      operatorToken: randomBytes(32).toString("base64url"),
      crm: port === "4178" || port === "4179",
      instances: [],
      operations: [],
      commands: [],
    }),
    { mode: 0o600 },
  );
  if (port === "4177")
    process.env.IACP_ALLOWED_TARGETS = JSON.stringify([
      { origin: "https://iac.cyberfuel.com", addresses: ["10.40.50.60"] },
      {
        origin: "https://iacp-alt-fixture.invalid",
        addresses: ["10.40.50.60"],
      },
    ]);
}
for (const [role, tenantId] of [
  ["Viewer", "demo"],
  ["Operator", "demo"],
  ["Administrator", "demo"],
  ["Administrator", "other"],
]) {
  const key = role + "-" + tenantId,
    username = "e2e." + key.toLowerCase(),
    password = randomBytes(24).toString("base64url");
  await createUser(username, password, role, tenantId);
  credentials[key] = { username, password };
}
mkdirSync("test-results", { recursive: true });
writeFileSync(
  `test-results/credentials-${port}.json`,
  JSON.stringify(credentials),
  { mode: 0o600 },
);
const child = spawn(
  process.execPath,
  [
    "--experimental-strip-types",
    ...(port === "4176" || port === "4177" || port === "4178" || port === "4179"
      ? ["--import", "./scripts/test-upstream-loader.mjs"]
      : []),
    "scripts/start-server.mjs",
    ".artifacts/build",
  ],
  {
    env: process.env,
    stdio: "inherit",
  },
);
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code) => process.exit(code ?? 1));
