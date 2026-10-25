import { it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { createConnection } from "../src/lib/server/connections/service";
import { decryptSecret } from "../src/lib/server/security/crypto";
import { db } from "../src/lib/server/security/database";
it("creates a key once, accepts user credentials only on stdin and rotates the external encryption key", () => {
  const path = dirname(process.env.IACOC_KEYRING_FILE!) + "/cli-keyring.json";
  process.env.IACOC_KEYRING_FILE = path;
  const env = {
    PUBLIC_ORIGIN: "https://iacoc.test",
    IACOC_KEYRING_FILE: path,
    IACOC_DB_PATH: process.env.IACOC_DB_PATH!,
  };
  const command = resolve("scripts/security-admin.mjs");
  const run = (action: string, input?: unknown) =>
    execFileSync(
      process.execPath,
      ["--experimental-strip-types", command, action],
      {
        env,
        input: input ? JSON.stringify(input) : undefined,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
  expect(run("init-key")).toContain("Keyring created");
  const before = readFileSync(path, "utf8");
  expect(statSync(path).mode & 0o777).toBe(0o600);
  expect(() => run("init-key")).toThrow();
  expect(readFileSync(path, "utf8")).toBe(before);
  const password = randomBytes(24).toString("base64url");
  const output = run("user-add", {
    username: "cli.fixture",
    password,
    role: "Administrator",
    tenantId: "demo",
  });
  expect(output).not.toContain(password);
  const token = randomBytes(24).toString("base64url");
  const created = createConnection(
    {
      id: "cli-test",
      username: "cli-test",
      role: "Administrator",
      tenantId: "demo",
    },
    {
      name: "CLI Fixture",
      environment: "development",
      endpoint: "https://iacp-fixture.invalid",
      serviceIdentity: "Reader Fixture",
      credential: token,
    },
  );
  expect(run("rotate-key")).toContain("Key rotation completed");
  const row = db()
    .prepare("SELECT secret FROM connections WHERE id=?")
    .get(created.id) as { secret: string };
  expect(
    decryptSecret(
      row.secret,
      `${created.id}:demo:https://iacp-fixture.invalid`,
    ),
  ).toBe(token);
  expect(JSON.parse(readFileSync(path, "utf8")).active).not.toBe(
    JSON.parse(before).active,
  );
  expect(readFileSync(path, "utf8")).not.toContain(token);
});
